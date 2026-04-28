# FraudAnalysisService

This service evaluates financial transactions for fraud risk.

Dependencies:

- UserRepository: determines VIP users
- TransactionRepository: provides user transaction history
- RiskEngine: returns country risk score (0 to 100)
- NotificationService: sends alerts
- AuditLogger: stores audit logs

Decision outcomes:

- APPROVED
- REVIEW
- BLOCKED

Business rules combine:

1. Transaction amount
2. User average historical amount
3. Number of recent transactions
4. Country risk score
5. VIP status