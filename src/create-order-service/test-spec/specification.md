The generated test suite must validate:

1. Successful order creation with valid items
2. Should throw error when items list is empty
3. Should throw error when quantity is zero or negative
4. Should throw error when product does not exist
5. Should throw error when requested quantity exceeds stock
6. Should calculate subtotal for each item correctly
7. Should calculate total order amount correctly
8. Should persist order with correct data
9. Should publish "order.created" event after successful save
10. Should not publish event if save fails
11. Repository methods must receive correct arguments
12. Should support multiple items in same order