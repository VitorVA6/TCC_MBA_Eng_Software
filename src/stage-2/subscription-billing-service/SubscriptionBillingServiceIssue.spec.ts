import { SubscriptionBillingService } from './correct';
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
} from './../../stage-1/subscription-billing-service/contract/interfaces';

describe('SubscriptionBillingService', () => {
  let userRepository: jest.Mocked<UserRepository>;
  let planRepository: jest.Mocked<PlanRepository>;
  let subscriptionRepository: jest.Mocked<SubscriptionRepository>;
  let couponRepository: jest.Mocked<CouponRepository>;
  let taxService: jest.Mocked<TaxService>;
  let paymentGateway: jest.Mocked<PaymentGateway>;
  let service: SubscriptionBillingService;

  beforeEach(() => {
    userRepository = { findById: jest.fn() };
    planRepository = { findById: jest.fn() };
    subscriptionRepository = { findByUserId: jest.fn() };
    couponRepository = { findByCode: jest.fn() };
    taxService = { getRate: jest.fn() };
    paymentGateway = { charge: jest.fn() };

    service = new SubscriptionBillingService(
      userRepository,
      planRepository,
      subscriptionRepository,
      couponRepository,
      taxService,
      paymentGateway
    );
  });

  const mockUser = (overrides?: Partial<User>): User => ({
    id: 'user-123',
    country: 'US',
    isVip: false,
    ...overrides
  });

  const mockPlan = (overrides?: Partial<Plan>): Plan => ({
    id: 'plan-1',
    monthlyPrice: 100,
    ...overrides
  });

  const mockSubscription = (overrides?: Partial<Subscription>): Subscription => ({
    userId: 'user-123',
    currentPlanId: 'plan-1',
    targetPlanId: null,
    status: 'ACTIVE',
    daysRemaining: 15,
    ...overrides
  });

  const mockCoupon = (overrides?: Partial<Coupon>): Coupon => ({
    code: 'SAVE20',
    percentage: 20,
    active: true,
    ...overrides
  });

  const setupMocks = (
    user: User,
    subscription: Subscription,
    currentPlan: Plan,
    taxRate: number = 0,
    targetPlan?: Plan,
    coupon?: Coupon
  ) => {
    userRepository.findById.mockResolvedValue(user);
    subscriptionRepository.findByUserId.mockResolvedValue(subscription);
    planRepository.findById.mockImplementation(async (id: string) => {
      if (id === currentPlan.id) return currentPlan;
      if (targetPlan && id === targetPlan.id) return targetPlan;
      throw new Error(`Plan ${id} not found`);
    });
    taxService.getRate.mockResolvedValue(taxRate);
    if (coupon) {
      couponRepository.findByCode.mockResolvedValue(coupon);
    } else {
      couponRepository.findByCode.mockResolvedValue(null);
    }
  };

  it('1. Trial users are not charged', async () => {
    setupMocks(
      mockUser(),
      mockSubscription({ status: 'TRIAL' }),
      mockPlan()
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(0);
    expect(result.blocked).toBe(false);
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('2. Past due users are blocked', async () => {
    setupMocks(
      mockUser(),
      mockSubscription({ status: 'PAST_DUE' }),
      mockPlan()
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(0);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeDefined();
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('3. Normal active monthly charge', async () => {
    setupMocks(
      mockUser(),
      mockSubscription({ status: 'ACTIVE' }),
      mockPlan({ monthlyPrice: 100 }),
      0 // No tax
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(100);
    expect(result.blocked).toBe(false);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 100);
  });

  it('4. Upgrade prorated billing', async () => {
    const currentPlan = mockPlan({ id: 'plan-1', monthlyPrice: 100 });
    const targetPlan = mockPlan({ id: 'plan-2', monthlyPrice: 200 });
    
    setupMocks(
      mockUser(),
      mockSubscription({ currentPlanId: 'plan-1', targetPlanId: 'plan-2', daysRemaining: 15 }),
      currentPlan,
      0,
      targetPlan
    );

    const result = await service.execute({ userId: 'user-123' });

    // Prorated difference: (200 - 100) * (15 / 30) = 50
    expect(result.amount).toBe(50);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 50);
  });

  it('5. Downgrade charged only current plan', async () => {
    const currentPlan = mockPlan({ id: 'plan-2', monthlyPrice: 200 });
    const targetPlan = mockPlan({ id: 'plan-1', monthlyPrice: 100 });

    setupMocks(
      mockUser(),
      mockSubscription({ currentPlanId: 'plan-2', targetPlanId: 'plan-1' }),
      currentPlan,
      0,
      targetPlan
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(200);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 200);
  });

  it('6. Active coupon discount', async () => {
    const coupon = mockCoupon({ percentage: 20, active: true });
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan({ monthlyPrice: 100 }),
      0,
      undefined,
      coupon
    );

    const result = await service.execute({ userId: 'user-123', couponCode: 'SAVE20' });

    expect(result.amount).toBe(80);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 80);
  });

  it('7. Inactive coupon ignored', async () => {
    const coupon = mockCoupon({ percentage: 20, active: false });
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan({ monthlyPrice: 100 }),
      0,
      undefined,
      coupon
    );

    const result = await service.execute({ userId: 'user-123', couponCode: 'SAVE20' });

    expect(result.amount).toBe(100);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 100);
  });

  it('8. VIP extra discount after coupon', async () => {
    const coupon = mockCoupon({ percentage: 20, active: true });
    setupMocks(
      mockUser({ isVip: true }),
      mockSubscription(),
      mockPlan({ monthlyPrice: 100 }),
      0,
      undefined,
      coupon
    );

    const result = await service.execute({ userId: 'user-123', couponCode: 'SAVE20' });

    // Base: 100. After 20% coupon: 80. After 10% VIP discount on 80: 72.
    expect(result.amount).toBe(72);
  });

  it('9. Taxes applied after discounts', async () => {
    setupMocks(
      mockUser({ country: 'UK' }),
      mockSubscription(),
      mockPlan({ monthlyPrice: 100 }),
      20 // 20% tax
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(120);
  });

  it('10. Amount never negative', async () => {
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan({ monthlyPrice: -10 }), // Forcing a negative scenario
      0
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(0);
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('11. Zero amount does not charge gateway', async () => {
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan({ monthlyPrice: 0 }),
      0
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(0);
    expect(paymentGateway.charge).not.toHaveBeenCalled();
  });

  it('12. Gateway called with correct amount', async () => {
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan({ monthlyPrice: 150 }),
      0
    );

    await service.execute({ userId: 'user-123' });

    expect(paymentGateway.charge).toHaveBeenCalledTimes(1);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 150);
  });

  it('13. Combined coupon + VIP + tax scenario', async () => {
    const coupon = mockCoupon({ percentage: 50, active: true }); // 50% off
    setupMocks(
      mockUser({ isVip: true }), // 10% off
      mockSubscription(),
      mockPlan({ monthlyPrice: 200 }),
      10, // 10% tax
      undefined,
      coupon
    );

    const result = await service.execute({ userId: 'user-123', couponCode: 'SAVE50' });

    // 200 -> 50% off = 100.
    // VIP 10% off of 100 = 90.
    // 10% tax on 90 = +9. Total = 99.
    expect(result.amount).toBe(99);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 99);
  });

  it('14. Upgrade with coupon and tax', async () => {
    const currentPlan = mockPlan({ id: 'plan-1', monthlyPrice: 100 });
    const targetPlan = mockPlan({ id: 'plan-2', monthlyPrice: 300 });
    const coupon = mockCoupon({ percentage: 10, active: true });
    
    setupMocks(
      mockUser(),
      mockSubscription({ currentPlanId: 'plan-1', targetPlanId: 'plan-2', daysRemaining: 15 }),
      currentPlan,
      5, // 5% tax
      targetPlan,
      coupon
    );

    const result = await service.execute({ userId: 'user-123', couponCode: 'SAVE10' });

    // Difference: 300 - 100 = 200
    // Prorated difference (15 days): 200 * (15/30) = 100
    // Coupon 10% off of 100 = 90
    // Tax 5% of 90 = 4.5
    // Total = 94.5
    expect(result.amount).toBe(94.5);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 94.5);
  });

  it('15. Correct blocked response', async () => {
    setupMocks(
      mockUser(),
      mockSubscription({ status: 'PAST_DUE' }),
      mockPlan()
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result).toEqual({
      amount: 0,
      blocked: true,
      reason: expect.any(String)
    });
  });

  it('16. Correct dependency calls', async () => {
    setupMocks(
      mockUser(),
      mockSubscription(),
      mockPlan(),
      0.10
    );

    await service.execute({ userId: 'user-123' });

    expect(userRepository.findById).toHaveBeenCalledWith('user-123');
    expect(subscriptionRepository.findByUserId).toHaveBeenCalledWith('user-123');
    expect(planRepository.findById).toHaveBeenCalledWith('plan-1');
    expect(taxService.getRate).toHaveBeenCalledWith('US');
  });

  it('17. Upgrade proportional billing caps daysRemaining at 30', async () => {
    const currentPlan = mockPlan({ id: 'plan-1', monthlyPrice: 100 });
    const targetPlan = mockPlan({ id: 'plan-2', monthlyPrice: 300 });

    setupMocks(
      mockUser({ isVip: false }),
      mockSubscription({
        status: 'ACTIVE',
        currentPlanId: 'plan-1',
        targetPlanId: 'plan-2',
        daysRemaining: 45
      }),
      currentPlan,
      10, // 10% tax
      targetPlan
    );

    const result = await service.execute({ userId: 'user-123' });

    expect(result.amount).toBe(220);
    expect(result.blocked).toBe(false);
    expect(paymentGateway.charge).toHaveBeenCalledWith('user-123', 220);
  });
});
