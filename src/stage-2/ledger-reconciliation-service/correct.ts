import {
  InternalLedgerRepository,
  BankStatementProvider,
  AuditLogger,
  ReconciliationResult
} from '../../stage-1/ledger-reconciliation-service/contract/interfaces';

export class LedgerReconciliationService {
  constructor(
    private internalRepository: InternalLedgerRepository,
    private bankProvider: BankStatementProvider,
    private auditLogger: AuditLogger
  ) {}

  async execute(input: {
    startDate: string;
    endDate: string;
  }): Promise<ReconciliationResult> {
    const internal =
      await this.internalRepository.getEntries(
        input.startDate,
        input.endDate
      );

    const bank =
      await this.bankProvider.getEntries(
        input.startDate,
        input.endDate
      );

    const result: ReconciliationResult = {
      matched: [],
      missingInternal: [],
      unexpectedBank: [],
      duplicatedBank: [],
      amountMismatch: []
    };

    const bankGrouped = new Map<string, any[]>();

    for (const entry of bank) {
      const list =
        bankGrouped.get(entry.reference) || [];
      list.push(entry);
      bankGrouped.set(entry.reference, list);
    }

    for (const item of internal) {
      const bankItems =
        bankGrouped.get(item.reference);

      if (!bankItems) {
        result.missingInternal.push(
          item.reference
        );
        continue;
      }

      if (bankItems.length > 1) {
        result.duplicatedBank.push(
          item.reference
        );

        const hasMatchingAmount = bankItems.some(
          bankEntry => bankEntry.amount === item.amount
        );

        if (!hasMatchingAmount) {
          result.amountMismatch.push(
            item.reference
          );
        }

        continue;
      }

      const bankEntry = bankItems[0];

      if (bankEntry.amount !== item.amount) {
        result.amountMismatch.push(
          item.reference
        );
        continue;
      }

      result.matched.push(item.reference);
    }

    const internalRefs = new Set(
      internal.map(i => i.reference)
    );

    for (const bankEntry of bank) {
      if (
        !internalRefs.has(bankEntry.reference)
      ) {
        result.unexpectedBank.push(
          bankEntry.reference
        );
      }
    }

    await this.auditLogger.log(result);

    return result;
  }
}
