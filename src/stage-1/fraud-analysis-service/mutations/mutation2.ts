import {
  TransactionInput,
  FraudDecision,
  UserRepository,
  TransactionRepository,
  RiskEngine,
  NotificationService,
  AuditLogger
} from '../contract/interfaces';

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
      throw new Error('Invalid amount');
    }

    const isVip =
      await this.userRepository.isVip(input.userId);

    const history =
      await this.transactionRepository.getHistory(
        input.userId
      );

    const countryRisk =
      await this.riskEngine.getCountryRisk(
        input.country
      );

    let score = 0;

    if (countryRisk >= 70) score += 3;
    else if (countryRisk >= 40) score += 1;

    if (input.amount > history.averageAmount * 3)
      score += 3;
    else if (
      input.amount > history.averageAmount * 1.5
    )
      score += 1;

    if (history.transactionsLast24h >= 10)
      score += 2;
    else if (history.transactionsLast24h >= 5)
      score += 1;

    if (isVip) score -= 1;

    let decision: FraudDecision = 'APPROVED';

    if (score >= 4) {
      decision = 'BLOCKED';
      await this.notificationService.notifyBlocked(
        input.userId
      );
    } else if (score >= 2) {
      decision = 'REVIEW';
      await this.notificationService.notifyReview(
        input.userId
      );
    }

    await this.auditLogger.log({
      userId: input.userId,
      score,
      decision
    });

    return decision;
  }
}