# LedgerReconciliationService

This service reconciles internal financial records with bank statement entries.

Dependencies:

- InternalLedgerRepository: returns internal entries
- BankStatementProvider: returns bank statement entries
- AuditLogger: stores reconciliation execution logs

Matching rules:

1. Entries are matched by reference.
2. If multiple bank entries share same reference, they are duplicates.
3. If matched references have different amounts, classify as amountMismatch.
4. Internal entries without bank match are missingInternal.
5. Bank entries without internal match are unexpectedBank.
6. Correct matches go to matched.

Output must contain lists of references.
Audit log must always be written.