# FulfillmentAllocationService

This service creates a fulfillment plan for a paid order.

It decides which inventory batches should be reserved, which warehouses should ship the products, and which carriers should be used.

Dependencies:

- OrderRepository: retrieves order data
- InventoryRepository: retrieves inventory batches
- WarehouseRepository: retrieves warehouse metadata
- CarrierRepository: retrieves carrier options for the destination region
- ReservationRepository: retrieves already reserved quantities and saves new reservations
- EventBus: publishes fulfillment events

Business rules combine:

1. Order status validation
2. Inventory availability
3. Existing reservations
4. Batch expiration
5. Warehouse eligibility
6. Carrier eligibility
7. Allocation priority
8. Partial fulfillment
9. Shipment grouping
10. Shipping cost calculation
11. Reservation persistence
12. Fulfillment event publication

Only paid orders can be fulfilled.

The service should allocate available stock from eligible warehouses and carriers, create grouped shipments, save reservations for allocated quantities, and return a fulfillment plan indicating whether the order was fully, partially, or not fulfilled.