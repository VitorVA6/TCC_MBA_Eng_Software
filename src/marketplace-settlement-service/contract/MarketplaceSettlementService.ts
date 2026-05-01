import {
  OrderRepository,
  OrderItemRepository,
  RefundRepository,
  ChargebackRepository,
  SellerRepository,
  CommissionRepository,
  SettlementRepository,
  SettlementResult
} from './interfaces';

export class MarketplaceSettlementService {
  constructor(
    private orderRepository: OrderRepository,
    private orderItemRepository: OrderItemRepository,
    private refundRepository: RefundRepository,
    private chargebackRepository: ChargebackRepository,
    private sellerRepository: SellerRepository,
    private commissionRepository: CommissionRepository,
    private settlementRepository: SettlementRepository
  ) {}

  async execute(input: {
    startDate: string;
    endDate: string;
  }): Promise<SettlementResult> {
    throw new Error('Not implemented');
  }
}