The generated test suite must validate:

1. Trial users are not charged
2. Past due users are blocked
3. Normal active monthly charge
4. Upgrade prorated billing
5. Downgrade charged only current plan
6. Active coupon discount
7. Inactive coupon ignored
8. VIP extra discount after coupon
9. Taxes applied after discounts
10. Amount never negative
11. Zero amount does not charge gateway
12. Gateway called with correct amount
13. Combined coupon + VIP + tax scenario
14. Upgrade with coupon and tax
15. Correct blocked response
16. Correct dependency calls