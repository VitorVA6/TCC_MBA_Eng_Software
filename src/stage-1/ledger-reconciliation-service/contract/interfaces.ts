export interface InternalEntry {
  id: string;
  reference: string;
  amount: number;
  date: string;
}

export interface BankEntry {
  id: string;
  reference: string;
  amount: number;
  date: string;
}

export interface InternalLedgerRepository {
  getEntries(
    startDate: string,
    endDate: string
  ): Promise<InternalEntry[]>;
}

export interface BankStatementProvider {
  getEntries(
    startDate: string,
    endDate: string
  ): Promise<BankEntry[]>;
}

export interface AuditLogger {
  log(data: unknown): Promise<void>;
}

export interface ReconciliationResult {
  matched: string[];
  missingInternal: string[];
  unexpectedBank: string[];
  duplicatedBank: string[];
  amountMismatch: string[];
}
