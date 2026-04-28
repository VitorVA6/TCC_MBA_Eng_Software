The generated test suite must validate:

1. Should approve low-risk transactions
2. Should review medium-risk transactions
3. Should block high-risk transactions
4. Should throw error when amount is zero or negative
5. Should increase scrutiny when country risk is high
6. Should increase scrutiny when amount is much higher than historical average
7. Should increase scrutiny when many transactions happened in last 24h
8. VIP users should have reduced risk impact
9. Should call dependencies with correct arguments
10. Should notify user when decision is REVIEW
11. Should notify user when decision is BLOCKED
12. Should not notify on APPROVED
13. Should always write audit log with decision result
14. Should support combined risk factors