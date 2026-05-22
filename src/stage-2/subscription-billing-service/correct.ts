import {
  UserRepository,
  PlanRepository,
  SubscriptionRepository,
  CouponRepository,
  TaxService,
  PaymentGateway,
  BillingResult
} from '../../stage-1/subscription-billing-service/contract/interfaces';

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
    const user = await this.userRepository.findById(
      input.userId
    );

    const subscription =
      await this.subscriptionRepository.findByUserId(
        input.userId
      );

    if (subscription.status === 'TRIAL') {
      return { amount: 0, blocked: false };
    }

    if (subscription.status === 'PAST_DUE') {
      return {
        amount: 0,
        blocked: true,
        reason: 'PAST_DUE'
      };
    }

    const currentPlan =
      await this.planRepository.findById(
        subscription.currentPlanId
      );

    let amount = currentPlan.monthlyPrice;

    if (subscription.targetPlanId) {
      const targetPlan =
        await this.planRepository.findById(
          subscription.targetPlanId
        );

      if (
        targetPlan.monthlyPrice >
        currentPlan.monthlyPrice
      ) {
        const diff =
          targetPlan.monthlyPrice -
          currentPlan.monthlyPrice;

        const billableDays = Math.min(
          subscription.daysRemaining,
          30
        );

        amount =
          diff *
          (billableDays / 30);
      }
    }

    if (input.couponCode) {
      const coupon =
        await this.couponRepository.findByCode(
          input.couponCode
        );

      if (coupon && coupon.active) {
        amount =
          amount *
          (1 - coupon.percentage / 100);
      }
    }

    if (user.isVip) {
      amount = amount * 0.9;
    }

    const taxRate =
      await this.taxService.getRate(
        user.country
      );

    amount = amount * (1 + taxRate / 100);

    if (amount < 0) amount = 0;

    amount = Number(amount.toFixed(2));

    if (amount > 0) {
      await this.paymentGateway.charge(
        user.id,
        amount
      );
    }

    return {
      amount,
      blocked: false
    };
  }
}
