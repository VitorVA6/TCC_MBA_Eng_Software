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
    throw new Error('Not implemented');
  }
}