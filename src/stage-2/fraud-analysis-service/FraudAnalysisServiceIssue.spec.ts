import { FraudAnalysisService } from './correct';
import {
  UserRepository,
  TransactionRepository,
  RiskEngine,
  NotificationService,
  AuditLogger,
  TransactionInput
} from '../../stage-1/fraud-analysis-service/contract/interfaces';

describe('FraudAnalysisService', () => {
  let userRepository: jest.Mocked<UserRepository>;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let riskEngine: jest.Mocked<RiskEngine>;
  let notificationService: jest.Mocked<NotificationService>;
  let auditLogger: jest.Mocked<AuditLogger>;
  let fraudAnalysisService: FraudAnalysisService;

  beforeEach(() => {
    userRepository = {
      isVip: jest.fn(),
    };
    transactionRepository = {
      getHistory: jest.fn(),
    };
    riskEngine = {
      getCountryRisk: jest.fn(),
    };
    notificationService = {
      notifyReview: jest.fn(),
      notifyBlocked: jest.fn(),
    };
    auditLogger = {
      log: jest.fn(),
    };

    fraudAnalysisService = new FraudAnalysisService(
      userRepository,
      transactionRepository,
      riskEngine,
      notificationService,
      auditLogger
    );

    // Default mock returns for a "0 risk" baseline
    userRepository.isVip.mockResolvedValue(false);
    transactionRepository.getHistory.mockResolvedValue({
      averageAmount: 100,
      transactionsLast24h: 1,
    });
    riskEngine.getCountryRisk.mockResolvedValue(10);
  });

  const createBaseInput = (overrides?: Partial<TransactionInput>): TransactionInput => ({
    userId: 'user-123',
    amount: 100,
    country: 'BR',
    ...overrides,
  });

  it('4. Deve lançar um erro quando o valor for zero ou negativo', async () => {
    await expect(fraudAnalysisService.execute(createBaseInput({ amount: 0 }))).rejects.toThrow();
    await expect(fraudAnalysisService.execute(createBaseInput({ amount: -50 }))).rejects.toThrow();
  });

  it('1. Deve aprovar transações de baixo risco', async () => {
    // Score: 0 (country < 40: 0, amount <= 1.5x: 0, txs < 5: 0, vip: 0)
    const result = await fraudAnalysisService.execute(createBaseInput());
    expect(result).toBe('APPROVED');
  });

  it('2. Deve revisar transações de médio risco', async () => {
    // Score: 3 (country >= 70: +3, amount <= 1.5x: 0, txs < 5: 0, vip: 0)
    riskEngine.getCountryRisk.mockResolvedValue(75);
    const result = await fraudAnalysisService.execute(createBaseInput());
    expect(result).toBe('REVIEW');
  });

  it('3. Deve bloquear transações de alto risco', async () => {
    // Score: 6 (country >= 70: +3, amount > 3x: +3, txs < 5: 0, vip: 0)
    riskEngine.getCountryRisk.mockResolvedValue(80);
    transactionRepository.getHistory.mockResolvedValue({
      averageAmount: 100,
      transactionsLast24h: 1,
    });
    const result = await fraudAnalysisService.execute(createBaseInput({ amount: 400 }));
    expect(result).toBe('BLOCKED');
  });

  it('5. Deve aumentar o escrutínio quando o risco do país for alto', async () => {
    // Score: 1 (country >= 40: +1) => APPROVED
    riskEngine.getCountryRisk.mockResolvedValue(50);
    expect(await fraudAnalysisService.execute(createBaseInput())).toBe('APPROVED');

    // Score: 3 (country >= 70: +3) => REVIEW
    riskEngine.getCountryRisk.mockResolvedValue(70);
    expect(await fraudAnalysisService.execute(createBaseInput())).toBe('REVIEW');
  });

  it('6. Deve aumentar o escrutínio quando o valor for muito maior que a média histórica', async () => {
    // Score: 1 (amount > 1.5x: +1) => APPROVED
    expect(await fraudAnalysisService.execute(createBaseInput({ amount: 160 }))).toBe('APPROVED');

    // Score: 3 (amount > 3x: +3) => REVIEW
    expect(await fraudAnalysisService.execute(createBaseInput({ amount: 350 }))).toBe('REVIEW');
  });

  it('7. Deve aumentar o escrutínio quando muitas transações ocorreram nas últimas 24 horas', async () => {
    // Score: 1 (txs >= 5: +1) => APPROVED
    transactionRepository.getHistory.mockResolvedValue({ averageAmount: 100, transactionsLast24h: 6 });
    expect(await fraudAnalysisService.execute(createBaseInput())).toBe('APPROVED');

    // Score: 2 (txs >= 10: +2) => APPROVED
    transactionRepository.getHistory.mockResolvedValue({ averageAmount: 100, transactionsLast24h: 12 });
    expect(await fraudAnalysisService.execute(createBaseInput())).toBe('APPROVED');
  });

  it('8. Deve reduzir o impacto do risco para usuários VIP', async () => {
    // Score without VIP: 3 (country >= 70: +3) => REVIEW
    // Score with VIP: 3 - 1 = 2 => APPROVED
    riskEngine.getCountryRisk.mockResolvedValue(75);
    userRepository.isVip.mockResolvedValue(true);
    
    const result = await fraudAnalysisService.execute(createBaseInput());
    expect(result).toBe('APPROVED');
  });

  it('9. Deve chamar as dependências com os argumentos corretos', async () => {
    const input = createBaseInput({ userId: 'user-999', country: 'US', amount: 200 });
    await fraudAnalysisService.execute(input);

    expect(userRepository.isVip).toHaveBeenCalledWith('user-999');
    expect(transactionRepository.getHistory).toHaveBeenCalledWith('user-999');
    expect(riskEngine.getCountryRisk).toHaveBeenCalledWith('US');
  });

  it('10. Deve notificar o usuário quando a decisão for REVIEW', async () => {
    riskEngine.getCountryRisk.mockResolvedValue(75); // triggers REVIEW
    await fraudAnalysisService.execute(createBaseInput({ userId: 'user-rev' }));

    expect(notificationService.notifyReview).toHaveBeenCalledWith('user-rev');
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
  });

  it('11. Deve notificar o usuário quando a decisão for BLOCKED', async () => {
    riskEngine.getCountryRisk.mockResolvedValue(80);
    transactionRepository.getHistory.mockResolvedValue({ averageAmount: 10, transactionsLast24h: 15 }); // triggers BLOCKED
    await fraudAnalysisService.execute(createBaseInput({ userId: 'user-blk', amount: 100 }));

    expect(notificationService.notifyBlocked).toHaveBeenCalledWith('user-blk');
    expect(notificationService.notifyReview).not.toHaveBeenCalled();
  });

  it('12. Não deve notificar em caso de APPROVED', async () => {
    await fraudAnalysisService.execute(createBaseInput()); // triggers APPROVED

    expect(notificationService.notifyReview).not.toHaveBeenCalled();
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
  });

  it('13. Deve sempre gravar o log de auditoria com o resultado da decisão', async () => {
    await fraudAnalysisService.execute(createBaseInput());
    expect(auditLogger.log).toHaveBeenCalled();
  });

  it('14. Deve suportar fatores de risco combinados', async () => {
    // Combine:
    // Country Risk = 50 -> +1
    // Amount = 160 (avg 100) -> +1
    // txs24h = 6 -> +1
    // VIP = false
    // Total = 3 -> REVIEW
    riskEngine.getCountryRisk.mockResolvedValue(50);
    transactionRepository.getHistory.mockResolvedValue({ averageAmount: 100, transactionsLast24h: 6 });
    
    const result = await fraudAnalysisService.execute(createBaseInput({ amount: 160 }));
    expect(result).toBe('REVIEW');
    
    // Combine again, but user is VIP
    // Total = 3 - 1 = 2 -> APPROVED
    userRepository.isVip.mockResolvedValue(true);
    const resultVip = await fraudAnalysisService.execute(createBaseInput({ amount: 160 }));
    expect(resultVip).toBe('APPROVED');
    
    // Combine for BLOCKED
    // Country Risk = 80 -> +3
    // Amount = 400 (avg 100) -> +3
    // Total = 6 -> BLOCKED
    userRepository.isVip.mockResolvedValue(false);
    riskEngine.getCountryRisk.mockResolvedValue(80);
    transactionRepository.getHistory.mockResolvedValue({ averageAmount: 100, transactionsLast24h: 1 });
    const resultBlocked = await fraudAnalysisService.execute(createBaseInput({ amount: 400 }));
    expect(resultBlocked).toBe('BLOCKED');
  });

  it('15. Não deve aplicar penalidade de valor anormal quando averageAmount for igual a 0', async () => {
    riskEngine.getCountryRisk.mockResolvedValue(70);
    transactionRepository.getHistory.mockResolvedValue({
      averageAmount: 0,
      transactionsLast24h: 10,
    });

    const result = await fraudAnalysisService.execute(createBaseInput({ amount: 100 }));

    expect(result).toBe('REVIEW');
    expect(notificationService.notifyReview).toHaveBeenCalledWith('user-123');
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
    expect(auditLogger.log).toHaveBeenCalledWith({
      userId: 'user-123',
      score: 5,
      decision: 'REVIEW',
    });
  });
});
