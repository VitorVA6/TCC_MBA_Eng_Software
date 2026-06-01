import { FraudAnalysisService } from '../solution/correct';
import {
  UserRepository,
  TransactionRepository,
  RiskEngine,
  NotificationService,
  AuditLogger,
  TransactionInput,
} from './interfaces';

describe('FraudAnalysisService', () => {
  let fraudAnalysisService: FraudAnalysisService;
  let userRepository: jest.Mocked<UserRepository>;
  let transactionRepository: jest.Mocked<TransactionRepository>;
  let riskEngine: jest.Mocked<RiskEngine>;
  let notificationService: jest.Mocked<NotificationService>;
  let auditLogger: jest.Mocked<AuditLogger>;

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
  });

  const createInput = (overrides?: Partial<TransactionInput>): TransactionInput => ({
    userId: 'user-123',
    amount: 100,
    country: 'BR',
    ...overrides,
  });

  const setupMocks = ({
    isVip = false,
    history = { averageAmount: 100, transactionsLast24h: 1 },
    countryRisk = 10,
  } = {}) => {
    userRepository.isVip.mockResolvedValue(isVip);
    transactionRepository.getHistory.mockResolvedValue(history);
    riskEngine.getCountryRisk.mockResolvedValue(countryRisk);
  };

  it('4. Should throw error when amount is zero or negative', async () => {
    await expect(fraudAnalysisService.execute(createInput({ amount: 0 }))).rejects.toThrow();
    await expect(fraudAnalysisService.execute(createInput({ amount: -10 }))).rejects.toThrow();
  });

  it('1. Should approve low-risk transactions', async () => {
    setupMocks({
      isVip: false,
      history: { averageAmount: 100, transactionsLast24h: 2 },
      countryRisk: 20, // 0 points
    });
    
    const result = await fraudAnalysisService.execute(createInput());
    
    expect(result).toBe('APPROVED');
    expect(notificationService.notifyReview).not.toHaveBeenCalled();
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ decision: 'APPROVED' }));
  });

  it('2. Should review medium-risk transactions', async () => {
    setupMocks({
      isVip: false,
      history: { averageAmount: 50, transactionsLast24h: 6 }, // tx 5-9: +1, amount > 1.5x (100 > 75): +1
      countryRisk: 50, // +1
    }); // total score = 3
    
    const result = await fraudAnalysisService.execute(createInput({ amount: 100 }));
    
    expect(result).toBe('REVIEW');
    expect(notificationService.notifyReview).toHaveBeenCalledWith('user-123');
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ decision: 'REVIEW' }));
  });

  it('3. Should block high-risk transactions', async () => {
    setupMocks({
      isVip: false,
      history: { averageAmount: 10, transactionsLast24h: 12 }, // tx >= 10: +2, amount > 3x (100 > 30): +3
      countryRisk: 80, // +3
    }); // total score = 8
    
    const result = await fraudAnalysisService.execute(createInput({ amount: 100 }));
    
    expect(result).toBe('BLOCKED');
    expect(notificationService.notifyReview).not.toHaveBeenCalled();
    expect(notificationService.notifyBlocked).toHaveBeenCalledWith('user-123');
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ decision: 'BLOCKED' }));
  });

  it('5. Should increase scrutiny when country risk is high', async () => {
    setupMocks({ countryRisk: 80 }); // +3 points
    const result = await fraudAnalysisService.execute(createInput({ amount: 100 }));
    expect(result).toBe('REVIEW');
  });

  it('6. Should increase scrutiny when amount is much higher than historical average', async () => {
    setupMocks({ history: { averageAmount: 100, transactionsLast24h: 0 }, countryRisk: 0 }); // > 3x => +3 points
    const result = await fraudAnalysisService.execute(createInput({ amount: 400 }));
    expect(result).toBe('REVIEW');
  });

  it('7. Should increase scrutiny when many transactions happened in last 24h', async () => {
    setupMocks({ history: { averageAmount: 100, transactionsLast24h: 12 }, countryRisk: 50 }); // tx >= 10 (+2), country 50 (+1) => 3
    const result = await fraudAnalysisService.execute(createInput({ amount: 100 }));
    expect(result).toBe('REVIEW');
  });

  it('8. VIP users should have reduced risk impact', async () => {
    setupMocks({ isVip: true, countryRisk: 80 }); // +3 for country, -1 for VIP => 2 (APPROVED)
    const result = await fraudAnalysisService.execute(createInput());
    expect(result).toBe('APPROVED');
  });

  it('9. Should call dependencies with correct arguments', async () => {
    setupMocks();
    await fraudAnalysisService.execute(createInput({ userId: 'test-user', country: 'US' }));
    
    expect(userRepository.isVip).toHaveBeenCalledWith('test-user');
    expect(transactionRepository.getHistory).toHaveBeenCalledWith('test-user');
    expect(riskEngine.getCountryRisk).toHaveBeenCalledWith('US');
  });

  it('10. Should notify user when decision is REVIEW', async () => {
    setupMocks({ countryRisk: 80 }); // +3 -> REVIEW
    await fraudAnalysisService.execute(createInput({ userId: 'u1' }));
    expect(notificationService.notifyReview).toHaveBeenCalledWith('u1');
  });

  it('11. Should notify user when decision is BLOCKED', async () => {
    setupMocks({ countryRisk: 80, history: { averageAmount: 10, transactionsLast24h: 15 } }); // 3 + 3 + 2 = 8 points -> BLOCKED
    await fraudAnalysisService.execute(createInput({ userId: 'u2', amount: 100 }));
    expect(notificationService.notifyBlocked).toHaveBeenCalledWith('u2');
  });

  it('12. Should not notify on APPROVED', async () => {
    setupMocks(); // 0 points -> APPROVED
    await fraudAnalysisService.execute(createInput());
    expect(notificationService.notifyReview).not.toHaveBeenCalled();
    expect(notificationService.notifyBlocked).not.toHaveBeenCalled();
  });

  it('13. Should always write audit log with decision result', async () => {
    setupMocks(); // APPROVED
    await fraudAnalysisService.execute(createInput({ userId: 'user-123', amount: 100, country: 'BR' }));
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-123',
      decision: 'APPROVED',
      score: expect.any(Number)
    }));
  });

  it('14. Should support combined risk factors', async () => {
    setupMocks({
      countryRisk: 50, // +1
      history: { averageAmount: 100, transactionsLast24h: 7 } // +1 for tx amount
    });
    const result = await fraudAnalysisService.execute(createInput({ amount: 180 })); // 180 > 1.5x 100 -> +1
    expect(result).toBe('REVIEW'); // 1 + 1 + 1 = 3
  });
});
