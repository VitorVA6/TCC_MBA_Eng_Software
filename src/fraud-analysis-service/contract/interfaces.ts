export interface TransactionInput {
  userId: string;
  amount: number;
  country: string;
}

export interface TransactionHistory {
  averageAmount: number;
  transactionsLast24h: number;
}

export interface UserRepository {
  isVip(userId: string): Promise<boolean>;
}

export interface TransactionRepository {
  getHistory(userId: string): Promise<TransactionHistory>;
}

export interface RiskEngine {
  getCountryRisk(country: string): Promise<number>;
}

export interface NotificationService {
  notifyReview(userId: string): Promise<void>;
  notifyBlocked(userId: string): Promise<void>;
}

export interface AuditLogger {
  log(data: unknown): Promise<void>;
}

export type FraudDecision =
  | 'APPROVED'
  | 'REVIEW'
  | 'BLOCKED';