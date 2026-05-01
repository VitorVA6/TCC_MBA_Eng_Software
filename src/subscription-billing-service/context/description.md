# SubscriptionBillingService

This service calculates and charges the current billing cycle.

Dependencies:

- UserRepository
- PlanRepository
- SubscriptionRepository
- CouponRepository
- TaxService
- PaymentGateway

Rules:

1. TRIAL users are not charged.
2. PAST_DUE users are blocked and no charge happens.
3. ACTIVE users are charged normally.
4. If targetPlanId exists and target plan is more expensive than current:
   charge only proportional difference using daysRemaining / 30.
5. If targetPlanId exists and target plan is cheaper:
   downgrade only next cycle, current charge remains current plan price.
6. Valid active coupon applies percentage discount before taxes.
7. VIP users receive additional 10 percent discount after coupon.
8. Tax is applied after all discounts.
9. Final amount cannot be negative.
10. If final amount is zero, no charge happens.
11. PaymentGateway is called only when amount > 0 and not blocked.
12. Return blocked reason when blocked.