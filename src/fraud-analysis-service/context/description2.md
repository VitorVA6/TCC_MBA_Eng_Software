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

Fraud score calculation:

Country risk:
- 70 or higher: +3 points
- 40 to 69: +1 point

Transaction amount compared to historical average:
- greater than 3x average: +3 points
- greater than 1.5x average: +1 point

Transactions in last 24 hours:
- 10 or more: +2 points
- 5 to 9: +1 point

VIP users:
- reduce final score by 1 point

Decision thresholds:

- score 0 to 2: APPROVED
- score 3 to 5: REVIEW
- score 6 or more: BLOCKED

Notifications:

- REVIEW => notifyReview
- BLOCKED => notifyBlocked
- APPROVED => no notification

Audit log must always be written.