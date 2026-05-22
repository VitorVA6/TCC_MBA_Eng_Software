import { MarketplaceSettlementService } from './correct';
import {
  OrderRepository,
  OrderItemRepository,
  RefundRepository,
  ChargebackRepository,
  SellerRepository,
  CommissionRepository,
  SettlementRepository,
  Order,
  OrderItem,
  Refund,
  Chargeback,
  Seller,
  CommissionRule,
} from '../../stage-1/marketplace-settlement-service/contract/interfaces';

describe('MarketplaceSettlementService', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let orderItemRepository: jest.Mocked<OrderItemRepository>;
  let refundRepository: jest.Mocked<RefundRepository>;
  let chargebackRepository: jest.Mocked<ChargebackRepository>;
  let sellerRepository: jest.Mocked<SellerRepository>;
  let commissionRepository: jest.Mocked<CommissionRepository>;
  let settlementRepository: jest.Mocked<SettlementRepository>;
  let service: MarketplaceSettlementService;

  beforeEach(() => {
    orderRepository = { getOrders: jest.fn() };
    orderItemRepository = { getItems: jest.fn() };
    refundRepository = { getRefunds: jest.fn() };
    chargebackRepository = { getChargebacks: jest.fn() };
    sellerRepository = { getSellers: jest.fn() };
    commissionRepository = { getRules: jest.fn() };
    settlementRepository = { save: jest.fn() };

    service = new MarketplaceSettlementService(
      orderRepository,
      orderItemRepository,
      refundRepository,
      chargebackRepository,
      sellerRepository,
      commissionRepository,
      settlementRepository
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const runService = () => service.execute({ startDate: '2023-01-01', endDate: '2023-01-31' });

  it('1. Empty order list returns empty settlement result and still saves it', async () => {
    orderRepository.getOrders.mockResolvedValue([]);
    
    const result = await runService();
    
    expect(result).toEqual({
      settlements: [],
      totalGross: 0,
      totalNet: 0,
      heldSellerIds: []
    });
    expect(settlementRepository.save).toHaveBeenCalledWith(result);
    expect(orderItemRepository.getItems).not.toHaveBeenCalled();
  });

  it('2. Repository dependencies are called with correct ids and date range', async () => {
    const orders: Order[] = [{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 10 }];
    const items: OrderItem[] = [{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'electronics', quantity: 1, unitPrice: 100 }];
    
    orderRepository.getOrders.mockResolvedValue(orders);
    orderItemRepository.getItems.mockResolvedValue(items);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    await runService();

    expect(orderRepository.getOrders).toHaveBeenCalledWith('2023-01-01', '2023-01-31');
    expect(orderItemRepository.getItems).toHaveBeenCalledWith(['o1']);
    expect(refundRepository.getRefunds).toHaveBeenCalledWith(['i1']);
    expect(chargebackRepository.getChargebacks).toHaveBeenCalledWith(['o1']);
    expect(sellerRepository.getSellers).toHaveBeenCalledWith(['s1']);
    expect(commissionRepository.getRules).toHaveBeenCalled();
  });

  it('3. Gross is calculated from quantity * unitPrice', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 2, unitPrice: 50 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].gross).toBe(100);
    expect(result.totalGross).toBe(100);
  });

  it('4. Refunds are assigned to the correct seller through orderItemId', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 100 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: 20 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    const s2 = result.settlements.find(s => s.sellerId === 's2')!;

    expect(s1.refunds).toBe(20);
    expect(s2.refunds).toBe(0);
  });

  it('5. Multiple refunds for the same item are summed', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([
      { orderItemId: 'i1', amount: 20 },
      { orderItemId: 'i1', amount: 30 }
    ]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].refunds).toBe(50);
  });

  it('6. Refunds cannot reduce an item below zero', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: 150 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].refunds).toBe(100);
  });

  it('7. Shipping is split proportionally by seller net item value within the same order', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 30 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 200 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    const s2 = result.settlements.find(s => s.sellerId === 's2')!;

    // Total order value = 300. s1 share = 100/300 = 1/3. s2 share = 200/300 = 2/3.
    expect(s1.shippingShare).toBe(10);
    expect(s2.shippingShare).toBe(20);
  });

  it('8. Shipping share is zero when all items in an order are fully refunded', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 30 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: 100 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].shippingShare).toBe(0);
  });

  it('9. Commission is calculated per item after refunds and before shipping', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 10 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'books', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: 20 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'books', percentage: 10 }]);

    const result = await runService();

    // Value after refund = 80. Commission = 80 * 10% = 8.
    expect(result.settlements[0].commission).toBe(8);
  });

  it('10. Missing commission rule means 0% commission', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'unknown', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'books', percentage: 10 }]);

    const result = await runService();

    expect(result.settlements[0].commission).toBe(0);
  });

  it('11. Chargebacks are allocated proportionally by seller net item value after refunds', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 150 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i2', amount: 50 }]); // i2 net is 100
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 50 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    const s2 = result.settlements.find(s => s.sellerId === 's2')!;

    // Valid total for chargeback split is 100 (i1) + 100 (i2 net) = 200. Share is 50% each.
    expect(s1.chargebacks).toBe(25);
    expect(s2.chargebacks).toBe(25);
  });

  it('12. Chargeback allocation is zero when all items in an order are fully refunded', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: 100 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 50 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].chargebacks).toBe(0);
  });

  it('13. Fixed fee of 1.50 applies only when value before fixed fee is positive', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 10 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 10 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i2', amount: 10 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    const s2 = result.settlements.find(s => s.sellerId === 's2')!;

    // s1 has positive pre-fee value (10), so fixed fee applies
    expect(s1.fixedFee).toBe(1.50);
    // s2 has zero pre-fee value (after 10 refund), so fixed fee is 0
    expect(s2.fixedFee).toBe(0);
  });

  it('14. Net cannot be negative', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    // 1 item, value 1, no refund, chargeback 100
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 1 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 100 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].net).toBe(0);
  });

  it('15. HIGH risk sellers are marked as held but still have net calculated', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'HIGH' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements[0].held).toBe(true);
    expect(result.settlements[0].net).toBeGreaterThan(0);
    expect(result.heldSellerIds).toContain('s1');
  });

  it('16. LOW and MEDIUM risk sellers are not held', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 100 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'MEDIUM' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.settlements.find(s => s.sellerId === 's1')!.held).toBe(false);
    expect(result.settlements.find(s => s.sellerId === 's2')!.held).toBe(false);
    expect(result.heldSellerIds).toEqual([]);
  });

  it('17. totalGross equals the sum of seller gross', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 10 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 20 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(result.totalGross).toBe(30);
  });

  it('18. totalNet equals the sum of seller net', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 200 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    const sumNet = result.settlements.reduce((sum, s) => sum + s.net, 0);
    expect(result.totalNet).toBe(sumNet);
  });

  it('19. Returned result and saved result are identical', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runService();

    expect(settlementRepository.save).toHaveBeenCalledWith(result);
  });

  it('20. Mixed scenario with multiple orders, multiple sellers, refunds, chargebacks, commissions, shipping split, and held seller', async () => {
    orderRepository.getOrders.mockResolvedValue([
      { id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 30 },
      { id: 'o2', currency: 'USD', date: '2023-01-12', shippingAmount: 0 }
    ]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'books', quantity: 1, unitPrice: 100 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'toys', quantity: 2, unitPrice: 50 }, // Total 100
      { id: 'i3', orderId: 'o2', sellerId: 's1', category: 'books', quantity: 1, unitPrice: 200 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([
      { orderItemId: 'i1', amount: 20 },
      { orderItemId: 'i3', amount: 200 } // full refund on i3
    ]);
    chargebackRepository.getChargebacks.mockResolvedValue([
      { orderId: 'o1', amount: 18 } // to be split between s1 (80) and s2 (100) -> 8 and 10
    ]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'HIGH' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([
      { category: 'books', percentage: 10 },
      { category: 'toys', percentage: 20 }
    ]);

    const result = await runService();

    // S1:
    // i1: gross 100, refund 20, net item 80. Shipping share 30 * (80/180) = 13.33. Commission 80 * 10% = 8. Chargeback = 18 * (80/180) = 8.
    // i3: gross 200, refund 200, net item 0. Shipping share 0. Commission 0. Chargeback 0.
    // Fixed fee = 1.50
    // Net = gross(300) - refunds(220) + shippingShare(13.33) - commission(8) - chargebacks(8) - fixedFee(1.50) = 75.83
    
    // S2:
    // i2: gross 100, refund 0, net item 100. Shipping share 30 * (100/180) = 16.67. Commission 100 * 20% = 20. Chargeback = 18 * (100/180) = 10.
    // Fixed fee = 1.50
    // Net = gross(100) - refunds(0) + shippingShare(16.67) - commission(20) - chargebacks(10) - fixedFee(1.50) = 85.17

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    const s2 = result.settlements.find(s => s.sellerId === 's2')!;

    expect(s1.held).toBe(true);
    expect(s2.held).toBe(false);

    expect(s1.gross).toBe(300);
    expect(s1.refunds).toBe(220);
    expect(s1.shippingShare).toBe(13.33);
    expect(s1.commission).toBe(8);
    expect(s1.chargebacks).toBe(8);
    expect(s1.fixedFee).toBe(1.50);
    expect(s1.net).toBe(75.83);

    expect(s2.gross).toBe(100);
    expect(s2.refunds).toBe(0);
    expect(s2.shippingShare).toBe(16.67);
    expect(s2.commission).toBe(20);
    expect(s2.chargebacks).toBe(10);
    expect(s2.fixedFee).toBe(1.50);
    expect(s2.net).toBe(85.17);

    expect(result.totalGross).toBe(400);
    expect(result.totalNet).toBe(161.00); // 75.83 + 85.17
  });

  it('21. Final monetary fields are rounded to 2 decimal places', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 10 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 33.33 },
      { id: 'i2', orderId: 'o1', sellerId: 's2', category: 'cat', quantity: 1, unitPrice: 66.67 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 3.33 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }, { id: 's2', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'cat', percentage: 12.3 }]); // 12.3%

    const result = await runService();

    const s1 = result.settlements.find(s => s.sellerId === 's1')!;
    
    // Check fields for strict 2-decimal rounding.
    expect(Number.isInteger(s1.shippingShare * 100)).toBe(true);
    expect(Number.isInteger(s1.commission * 100)).toBe(true);
    expect(Number.isInteger(s1.chargebacks * 100)).toBe(true);
    expect(Number.isInteger(s1.net * 100)).toBe(true);
    expect(Number.isInteger(result.totalNet * 100)).toBe(true);
  });

  it('22. Refunds and chargebacks with negative values are ignored', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'USD', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'i1', orderId: 'o1', sellerId: 's1', category: 'cat', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'i1', amount: -20 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: -30 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'cat', percentage: 0 }]);

    const result = await runService();

    expect(result.settlements[0].gross).toBe(100);
    expect(result.settlements[0].refunds).toBe(0);
    expect(result.settlements[0].chargebacks).toBe(0);
    expect(result.settlements[0].net).toBe(98.50);
  });
});
