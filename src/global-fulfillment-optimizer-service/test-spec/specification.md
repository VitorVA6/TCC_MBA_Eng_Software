The generated test suite must validate:

1. Returns NOT_FULFILLED when order does not exist
2. Returns NOT_FULFILLED for PENDING orders
3. Returns NOT_FULFILLED for CANCELLED orders
4. Fetches stock using all unique product ids from the order
5. Ignores stock from inactive warehouses
6. Ignores stock positions with zero quantity
7. Ignores inactive route edges
8. Finds a valid multi-hop route from warehouse to destination
9. Ignores routes whose maxWeightKg is smaller than shipment total weight
10. Ignores routes whose total deliveryDays exceeds order maxDeliveryDays
11. Groups allocations by warehouse
12. Calculates shipment totalWeightKg correctly
13. Calculates route cost as sum of fixedCost plus costPerKg times shipment weight for each edge in the path
14. Minimizes total cost globally
15. Does not use greedy per-item allocation when it produces higher total cost
16. Supports splitting fulfillment across multiple warehouses when necessary
17. Prefers full fulfillment over cheaper partial fulfillment
18. Returns PARTIALLY_FULFILLED when only part of the order can be fulfilled
19. Returns NOT_FULFILLED when no item can be fulfilled
20. Reports unfulfilled items with requestedQuantity and fulfilledQuantity
21. Uses deterministic tie-breaking when two plans have same fulfilled quantity and same total cost
22. Saves the same result returned by execute
23. Publishes fulfillment.optimized when fully fulfilled
24. Publishes fulfillment.partial when partially fulfilled
25. Does not publish event when nothing is fulfilled
26. Final monetary and weight fields are rounded to 2 decimal places