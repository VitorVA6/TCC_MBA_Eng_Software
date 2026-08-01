export interface Seller {
  id: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Order {
  id: string;
  currency: string;
  date: string;
  shippingAmount: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  sellerId: string;
  category: string;
  quantity: number;
  unitPrice: number;
}

export interface Refund {
  orderItemId: string;
  amount: number;
}

export interface Chargeback {
  orderId: string;
  amount: number;
}

export interface CommissionRule {
  category: string;
  percentage: number;
}

export interface SellerSettlement {
  sellerId: string;
  gross: number;
  refunds: number;
  shippingShare: number;
  commission: number;
  fixedFee: number;
  chargebacks: number;
  net: number;
  held: boolean;
}

export interface SettlementResult {
  settlements: SellerSettlement[];
  totalGross: number;
  totalNet: number;
  heldSellerIds: string[];
}

export interface OrderRepository {
  getOrders(startDate: string, endDate: string): Promise<Order[]>;
}

export interface OrderItemRepository {
  getItems(orderIds: string[]): Promise<OrderItem[]>;
}

export interface RefundRepository {
  getRefunds(orderItemIds: string[]): Promise<Refund[]>;
}

export interface ChargebackRepository {
  getChargebacks(orderIds: string[]): Promise<Chargeback[]>;
}

export interface SellerRepository {
  getSellers(sellerIds: string[]): Promise<Seller[]>;
}

export interface CommissionRepository {
  getRules(): Promise<CommissionRule[]>;
}

export interface SettlementRepository {
  save(result: SettlementResult): Promise<void>;
}