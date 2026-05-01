The generated test suite must validate:

1. Returns NOT_FULFILLED when order does not exist
2. Returns NOT_FULFILLED for PENDING orders
3. Returns NOT_FULFILLED for CANCELLED orders
4. Fetches inventory batches using all product ids from the order
5. Fetches reserved quantities using all batch ids
6. Ignores expired batches
7. Considers existing reserved quantities when calculating available stock
8. Ignores inactive warehouses
9. Ignores warehouses that do not support the destination region
10. Ignores carriers that do not support the destination region
11. Ignores carriers whose maxWeightKg is smaller than item unitWeightKg
12. Allocates inventory from eligible batches
13. Supports allocation across multiple batches for the same product
14. Supports allocation across multiple warehouses
15. Chooses faster carrier before cheaper carrier
16. Chooses cheaper carrier when deliveryDays are equal
17. Chooses earliest expiring batch when carrier priority is equal
18. Uses warehouse priority as tie-breaker
19. Produces deterministic results when ids are used as final tie-breakers
20. Creates shipments grouped by warehouse and carrier
21. Calculates totalWeightKg per shipment
22. Calculates shippingCost using baseCost + costPerKg * totalWeightKg
23. Calculates totalShippingCost as the sum of shipment shipping costs
24. Saves reservations for all allocated quantities
25. Returns FULFILLED when all items are fully allocated
26. Returns PARTIALLY_FULFILLED when at least one item is not fully allocated
27. Returns NOT_FULFILLED when no item can be allocated
28. Reports unfulfilled items with requestedQuantity and fulfilledQuantity
29. Publishes fulfillment.fulfilled when fully fulfilled
30. Publishes fulfillment.partial when partially fulfilled
31. Does not publish event when nothing is fulfilled
32. Handles mixed scenario with multiple products, warehouses, carriers, reservations, expired batches and partial stock
33. Final monetary and weight values are rounded to 2 decimal places