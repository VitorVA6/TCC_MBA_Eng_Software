import {
  TransactionInput,
  FraudDecision,
  UserRepository,
  TransactionRepository,
  RiskEngine,
  NotificationService,
  AuditLogger
} from './interfaces';

export class FraudAnalysisService {
  constructor(
    private userRepository: UserRepository,
    private transactionRepository: TransactionRepository,
    private riskEngine: RiskEngine,
    private notificationService: NotificationService,
    private auditLogger: AuditLogger
  ) {}

  async execute(
    input: TransactionInput
  ): Promise<FraudDecision> {
    if (input.amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const [countryRisk, history, isVip] = await Promise.all([
      this.riskEngine.getCountryRisk(input.country),
      this.transactionRepository.getHistory(input.userId),
      this.userRepository.isVip(input.userId)
    ]);

    let score = 0;

    if (countryRisk >= 70) {
      score += 3;
    } else if (countryRisk >= 40) {
      score += 1;
    }

    if (input.amount > history.averageAmount * 3) {
      score += 3;
    } else if (input.amount > history.averageAmount * 1.5) {
      score += 1;
    }

    if (history.transactionsLast24h >= 10) {
      score += 2;
    } else if (history.transactionsLast24h >= 5) {
      score += 1;
    }

    if (isVip) {
      score -= 1;
    }

    let decision: FraudDecision;
    if (score >= 6) {
      decision = 'BLOCKED';
    } else if (score >= 3) {
      decision = 'REVIEW';
    } else {
      decision = 'APPROVED';
    }

    if (decision === 'REVIEW') {
      await this.notificationService.notifyReview(input.userId);
    } else if (decision === 'BLOCKED') {
      await this.notificationService.notifyBlocked(input.userId);
    }

    await this.auditLogger.log({
      userId: input.userId,
      score,
      decision
    });

    return decision;
  }
}
