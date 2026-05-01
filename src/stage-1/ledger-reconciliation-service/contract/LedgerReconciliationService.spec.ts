import { LedgerReconciliationService } from '../mutations/mutation3';
import {
  InternalLedgerRepository,
  BankStatementProvider,
  AuditLogger,
  InternalEntry,
  BankEntry
} from './interfaces';

describe('LedgerReconciliationService', () => {
  let service: LedgerReconciliationService;
  let internalRepository: jest.Mocked<InternalLedgerRepository>;
  let bankProvider: jest.Mocked<BankStatementProvider>;
  let auditLogger: jest.Mocked<AuditLogger>;

  beforeEach(() => {
    internalRepository = {
      getEntries: jest.fn(),
    };
    bankProvider = {
      getEntries: jest.fn(),
    };
    auditLogger = {
      log: jest.fn(),
    };

    service = new LedgerReconciliationService(
      internalRepository,
      bankProvider,
      auditLogger
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const startDate = '2023-01-01';
  const endDate = '2023-01-31';

  it('1. should match entries with exact references and amounts successfully', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-1', amount: 100, date: '2023-01-10' }
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-1', amount: 100, date: '2023-01-10' }
    ];

    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.matched).toEqual(['ref-1']);
    expect(result.missingInternal).toEqual([]);
    expect(result.unexpectedBank).toEqual([]);
    expect(result.duplicatedBank).toEqual([]);
    expect(result.amountMismatch).toEqual([]);
  });

  it('2. should identify internal entries missing in bank statement', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-1', amount: 100, date: '2023-01-10' }
    ];
    
    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(result.missingInternal).toEqual(['ref-1']);
    expect(result.matched).toEqual([]);
  });

  it('3. should identify unexpected bank entries missing internally', async () => {
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-unexp', amount: 50, date: '2023-01-11' }
    ];

    internalRepository.getEntries.mockResolvedValue([]);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.unexpectedBank).toEqual(['ref-unexp']);
  });

  it('4. should identify duplicate bank references and not match them (12. Ensure duplicate entries are not classified as matched)', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-dup', amount: 100, date: '2023-01-10' }
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-dup', amount: 100, date: '2023-01-10' },
      { id: 'b2', reference: 'ref-dup', amount: 100, date: '2023-01-10' }
    ];

    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.duplicatedBank).toEqual(['ref-dup']);
    expect(result.matched).not.toContain('ref-dup');
  });

  it('5. should detect amount mismatch for matched references', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-mismatch', amount: 100, date: '2023-01-10' }
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-mismatch', amount: 150, date: '2023-01-10' }
    ];

    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.amountMismatch).toEqual(['ref-mismatch']);
    expect(result.matched).toEqual([]);
  });

  it('6. should handle mixed scenarios correctly in same execution (10. Output structure correctness)', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-match', amount: 100, date: '2023-01-10' },
      { id: '2', reference: 'ref-miss', amount: 200, date: '2023-01-11' },
      { id: '3', reference: 'ref-diff', amount: 300, date: '2023-01-12' },
      { id: '4', reference: 'ref-dup-int', amount: 400, date: '2023-01-13' }
    ];
    
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-match', amount: 100, date: '2023-01-10' },
      { id: 'b2', reference: 'ref-unexp', amount: 250, date: '2023-01-11' },
      { id: 'b3', reference: 'ref-diff', amount: 350, date: '2023-01-12' },
      { id: 'b4', reference: 'ref-dup-int', amount: 400, date: '2023-01-13' },
      { id: 'b5', reference: 'ref-dup-int', amount: 400, date: '2023-01-13' }
    ];

    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result).toEqual({
      matched: ['ref-match'],
      missingInternal: ['ref-miss'],
      unexpectedBank: ['ref-unexp'],
      duplicatedBank: ['ref-dup-int'],
      amountMismatch: ['ref-diff']
    });
  });

  it('7. should return empty output arrays for empty datasets', async () => {
    internalRepository.getEntries.mockResolvedValue([]);
    bankProvider.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(result).toEqual({
      matched: [],
      missingInternal: [],
      unexpectedBank: [],
      duplicatedBank: [],
      amountMismatch: []
    });
  });

  it('8. should call dependencies with correct date range', async () => {
    internalRepository.getEntries.mockResolvedValue([]);
    bankProvider.getEntries.mockResolvedValue([]);

    await service.execute({ startDate, endDate });

    expect(internalRepository.getEntries).toHaveBeenCalledWith(startDate, endDate);
    expect(bankProvider.getEntries).toHaveBeenCalledWith(startDate, endDate);
    expect(internalRepository.getEntries).toHaveBeenCalledTimes(1);
    expect(bankProvider.getEntries).toHaveBeenCalledTimes(1);
  });

  it('9. should always execute audit logger with final output', async () => {
    internalRepository.getEntries.mockResolvedValue([]);
    bankProvider.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(result);
  });

  it('11. should handle multiple internal records with different references correctly', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-a', amount: 10, date: '2023-01-01' },
      { id: '2', reference: 'ref-b', amount: 20, date: '2023-01-02' }
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-a', amount: 10, date: '2023-01-01' },
      { id: 'b2', reference: 'ref-b', amount: 20, date: '2023-01-02' }
    ];

    internalRepository.getEntries.mockResolvedValue(internalEntries);
    bankProvider.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.matched).toEqual(['ref-a', 'ref-b']);
  });
});
