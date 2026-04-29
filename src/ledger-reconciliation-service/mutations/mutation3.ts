import {
  InternalLedgerRepository,
  BankStatementProvider,
  AuditLogger,
  ReconciliationResult
} from '../contract/interfaces';

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
