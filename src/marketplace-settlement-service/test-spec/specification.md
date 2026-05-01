The generated test suite must validate:

1. Empty order list returns empty settlement result and still saves it.
2. Repository dependencies are called with correct ids and date range.
3. Gross is calculated from quantity * unitPrice.
4. Refunds are assigned to the correct seller through orderItemId.
5. Multiple refunds for the same item are summed.
6. Refunds cannot reduce an item below zero.
7. Shipping is split proportionally by seller net item value within the same order.
8. Shipping share is zero when all items in an order are fully refunded.
9. Commission is calculated per item after refunds and before shipping.
10. Missing commission rule means 0% commission.
11. Chargebacks are allocated proportionally by seller net item value after refunds.
12. Chargeback allocation is zero when all items in an order are fully refunded.
13. Fixed fee of 1.50 applies only when value before fixed fee is positive.
14. Net cannot be negative.
15. HIGH risk sellers are marked as held but still have net calculated.
16. LOW and MEDIUM risk sellers are not held.
17. totalGross equals the sum of seller gross.
18. totalNet equals the sum of seller net.
19. Returned result and saved result are identical.
20. Mixed scenario with multiple orders, multiple sellers, refunds, chargebacks, commissions, shipping split, and held seller.
21. Final monetary fields are rounded to 2 decimal places.