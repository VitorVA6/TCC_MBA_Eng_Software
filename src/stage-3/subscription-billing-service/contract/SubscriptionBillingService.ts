import {
  UserRepository,
  PlanRepository,
  SubscriptionRepository,
  CouponRepository,
  TaxService,
  PaymentGateway,
  BillingResult
} from './interfaces';

export class SubscriptionBillingService {
  constructor(
    private userRepository: UserRepository,
    private planRepository: PlanRepository,
    private subscriptionRepository: SubscriptionRepository,
    private couponRepository: CouponRepository,
    private taxService: TaxService,
    private paymentGateway: PaymentGateway
  ) {}

  async execute(input: {
    userId: string;
    couponCode?: string;
  }): Promise<BillingResult> {
    const { userId, couponCode } = input;

    const user = await this.userRepository.findById(userId);
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (subscription.status === 'TRIAL') {
      return { amount: 0, blocked: false };
    }

    if (subscription.status === 'PAST_DUE') {
      return { amount: 0, blocked: true, reason: 'User is PAST_DUE' };
    }

    const currentPlan = await this.planRepository.findById(subscription.currentPlanId);
    let amount = currentPlan.monthlyPrice;

    if (subscription.targetPlanId) {
      const targetPlan = await this.planRepository.findById(subscription.targetPlanId);
      if (targetPlan.monthlyPrice > currentPlan.monthlyPrice) {
        const difference = targetPlan.monthlyPrice - currentPlan.monthlyPrice;
        amount = difference * (subscription.daysRemaining / 30);
      }
    }

    if (couponCode) {
      const coupon = await this.couponRepository.findByCode(couponCode);
      if (coupon && coupon.active) {
        amount -= amount * (coupon.percentage / 100);
      }
    }

    if (user.isVip) {
      amount -= amount * 0.10;
    }

    const taxRate = await this.taxService.getRate(user.country);
    if (taxRate > 0) {
      amount += amount * (taxRate / 100);
    }

    if (amount < 0) {
      amount = 0;
    }

    if (amount > 0) {
      await this.paymentGateway.charge(userId, amount);
    }

    return { amount, blocked: false };
  }
}
