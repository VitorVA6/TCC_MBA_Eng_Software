export interface User {
  id: string;
  country: string;
  isVip: boolean;
}

export interface Plan {
  id: string;
  monthlyPrice: number;
}

export interface Subscription {
  userId: string;
  currentPlanId: string;
  targetPlanId: string | null;
  status: 'ACTIVE' | 'PAST_DUE' | 'TRIAL';
  daysRemaining: number;
}

export interface Coupon {
  code: string;
  percentage: number;
  active: boolean;
}

export interface UserRepository {
  findById(id: string): Promise<User>;
}

export interface PlanRepository {
  findById(id: string): Promise<Plan>;
}

export interface SubscriptionRepository {
  findByUserId(id: string): Promise<Subscription>;
}

export interface CouponRepository {
  findByCode(code: string): Promise<Coupon | null>;
}

export interface TaxService {
  getRate(country: string): Promise<number>;
}

export interface PaymentGateway {
  charge(userId: string, amount: number): Promise<void>;
}

export interface BillingResult {
  amount: number;
  blocked: boolean;
  reason?: string;
}