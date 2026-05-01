# MarketplaceSettlementService

This service calculates marketplace settlements for sellers within a date range.

It receives orders, order items, refunds, chargebacks, seller risk data, and commission rules.
It must produce a settlement summary per seller and global totals.

Dependencies:

- OrderRepository: returns orders in the requested period
- OrderItemRepository: returns items for the selected orders
- RefundRepository: returns refunds for selected order items
- ChargebackRepository: returns chargebacks for selected orders
- SellerRepository: returns seller metadata
- CommissionRepository: returns commission percentage rules by category
- SettlementRepository: persists the final settlement result

Business rules combine:

1. Order items grouped by seller
2. Gross sales calculation
3. Refund deduction
4. Proportional shipping allocation
5. Category-based commission
6. Proportional chargeback allocation
7. Seller risk evaluation
8. Fixed settlement fee
9. Net settlement calculation
10. Global settlement totals

The service should return one settlement per seller and persist the final settlement result.