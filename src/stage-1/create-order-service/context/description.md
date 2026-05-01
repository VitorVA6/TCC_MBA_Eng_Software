# CreateOrderService

This service creates customer orders.

Dependencies:

- ProductRepository: retrieves product data
- OrderRepository: persists orders
- EventBus: publishes integration events

Business flow:

1. Validate received items
2. Retrieve products by id
3. Validate stock availability
4. Calculate order subtotal per item
5. Calculate total order amount
6. Persist order
7. Publish "order.created" event
8. Return created order