import {
  InternalLedgerRepository,
  BankStatementProvider,
  AuditLogger,
  ReconciliationResult
} from './interfaces';

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
    const internalEntries = await this.internalRepository.getEntries(
      input.startDate,
      input.endDate
    );
    const bankEntries = await this.bankProvider.getEntries(
      input.startDate,
      input.endDate
    );

    const result: ReconciliationResult = {
      matched: [],
      missingInternal: [],
      unexpectedBank: [],
      duplicatedBank: [],
      amountMismatch: [],
    };

    const internalRefs = new Map<string, number>();
    for (const entry of internalEntries) {
      internalRefs.set(entry.reference, entry.amount);
    }

    const bankRefs = new Map<string, { count: number; amount: number }>();
    for (const entry of bankEntries) {
      const existing = bankRefs.get(entry.reference);
      if (existing) {
        existing.count++;
      } else {
        bankRefs.set(entry.reference, { count: 1, amount: entry.amount });
      }
    }

    for (const [ref, internalAmount] of internalRefs.entries()) {
      const bankData = bankRefs.get(ref);

      if (!bankData) {
        result.missingInternal.push(ref);
      } else if (bankData.count > 1) {
        result.duplicatedBank.push(ref);
      } else if (bankData.amount !== internalAmount) {
        result.amountMismatch.push(ref);
      } else {
        result.matched.push(ref);
      }
    }

    for (const [ref, bankData] of bankRefs.entries()) {
      if (!internalRefs.has(ref)) {
        if (bankData.count > 1) {
          result.duplicatedBank.push(ref);
        } else {
          result.unexpectedBank.push(ref);
        }
      }
    }

    await this.auditLogger.log(result);

    return result;
  }
}
