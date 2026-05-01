import {
  UserRepository,
  PlanRepository,
  SubscriptionRepository,
  CouponRepository,
  TaxService,
  PaymentGateway,
  BillingResult
} from '../contract/interfaces';

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
    throw new Error('Not implemented');
  }
}