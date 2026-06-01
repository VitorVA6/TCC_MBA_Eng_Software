import { LedgerReconciliationService } from './correct';
import {
  InternalLedgerRepository,
  BankStatementProvider,
  AuditLogger,
  InternalEntry,
  BankEntry
} from '../../stage-1/ledger-reconciliation-service/contract/interfaces';

describe('LedgerReconciliationService', () => {
  let internalRepositoryMock: jest.Mocked<InternalLedgerRepository>;
  let bankProviderMock: jest.Mocked<BankStatementProvider>;
  let auditLoggerMock: jest.Mocked<AuditLogger>;
  let service: LedgerReconciliationService;

  beforeEach(() => {
    internalRepositoryMock = {
      getEntries: jest.fn(),
    };
    bankProviderMock = {
      getEntries: jest.fn(),
    };
    auditLoggerMock = {
      log: jest.fn(),
    };

    service = new LedgerReconciliationService(
      internalRepositoryMock,
      bankProviderMock,
      auditLoggerMock
    );
  });

  const startDate = '2023-01-01';
  const endDate = '2023-01-31';

  it('1. Deve corresponder lançamentos exatos com sucesso', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.matched).toEqual(['ref1']);
    expect(result.missingInternal).toEqual([]);
    expect(result.unexpectedBank).toEqual([]);
    expect(result.duplicatedBank).toEqual([]);
    expect(result.amountMismatch).toEqual([]);
  });

  it('2. Deve identificar lançamentos internos ausentes no extrato bancário', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.missingInternal).toEqual(['ref1']);
    expect(result.matched).toEqual([]);
  });

  it('3. Deve identificar lançamentos bancários inesperados', async () => {
    const internalEntries: InternalEntry[] = [];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.unexpectedBank).toEqual(['ref1']);
    expect(result.matched).toEqual([]);
  });

  it('4. Deve identificar referências bancárias duplicadas', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref1', amount: 100, date: '2023-01-10' },
      { id: 'b2', reference: 'ref1', amount: 100, date: '2023-01-11' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.duplicatedBank).toEqual(['ref1']);
  });

  it('5. Deve detectar divergência de valor', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref1', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref1', amount: 200, date: '2023-01-10' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.amountMismatch).toEqual(['ref1']);
    expect(result.matched).toEqual([]);
  });

  it('6. Deve lidar com cenários mistos na mesma execução', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-match', amount: 100, date: '2023-01-10' },
      { id: '2', reference: 'ref-missing-internal', amount: 50, date: '2023-01-10' },
      { id: '3', reference: 'ref-mismatch', amount: 75, date: '2023-01-10' },
      { id: '4', reference: 'ref-dup', amount: 200, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-match', amount: 100, date: '2023-01-10' },
      { id: 'b3', reference: 'ref-mismatch', amount: 80, date: '2023-01-10' },
      { id: 'b4', reference: 'ref-unexpected', amount: 30, date: '2023-01-10' },
      { id: 'b5', reference: 'ref-dup', amount: 200, date: '2023-01-10' },
      { id: 'b6', reference: 'ref-dup', amount: 200, date: '2023-01-11' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.matched).toEqual(['ref-match']);
    expect(result.missingInternal).toEqual(['ref-missing-internal']);
    expect(result.unexpectedBank).toEqual(['ref-unexpected']);
    expect(result.duplicatedBank).toEqual(['ref-dup']);
    expect(result.amountMismatch).toEqual(['ref-mismatch']);
  });

  it('7. Deve lidar com conjuntos de dados vazios', async () => {
    internalRepositoryMock.getEntries.mockResolvedValue([]);
    bankProviderMock.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(result).toEqual({
      matched: [],
      missingInternal: [],
      unexpectedBank: [],
      duplicatedBank: [],
      amountMismatch: [],
    });
  });

  it('8. Deve chamar dependências com o intervalo de datas correto', async () => {
    internalRepositoryMock.getEntries.mockResolvedValue([]);
    bankProviderMock.getEntries.mockResolvedValue([]);

    await service.execute({ startDate, endDate });

    expect(internalRepositoryMock.getEntries).toHaveBeenCalledWith(startDate, endDate);
    expect(bankProviderMock.getEntries).toHaveBeenCalledWith(startDate, endDate);
  });

  it('9. Deve sempre executar o log de auditoria', async () => {
    internalRepositoryMock.getEntries.mockResolvedValue([]);
    bankProviderMock.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(auditLoggerMock.log).toHaveBeenCalledWith(result);
  });

  it('10. Deve retornar a estrutura de saída correta', async () => {
    internalRepositoryMock.getEntries.mockResolvedValue([]);
    bankProviderMock.getEntries.mockResolvedValue([]);

    const result = await service.execute({ startDate, endDate });

    expect(result).toHaveProperty('matched');
    expect(result).toHaveProperty('missingInternal');
    expect(result).toHaveProperty('unexpectedBank');
    expect(result).toHaveProperty('duplicatedBank');
    expect(result).toHaveProperty('amountMismatch');
  });

  it('11. Deve suportar múltiplos registros internos com referências diferentes', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref1', amount: 100, date: '2023-01-10' },
      { id: '2', reference: 'ref2', amount: 200, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref1', amount: 100, date: '2023-01-10' },
      { id: 'b2', reference: 'ref2', amount: 200, date: '2023-01-10' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.matched).toEqual(['ref1', 'ref2']);
  });

  it('12. Deve garantir que lançamentos duplicados não sejam classificados como correspondidos', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'ref-dup', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'ref-dup', amount: 100, date: '2023-01-10' },
      { id: 'b2', reference: 'ref-dup', amount: 100, date: '2023-01-11' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.duplicatedBank).toEqual(['ref-dup']);
    expect(result.matched).not.toContain('ref-dup');
  });

  it('13. Deve registrar divergência de valor mesmo quando houver lançamentos bancários duplicados', async () => {
    const internalEntries: InternalEntry[] = [
      { id: '1', reference: 'PAY-001', amount: 100, date: '2023-01-10' },
    ];
    const bankEntries: BankEntry[] = [
      { id: 'b1', reference: 'PAY-001', amount: 90, date: '2023-01-10' },
      { id: 'b2', reference: 'PAY-001', amount: 90, date: '2023-01-10' },
    ];

    internalRepositoryMock.getEntries.mockResolvedValue(internalEntries);
    bankProviderMock.getEntries.mockResolvedValue(bankEntries);

    const result = await service.execute({ startDate, endDate });

    expect(result.duplicatedBank).toContain('PAY-001');
    expect(result.amountMismatch).toContain('PAY-001');
    expect(result.matched).not.toContain('PAY-001');
  });
});
