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
    const orders = await this.orderRepository.getOrders(input.startDate, input.endDate);
    
    if (orders.length === 0) {
      const emptyResult: SettlementResult = {
        settlements: [],
        totalGross: 0,
        totalNet: 0,
        heldSellerIds: []
      };
      await this.settlementRepository.save(emptyResult);
      return emptyResult;
    }

    const orderIds = orders.map(o => o.id);

    const [items, chargebacks, rules] = await Promise.all([
      this.orderItemRepository.getItems(orderIds),
      this.chargebackRepository.getChargebacks(orderIds),
      this.commissionRepository.getRules()
    ]);

    const itemIds = items.map(i => i.id);
    const refunds = itemIds.length > 0 ? await this.refundRepository.getRefunds(itemIds) : [];

    const sellerIds = Array.from(new Set(items.map(i => i.sellerId)));
    const sellers = sellerIds.length > 0 ? await this.sellerRepository.getSellers(sellerIds) : [];

    // Pre-calculate rules
    const commissionByCat = new Map<string, number>();
    for (const rule of rules) {
      commissionByCat.set(rule.category, rule.percentage);
    }

    // Pre-calculate refunds by item
    const refundsByItem = new Map<string, number>();
    for (const refund of refunds) {
      refundsByItem.set(refund.orderItemId, (refundsByItem.get(refund.orderItemId) || 0) + refund.amount);
    }

    // Pre-calculate chargebacks by order
    const chargebacksByOrder = new Map<string, number>();
    for (const cb of chargebacks) {
      chargebacksByOrder.set(cb.orderId, (chargebacksByOrder.get(cb.orderId) || 0) + cb.amount);
    }

    const ordersById = new Map<string, typeof orders[0]>();
    for (const o of orders) {
      ordersById.set(o.id, o);
    }

    const sellersById = new Map<string, typeof sellers[0]>();
    for (const s of sellers) {
      sellersById.set(s.id, s);
    }

    // Compute item level values
    const orderNetValues = new Map<string, number>();
    const itemGrossValues = new Map<string, number>();
    const itemEffectiveRefunds = new Map<string, number>();
    const itemNetValues = new Map<string, number>();

    for (const item of items) {
      const gross = item.quantity * item.unitPrice;
      const rawRefund = refundsByItem.get(item.id) || 0;
      const effectiveRefund = Math.min(gross, rawRefund);
      const netValue = gross - effectiveRefund;

      itemGrossValues.set(item.id, gross);
      itemEffectiveRefunds.set(item.id, effectiveRefund);
      itemNetValues.set(item.id, netValue);

      orderNetValues.set(item.orderId, (orderNetValues.get(item.orderId) || 0) + netValue);
    }

    interface SellerAgg {
      gross: number;
      refunds: number;
      shippingShare: number;
      commission: number;
      chargebacks: number;
    }
    const sellerAggs = new Map<string, SellerAgg>();
    for (const sId of sellerIds) {
      sellerAggs.set(sId, { gross: 0, refunds: 0, shippingShare: 0, commission: 0, chargebacks: 0 });
    }

    for (const item of items) {
      const agg = sellerAggs.get(item.sellerId)!;
      const gross = itemGrossValues.get(item.id)!;
      const effRefund = itemEffectiveRefunds.get(item.id)!;
      const netValue = itemNetValues.get(item.id)!;
      const orderNet = orderNetValues.get(item.orderId)!;
      const order = ordersById.get(item.orderId)!;

      const proportion = orderNet > 0 ? netValue / orderNet : 0;

      const shippingShare = order.shippingAmount * proportion;
      
      const pct = commissionByCat.get(item.category) || 0;
      const commission = netValue * (pct / 100);
      
      const cbTotal = chargebacksByOrder.get(item.orderId) || 0;
      const chargebackShare = cbTotal * proportion;

      agg.gross += gross;
      agg.refunds += effRefund;
      agg.shippingShare += shippingShare;
      agg.commission += commission;
      agg.chargebacks += chargebackShare;
    }

    const toDec = (val: number) => Number(val.toFixed(2));

    const settlements = [];
    let totalGross = 0;
    let totalNet = 0;
    const heldSellerIds: string[] = [];

    for (const sellerId of sellerIds) {
      const agg = sellerAggs.get(sellerId)!;
      const seller = sellersById.get(sellerId);

      const netBeforeFee = agg.gross - agg.refunds + agg.shippingShare - agg.commission - agg.chargebacks;
      
      const fixedFee = toDec(netBeforeFee) > 0 ? 1.50 : 0;
      const rawNet = netBeforeFee - fixedFee;
      const net = Math.max(0, toDec(rawNet));

      const isHeld = seller?.riskLevel === 'HIGH';
      if (isHeld) {
        heldSellerIds.push(sellerId);
      }

      settlements.push({
        sellerId,
        gross: toDec(agg.gross),
        refunds: toDec(agg.refunds),
        shippingShare: toDec(agg.shippingShare),
        commission: toDec(agg.commission),
        fixedFee: toDec(fixedFee),
        chargebacks: toDec(agg.chargebacks),
        net: toDec(net),
        held: isHeld
      });

      totalGross += toDec(agg.gross);
      totalNet += toDec(net);
    }

    const result: SettlementResult = {
      settlements,
      totalGross: toDec(totalGross),
      totalNet: toDec(totalNet),
      heldSellerIds
    };

    await this.settlementRepository.save(result);
    return result;
  }
}
