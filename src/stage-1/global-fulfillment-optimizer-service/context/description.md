# GlobalFulfillmentOptimizerService

This service creates an optimized fulfillment plan for a paid order.

It must decide which warehouses should fulfill each product and which delivery route should be used from each warehouse to the destination.

Dependencies:

- OrderRepository: retrieves the order
- StockRepository: retrieves stock positions for requested products
- WarehouseRepository: retrieves warehouse metadata
- RouteRepository: retrieves the delivery route graph
- FulfillmentPlanRepository: persists the generated plan
- EventBus: publishes fulfillment events

Business rules combine:

1. Order status validation
2. Stock availability
3. Active warehouse filtering
4. Route graph traversal
5. Route feasibility by weight and delivery time
6. Global cost minimization
7. Partial fulfillment
8. Shipment grouping by warehouse
9. Deterministic tie-breaking
10. Persistence and event publication

Only PAID orders can be fulfilled.

The service should search for a globally optimized plan, not just choose the cheapest option for each item independently.

The result should indicate whether the order was fully fulfilled, partially fulfilled, or not fulfilled.