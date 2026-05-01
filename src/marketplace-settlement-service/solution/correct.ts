import {
  OrderRepository,
  OrderItemRepository,
  RefundRepository,
  ChargebackRepository,
  SellerRepository,
  CommissionRepository,
  SettlementRepository,
  SettlementResult,
  SellerSettlement,
  Order,
  OrderItem,
  Refund,
  Chargeback,
  Seller
} from '../contract/interfaces';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

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
    const orders = await this.orderRepository.getOrders(
      input.startDate,
      input.endDate
    );

    if (orders.length === 0) {
      const empty: SettlementResult = {
        settlements: [],
        totalGross: 0,
        totalNet: 0,
        heldSellerIds: []
      };

      await this.settlementRepository.save(empty);

      return empty;
    }

    const orderIds = orders.map(order => order.id);
    const items = await this.orderItemRepository.getItems(orderIds);
    const itemIds = items.map(item => item.id);

    const refunds = await this.refundRepository.getRefunds(itemIds);
    const chargebacks = await this.chargebackRepository.getChargebacks(orderIds);

    const sellerIds = Array.from(new Set(items.map(item => item.sellerId)));
    const sellers = await this.sellerRepository.getSellers(sellerIds);

    const commissionRules = await this.commissionRepository.getRules();

    const sellerById = new Map<string, Seller>();
    for (const seller of sellers) {
      sellerById.set(seller.id, seller);
    }

    const commissionByCategory = new Map<string, number>();
    for (const rule of commissionRules) {
      commissionByCategory.set(rule.category, rule.percentage);
    }

    const refundsByItemId = new Map<string, Refund[]>();
    for (const refund of refunds) {
      const list = refundsByItemId.get(refund.orderItemId) ?? [];
      list.push(refund);
      refundsByItemId.set(refund.orderItemId, list);
    }

    const itemsByOrderId = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = itemsByOrderId.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrderId.set(item.orderId, list);
    }

    const chargebacksByOrderId = new Map<string, Chargeback[]>();
    for (const chargeback of chargebacks) {
      const list = chargebacksByOrderId.get(chargeback.orderId) ?? [];
      list.push(chargeback);
      chargebacksByOrderId.set(chargeback.orderId, list);
    }

    const settlementBySeller = new Map<string, SellerSettlement>();

    for (const sellerId of sellerIds) {
      const seller = sellerById.get(sellerId);

      settlementBySeller.set(sellerId, {
        sellerId,
        gross: 0,
        refunds: 0,
        shippingShare: 0,
        commission: 0,
        fixedFee: 0,
        chargebacks: 0,
        net: 0,
        held: seller?.riskLevel === 'HIGH'
      });
    }

    const effectiveRefundByItemId = new Map<string, number>();
    const netValueByItemId = new Map<string, number>();

    for (const item of items) {
      const gross = item.quantity * item.unitPrice;
      const refundTotal = (refundsByItemId.get(item.id) ?? []).reduce(
        (sum, refund) => sum + refund.amount,
        0
      );

      const effectiveRefund = Math.min(refundTotal, gross);
      const netValue = Math.max(gross - effectiveRefund, 0);

      effectiveRefundByItemId.set(item.id, effectiveRefund);
      netValueByItemId.set(item.id, netValue);

      const settlement = settlementBySeller.get(item.sellerId)!;

      settlement.gross += gross;
      settlement.refunds += effectiveRefund;

      const commissionRate = commissionByCategory.get(item.category) ?? 0;
      settlement.commission += netValue * (commissionRate / 100);
    }

    const orderById = new Map<string, Order>();
    for (const order of orders) {
      orderById.set(order.id, order);
    }

    for (const order of orders) {
      const orderItems = itemsByOrderId.get(order.id) ?? [];

      const totalNetInOrder = orderItems.reduce(
        (sum, item) => sum + (netValueByItemId.get(item.id) ?? 0),
        0
      );

      if (totalNetInOrder <= 0) {
        continue;
      }

      const netBySellerInOrder = new Map<string, number>();

      for (const item of orderItems) {
        const current = netBySellerInOrder.get(item.sellerId) ?? 0;
        netBySellerInOrder.set(
          item.sellerId,
          current + (netValueByItemId.get(item.id) ?? 0)
        );
      }

      for (const [sellerId, sellerNet] of netBySellerInOrder.entries()) {
        const settlement = settlementBySeller.get(sellerId)!;
        settlement.shippingShare +=
          order.shippingAmount * (sellerNet / totalNetInOrder);
      }

      const orderChargebackTotal = (chargebacksByOrderId.get(order.id) ?? [])
        .reduce((sum, chargeback) => sum + chargeback.amount, 0);

      for (const [sellerId, sellerNet] of netBySellerInOrder.entries()) {
        const settlement = settlementBySeller.get(sellerId)!;
        settlement.chargebacks +=
          orderChargebackTotal * (sellerNet / totalNetInOrder);
      }
    }

    for (const settlement of settlementBySeller.values()) {
      const valueBeforeFixedFee =
        settlement.gross -
        settlement.refunds +
        settlement.shippingShare -
        settlement.commission -
        settlement.chargebacks;

      settlement.fixedFee = valueBeforeFixedFee > 0 ? 1.5 : 0;

      settlement.net =
        settlement.gross -
        settlement.refunds +
        settlement.shippingShare -
        settlement.commission -
        settlement.fixedFee -
        settlement.chargebacks;

      if (settlement.net < 0) {
        settlement.net = 0;
      }

      settlement.gross = round2(settlement.gross);
      settlement.refunds = round2(settlement.refunds);
      settlement.shippingShare = round2(settlement.shippingShare);
      settlement.commission = round2(settlement.commission);
      settlement.fixedFee = round2(settlement.fixedFee);
      settlement.chargebacks = round2(settlement.chargebacks);
      settlement.net = round2(settlement.net);
    }

    const settlements = Array.from(settlementBySeller.values()).sort((a, b) =>
      a.sellerId.localeCompare(b.sellerId)
    );

    const result: SettlementResult = {
      settlements,
      totalGross: round2(
        settlements.reduce((sum, settlement) => sum + settlement.gross, 0)
      ),
      totalNet: round2(
        settlements.reduce((sum, settlement) => sum + settlement.net, 0)
      ),
      heldSellerIds: settlements
        .filter(settlement => settlement.held)
        .map(settlement => settlement.sellerId)
    };

    await this.settlementRepository.save(result);

    return result;
  }
}