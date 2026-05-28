import { MarketplaceSettlementService } from '../solution/correct';
import {
  OrderRepository,
  OrderItemRepository,
  RefundRepository,
  ChargebackRepository,
  SellerRepository,
  CommissionRepository,
  SettlementRepository,
} from './interfaces';

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

  const runExecute = () => service.execute({ startDate: '2023-01-01', endDate: '2023-01-31' });

  it('1. Deve retornar um resultado de repasse vazio e salvá-lo quando a lista de pedidos estiver vazia', async () => {
    orderRepository.getOrders.mockResolvedValue([]);

    const result = await runExecute();

    expect(result).toEqual({
      settlements: [],
      totalGross: 0,
      totalNet: 0,
      heldSellerIds: []
    });
    expect(settlementRepository.save).toHaveBeenCalledWith(result);
  });

  it('2. Deve chamar os repositórios dependentes com os ids e intervalo de datas corretos', async () => {
    orderRepository.getOrders.mockResolvedValue([
      { id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 10 },
      { id: 'o2', currency: 'BRL', date: '2023-01-15', shippingAmount: 20 }
    ]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Eletrônicos', quantity: 1, unitPrice: 100 },
      { id: 'oi2', orderId: 'o2', sellerId: 's2', category: 'Livros', quantity: 2, unitPrice: 50 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    await runExecute();

    expect(orderRepository.getOrders).toHaveBeenCalledWith('2023-01-01', '2023-01-31');
    expect(orderItemRepository.getItems).toHaveBeenCalledWith(['o1', 'o2']);
    expect(refundRepository.getRefunds).toHaveBeenCalledWith(['oi1', 'oi2']);
    expect(chargebackRepository.getChargebacks).toHaveBeenCalledWith(['o1', 'o2']);
    expect(sellerRepository.getSellers).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('3. Deve calcular o bruto (gross) a partir da quantidade * unitPrice', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Eletrônicos', quantity: 3, unitPrice: 50 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].gross).toBe(150);
  });

  it('4. Deve atribuir reembolsos ao vendedor correto e 5. Deve somar múltiplos reembolsos para o mesmo item', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Eletrônicos', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([
      { orderItemId: 'oi1', amount: 20 },
      { orderItemId: 'oi1', amount: 10 }
    ]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].refunds).toBe(30);
  });

  it('6. Não deve reduzir um item para menos de zero devido a reembolsos', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Eletrônicos', quantity: 1, unitPrice: 50 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi1', amount: 80 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].refunds).toBe(50);
  });

  it('7. Deve dividir o frete proporcionalmente pelo valor líquido do item do vendedor dentro do mesmo pedido', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 100 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 200 },
      { id: 'oi2', orderId: 'o1', sellerId: 's2', category: 'A', quantity: 1, unitPrice: 100 },
      { id: 'oi3', orderId: 'o1', sellerId: 's3', category: 'A', quantity: 1, unitPrice: 100 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi3', amount: 100 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'LOW' },
      { id: 's3', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    const s1 = result.settlements.find(s => s.sellerId === 's1');
    const s2 = result.settlements.find(s => s.sellerId === 's2');
    const s3 = result.settlements.find(s => s.sellerId === 's3');

    expect(s1?.shippingShare).toBeCloseTo(66.67);
    expect(s2?.shippingShare).toBeCloseTo(33.33);
    expect(s3?.shippingShare).toBe(0);
  });

  it('8. Deve calcular a parcela do frete como zero quando todos os itens de um pedido forem totalmente reembolsados', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 100 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 50 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi1', amount: 50 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].shippingShare).toBe(0);
  });

  it('9. Deve calcular a comissão por item após reembolsos e antes do frete', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 50 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Livros', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi1', amount: 20 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'Livros', percentage: 10 }]);

    const result = await runExecute();

    expect(result.settlements[0].commission).toBe(8); // 10% de (100 - 20)
  });

  it('10. Deve aplicar 0% de comissão quando não houver regra de comissão', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Desconhecida', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([{ category: 'Livros', percentage: 10 }]);

    const result = await runExecute();

    expect(result.settlements[0].commission).toBe(0);
  });

  it('11. Deve alocar chargebacks proporcionalmente pelo valor líquido do item do vendedor após os reembolsos', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 150 },
      { id: 'oi2', orderId: 'o1', sellerId: 's2', category: 'A', quantity: 1, unitPrice: 50 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi1', amount: 50 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 30 }]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    const s1 = result.settlements.find(s => s.sellerId === 's1');
    const s2 = result.settlements.find(s => s.sellerId === 's2');

    expect(s1?.chargebacks).toBeCloseTo(20);
    expect(s2?.chargebacks).toBeCloseTo(10);
  });

  it('12. Deve calcular a alocação de chargeback como zero quando todos os itens de um pedido forem totalmente reembolsados', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 50 }]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi1', amount: 50 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([{ orderId: 'o1', amount: 30 }]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].chargebacks).toBe(0);
  });

  it('13. Deve aplicar a taxa fixa de 1.50 apenas quando o valor antes da taxa fixa for positivo', async () => {
    orderRepository.getOrders.mockResolvedValue([
      { id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 },
      { id: 'o2', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }
    ]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 5 },
      { id: 'oi2', orderId: 'o2', sellerId: 's2', category: 'A', quantity: 1, unitPrice: 5 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([{ orderItemId: 'oi2', amount: 5 }]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    const s1 = result.settlements.find(s => s.sellerId === 's1');
    const s2 = result.settlements.find(s => s.sellerId === 's2');

    expect(s1?.fixedFee).toBe(1.50);
    expect(s2?.fixedFee).toBe(0);
  });

  it('14. Não deve permitir nunca que o líquido (net) seja negativo', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 1 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(result.settlements[0].net).toBe(0);
  });

  it('15. Deve marcar vendedores de alto risco (HIGH) como retidos (held) e 16. Não reter vendedores de baixo/médio', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 100 },
      { id: 'oi2', orderId: 'o1', sellerId: 's2', category: 'A', quantity: 1, unitPrice: 100 },
      { id: 'oi3', orderId: 'o1', sellerId: 's3', category: 'A', quantity: 1, unitPrice: 100 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'HIGH' },
      { id: 's2', riskLevel: 'LOW' },
      { id: 's3', riskLevel: 'MEDIUM' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    const s1 = result.settlements.find(s => s.sellerId === 's1');
    const s2 = result.settlements.find(s => s.sellerId === 's2');
    const s3 = result.settlements.find(s => s.sellerId === 's3');

    expect(s1?.held).toBe(true);
    expect(s2?.held).toBe(false);
    expect(s3?.held).toBe(false);
    expect(result.heldSellerIds).toEqual(['s1']);
    expect(s1?.net).toBeGreaterThan(0);
  });


  it('17. Deve calcular totalGross como a soma do bruto e 18. Deve calcular totalNet como a soma do líquido', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 100 },
      { id: 'oi2', orderId: 'o1', sellerId: 's2', category: 'A', quantity: 1, unitPrice: 50 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'LOW' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    const grossS1 = result.settlements.find(s => s.sellerId === 's1')?.gross || 0;
    const grossS2 = result.settlements.find(s => s.sellerId === 's2')?.gross || 0;
    const netS1 = result.settlements.find(s => s.sellerId === 's1')?.net || 0;
    const netS2 = result.settlements.find(s => s.sellerId === 's2')?.net || 0;

    expect(result.totalGross).toBe(grossS1 + grossS2);
    expect(result.totalNet).toBe(netS1 + netS2);
  });

  it('19. Deve garantir que o resultado retornado e o resultado salvo sejam idênticos', async () => {
    orderRepository.getOrders.mockResolvedValue([{ id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 0 }]);
    orderItemRepository.getItems.mockResolvedValue([{ id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'A', quantity: 1, unitPrice: 100 }]);
    refundRepository.getRefunds.mockResolvedValue([]);
    chargebackRepository.getChargebacks.mockResolvedValue([]);
    sellerRepository.getSellers.mockResolvedValue([{ id: 's1', riskLevel: 'LOW' }]);
    commissionRepository.getRules.mockResolvedValue([]);

    const result = await runExecute();

    expect(settlementRepository.save).toHaveBeenCalledWith(result);
  });

  it('20. Deve lidar com cenário misto e 21. Arredondar os campos monetários finais para 2 casas decimais', async () => {
    orderRepository.getOrders.mockResolvedValue([
      { id: 'o1', currency: 'BRL', date: '2023-01-10', shippingAmount: 15.55 },
      { id: 'o2', currency: 'BRL', date: '2023-01-15', shippingAmount: 22.33 }
    ]);
    orderItemRepository.getItems.mockResolvedValue([
      { id: 'oi1', orderId: 'o1', sellerId: 's1', category: 'Eletrônicos', quantity: 2, unitPrice: 150.25 },
      { id: 'oi2', orderId: 'o1', sellerId: 's2', category: 'Livros', quantity: 1, unitPrice: 45.99 },
      { id: 'oi3', orderId: 'o2', sellerId: 's1', category: 'Eletrônicos', quantity: 1, unitPrice: 80.00 }
    ]);
    refundRepository.getRefunds.mockResolvedValue([
      { orderItemId: 'oi1', amount: 50.25 },
      { orderItemId: 'oi2', amount: 45.99 } // Reembolso total
    ]);
    chargebackRepository.getChargebacks.mockResolvedValue([
      { orderId: 'o1', amount: 20.00 }
    ]);
    sellerRepository.getSellers.mockResolvedValue([
      { id: 's1', riskLevel: 'HIGH' },
      { id: 's2', riskLevel: 'LOW' }
    ]);
    commissionRepository.getRules.mockResolvedValue([
      { category: 'Eletrônicos', percentage: 5 },
      { category: 'Livros', percentage: 10 }
    ]);

    const result = await runExecute();

    const s1 = result.settlements.find(s => s.sellerId === 's1');
    
    // Verifica arredondamento com Regex de no máximo 2 casas decimais
    const hasMaxTwoDecimals = (num: number | undefined) => /^\d+(\.\d{1,2})?$/.test(num?.toString() || '0');
    
    expect(hasMaxTwoDecimals(s1?.gross)).toBe(true);
    expect(hasMaxTwoDecimals(s1?.refunds)).toBe(true);
    expect(hasMaxTwoDecimals(s1?.shippingShare)).toBe(true);
    expect(hasMaxTwoDecimals(s1?.commission)).toBe(true);
    expect(hasMaxTwoDecimals(s1?.chargebacks)).toBe(true);
    expect(hasMaxTwoDecimals(s1?.net)).toBe(true);
    expect(hasMaxTwoDecimals(result.totalGross)).toBe(true);
    expect(hasMaxTwoDecimals(result.totalNet)).toBe(true);
    
    expect(result.heldSellerIds).toContain('s1');
  });
});
