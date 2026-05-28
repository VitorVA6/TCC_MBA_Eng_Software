import { SubscriptionBillingService } from '../solution/correct';
import {
  UserRepository,
  PlanRepository,
  SubscriptionRepository,
  CouponRepository,
  TaxService,
  PaymentGateway,
  User,
  Plan,
  Subscription,
  Coupon
} from './interfaces';

describe('SubscriptionBillingService', () => {
  let service: SubscriptionBillingService;
  let userRepository: jest.Mocked<UserRepository>;
  let planRepository: jest.Mocked<PlanRepository>;
  let subscriptionRepository: jest.Mocked<SubscriptionRepository>;
  let couponRepository: jest.Mocked<CouponRepository>;
  let taxService: jest.Mocked<TaxService>;
  let paymentGateway: jest.Mocked<PaymentGateway>;

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
    };
    planRepository = {
      findById: jest.fn(),
    };
    subscriptionRepository = {
      findByUserId: jest.fn(),
    };
    couponRepository = {
      findByCode: jest.fn(),
    };
    taxService = {
      getRate: jest.fn(),
    };
    paymentGateway = {
      charge: jest.fn(),
    };

    service = new SubscriptionBillingService(
      userRepository,
      planRepository,
      subscriptionRepository,
      couponRepository,
      taxService,
      paymentGateway
    );
  });

  // Setup helper
  const setupMocks = (overrides?: {
    user?: Partial<User>;
    subscription?: Partial<Subscription>;
    currentPlan?: Partial<Plan>;
    targetPlan?: Partial<Plan>;
    coupon?: Partial<Coupon> | null;
    taxRate?: number;
  }) => {
    const user: User = { id: 'u1', country: 'BR', isVip: false, ...overrides?.user };
    const subscription: Subscription = { userId: 'u1', currentPlanId: 'p1', targetPlanId: null, status: 'ACTIVE', daysRemaining: 0, ...overrides?.subscription };
    const currentPlan: Plan = { id: 'p1', monthlyPrice: 100, ...overrides?.currentPlan };
    
    userRepository.findById.mockResolvedValue(user);
    subscriptionRepository.findByUserId.mockResolvedValue(subscription);
    
    planRepository.findById.mockImplementation(async (id: string) => {
      if (id === subscription.currentPlanId) return currentPlan;
      if (id === subscription.targetPlanId && overrides?.targetPlan) return overrides.targetPlan as Plan;
      throw new Error(`Plan not found: ${id}`);
    });

    if (overrides?.coupon !== undefined) {
      couponRepository.findByCode.mockResolvedValue(overrides.coupon as Coupon | null);
    } else {
      couponRepository.findByCode.mockResolvedValue(null);
    }

    taxService.getRate.mockResolvedValue(overrides?.taxRate ?? 0);
  };

  it('1. Não deve cobrar usuários trial', async () => {
    setupMocks({
      subscription: { status: 'TRIAL' }
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result).toMatchObject({ amount: 0, blocked: false });
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('2. Deve bloquear usuários past due (em atraso)', async () => {
    setupMocks({
      subscription: { status: 'PAST_DUE' }
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result).toMatchObject({ amount: 0, blocked: true });
    expect(result.reason).toBeDefined();
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('3. Deve cobrar normalmente o ciclo mensal ativo', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 100 }
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result).toMatchObject({ amount: 100, blocked: false });
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 100);
  });

  it('4. Deve cobrar o valor proporcional (prorated) para o upgrade', async () => {
    setupMocks({
      currentPlan: { id: 'p1', monthlyPrice: 100 },
      targetPlan: { id: 'p2', monthlyPrice: 200 },
      subscription: { currentPlanId: 'p1', targetPlanId: 'p2', daysRemaining: 15 } // diff 100 * (15/30) = 50. Total = 100 + 50 = 150
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result.amount).toBe(150);
    expect(result.blocked).toBe(false);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 150);
  });

  it('5. Deve cobrar apenas o plano atual para o downgrade', async () => {
    setupMocks({
      currentPlan: { id: 'p2', monthlyPrice: 200 },
      targetPlan: { id: 'p1', monthlyPrice: 100 },
      subscription: { currentPlanId: 'p2', targetPlanId: 'p1', daysRemaining: 15 }
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result).toMatchObject({ amount: 200, blocked: false });
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 200);
  });

  it('6. Deve aplicar desconto de cupom ativo', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC20', percentage: 20, active: true }
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC20' });

    expect(result.amount).toBe(80);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 80);
  });

  it('7. Deve ignorar cupom inativo', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC20', percentage: 20, active: false }
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC20' });

    expect(result.amount).toBe(100);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 100);
  });

  it('8. Deve aplicar desconto extra VIP após o cupom', async () => {
    setupMocks({
      user: { isVip: true },
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC20', percentage: 20, active: true }
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC20' });

    // 100 - 20% = 80
    // 80 - 10% (VIP) = 72
    expect(result.amount).toBe(72);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 72);
  });

  it('9. Deve aplicar impostos após os descontos', async () => {
    setupMocks({
      user: { isVip: true },
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC20', percentage: 20, active: true },
      taxRate: 10 // 10% tax
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC20' });

    // 100 - 20% = 80
    // 80 - 10% VIP = 72
    // 72 + 10% TAX = 79.2
    expect(result.amount).toBe(79.2);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 79.2);
  });

  it('10. Nunca deve resultar em um valor negativo', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC110', percentage: 110, active: true }
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC110' });

    expect(result.amount).toBe(0);
  });

  it('11. Não deve cobrar no gateway quando o valor for zero', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC100', percentage: 100, active: true }
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'DISC100' });

    expect(result.amount).toBe(0);
    expect(result.blocked).toBe(false);
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('12. Deve chamar o gateway com o valor correto', async () => {
    setupMocks({
      currentPlan: { monthlyPrice: 150 }
    });

    await service.execute({ userId: 'u1' });

    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 150);
  });

  it('13. Deve lidar com cenário combinado de cupom, VIP e imposto', async () => {
    setupMocks({
      user: { isVip: true, country: 'BR' },
      currentPlan: { monthlyPrice: 200 },
      coupon: { code: 'HALFOFF', percentage: 50, active: true },
      taxRate: 5 // 5% tax
    });

    const result = await service.execute({ userId: 'u1', couponCode: 'HALFOFF' });

    // Base: 200
    // Coupon (50%): -100 = 100
    // VIP (10%): -10 = 90
    // Tax (5%): +4.5 = 94.5
    expect(result.amount).toBe(94.5);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', 94.5);
  });

  it('14. Deve lidar com upgrade com cupom e imposto', async () => {
    setupMocks({
      user: { isVip: false, country: 'US' },
      currentPlan: { id: 'p1', monthlyPrice: 100 },
      targetPlan: { id: 'p2', monthlyPrice: 220 },
      subscription: { currentPlanId: 'p1', targetPlanId: 'p2', daysRemaining: 10 },
      coupon: { code: 'DISC10', percentage: 10, active: true },
      taxRate: 20 // 20%
    });

    // Base = 100
    // Upgrade = (220 - 100) * (10 / 30) = 120 * 0.3333333333333333 = 40
    // Total antes dos descontos = 100 + 40 = 140
    // Cupom (10%) = -14 = 126
    // VIP = não
    // Imposto (20%) = 126 * 0.2 = 25.2
    // Final = 126 + 25.2 = 151.2
    const result = await service.execute({ userId: 'u1', couponCode: 'DISC10' });

    expect(result.amount).toBeCloseTo(151.2);
    expect(paymentGateway.charge).toHaveBeenCalledWith('u1', expect.closeTo(151.2));
  });

  it('15. Deve retornar a resposta de bloqueio correta', async () => {
    setupMocks({
      subscription: { status: 'PAST_DUE' }
    });

    const result = await service.execute({ userId: 'u1' });

    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe('string');
  });

  it('16. Deve chamar as dependências corretamente', async () => {
    setupMocks({
      user: { country: 'CA' },
      currentPlan: { monthlyPrice: 100 },
      coupon: { code: 'DISC', percentage: 10, active: true }
    });

    await service.execute({ userId: 'u1', couponCode: 'DISC' });

    expect(userRepository.findById).toHaveBeenCalledWith('u1');
    expect(subscriptionRepository.findByUserId).toHaveBeenCalledWith('u1');
    expect(planRepository.findById).toHaveBeenCalledWith('p1');
    expect(couponRepository.findByCode).toHaveBeenCalledWith('DISC');
    expect(taxService.getRate).toHaveBeenCalledWith('CA');
  });
});
