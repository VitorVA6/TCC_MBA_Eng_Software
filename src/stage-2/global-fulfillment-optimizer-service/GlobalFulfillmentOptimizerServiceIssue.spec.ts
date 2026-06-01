// import { GlobalFulfillmentOptimizerService } from '../../stage-1/global-fulfillment-optimizer-service/solution/correct';
import { GlobalFulfillmentOptimizerService } from './correct';
import {
  OrderRepository,
  StockRepository,
  WarehouseRepository,
  RouteRepository,
  FulfillmentPlanRepository,
  EventBus,
  Order,
  StockPosition,
  Warehouse,
  RouteEdge,
} from '../../stage-1/global-fulfillment-optimizer-service/contract/interfaces';

describe('GlobalFulfillmentOptimizerService', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let stockRepository: jest.Mocked<StockRepository>;
  let warehouseRepository: jest.Mocked<WarehouseRepository>;
  let routeRepository: jest.Mocked<RouteRepository>;
  let fulfillmentPlanRepository: jest.Mocked<FulfillmentPlanRepository>;
  let eventBus: jest.Mocked<EventBus>;
  let service: GlobalFulfillmentOptimizerService;

  beforeEach(() => {
    orderRepository = { findById: jest.fn() };
    stockRepository = { getStock: jest.fn() };
    warehouseRepository = { getWarehouses: jest.fn() };
    routeRepository = { getEdges: jest.fn() };
    fulfillmentPlanRepository = { save: jest.fn() };
    eventBus = { publish: jest.fn() };

    service = new GlobalFulfillmentOptimizerService(
      orderRepository,
      stockRepository,
      warehouseRepository,
      routeRepository,
      fulfillmentPlanRepository,
      eventBus
    );
  });

  const createOrder = (overrides?: Partial<Order>): Order => ({
    id: 'O1',
    status: 'PAID',
    destinationNode: 'DEST1',
    maxDeliveryDays: 10,
    items: [{ productId: 'P1', quantity: 10, unitWeightKg: 1 }],
    ...overrides,
  });

  const createStock = (overrides?: Partial<StockPosition>): StockPosition => ({
    warehouseId: 'W1',
    productId: 'P1',
    quantity: 100,
    ...overrides,
  });

  const createWarehouse = (overrides?: Partial<Warehouse>): Warehouse => ({
    id: 'W1',
    active: true,
    ...overrides,
  });

  const createRouteEdge = (overrides?: Partial<RouteEdge>): RouteEdge => ({
    id: 'R1',
    fromNode: 'W1',
    toNode: 'DEST1',
    active: true,
    fixedCost: 10,
    costPerKg: 1,
    maxWeightKg: 1000,
    deliveryDays: 1,
    ...overrides,
  });

  it('1. Deve retornar NOT_FULFILLED quando o pedido não existir', async () => {
    orderRepository.findById.mockResolvedValue(null);
    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
    expect(result.totalCost).toBe(0);
    expect(result.allocations).toEqual([]);
    expect(result.shipments).toEqual([]);
    expect(result.unfulfilledItems).toEqual([]);
  });

  it('2. Deve retornar NOT_FULFILLED para pedidos PENDING', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({ status: 'PENDING' }));
    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('3. Deve retornar NOT_FULFILLED para pedidos CANCELLED', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({ status: 'CANCELLED' }));
    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('4. Deve buscar o estoque usando todos os ids únicos de produto do pedido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'P1', quantity: 1, unitWeightKg: 1 },
        { productId: 'P2', quantity: 1, unitWeightKg: 1 },
        { productId: 'P1', quantity: 1, unitWeightKg: 1 },
      ]
    }));
    stockRepository.getStock.mockResolvedValue([]);
    warehouseRepository.getWarehouses.mockResolvedValue([]);
    routeRepository.getEdges.mockResolvedValue([]);

    await service.execute({ orderId: 'O1' });
    expect(stockRepository.getStock).toHaveBeenCalledWith(expect.arrayContaining(['P1', 'P2']));
    expect(stockRepository.getStock.mock.calls[0][0].length).toBe(2);
  });

  it('5. Deve ignorar o estoque de armazéns inativos e 6. Deve ignorar as posições de estoque com quantidade zero', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W_INACTIVE', quantity: 10 }),
      createStock({ warehouseId: 'W_ZERO', quantity: 0 }),
      createStock({ warehouseId: 'W_ACTIVE', quantity: 10 }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W_INACTIVE', active: false }),
      createWarehouse({ id: 'W_ZERO', active: true }),
      createWarehouse({ id: 'W_ACTIVE', active: true }),
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W_INACTIVE' }),
      createRouteEdge({ fromNode: 'W_ZERO' }),
      createRouteEdge({ fromNode: 'W_ACTIVE' }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.allocations).toEqual([
      expect.objectContaining({ warehouseId: 'W_ACTIVE', quantity: 10 })
    ]);
  });

  it('7. Deve ignorar arestas de rota inativas', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ active: false }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('8. Deve encontrar uma rota válida com múltiplos saltos (multi-hop) do armazém até o destino', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ id: 'E1', fromNode: 'W1', toNode: 'NODE_A' }),
      createRouteEdge({ id: 'E2', fromNode: 'NODE_A', toNode: 'DEST1' }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.shipments[0].path).toEqual(['W1', 'NODE_A', 'DEST1']);
  });

  it('9. Deve ignorar rotas cuja maxWeightKg seja menor que o peso total do envio', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 10, unitWeightKg: 5 }] // Total weight = 50
    }));
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ maxWeightKg: 40 }), // 40 < 50
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('10. Deve ignorar rotas cujos deliveryDays totais excedam os maxDeliveryDays do pedido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({ maxDeliveryDays: 2 }));
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W1', toNode: 'N1', deliveryDays: 2 }),
      createRouteEdge({ fromNode: 'N1', toNode: 'DEST1', deliveryDays: 1 }), // Total 3
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('11. Deve agrupar as alocações por armazém e 12. Deve calcular o totalWeightKg do envio corretamente', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'P1', quantity: 5, unitWeightKg: 1 },
        { productId: 'P2', quantity: 5, unitWeightKg: 2 },
      ]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ productId: 'P1', warehouseId: 'W1', quantity: 5 }),
      createStock({ productId: 'P2', warehouseId: 'W1', quantity: 5 }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.shipments.length).toBe(1);
    expect(result.shipments[0].warehouseId).toBe('W1');
    expect(result.shipments[0].totalWeightKg).toBe(15); // 5*1 + 5*2
  });

  it('13. Deve calcular o custo da rota como a soma do fixedCost mais o costPerKg vezes o peso do envio para cada aresta no caminho', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 10, unitWeightKg: 2 }] // Weight = 20
    }));
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ id: 'E1', fromNode: 'W1', toNode: 'N1', fixedCost: 10, costPerKg: 1 }), // 10 + 1*20 = 30
      createRouteEdge({ id: 'E2', fromNode: 'N1', toNode: 'DEST1', fixedCost: 5, costPerKg: 2 }), // 5 + 2*20 = 45. Total = 75
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.shipments[0].cost).toBe(75);
    expect(result.totalCost).toBe(75);
  });

  it('14. Deve minimizar o custo total globalmente e 15. Não deve usar a alocação gulosa (greedy) por item quando esta produzir um custo total maior', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'P1', quantity: 1, unitWeightKg: 10 },
        { productId: 'P2', quantity: 1, unitWeightKg: 10 },
      ]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W1', productId: 'P1', quantity: 1 }),
      createStock({ warehouseId: 'W1', productId: 'P2', quantity: 1 }),
      createStock({ warehouseId: 'W2', productId: 'P1', quantity: 1 }),
      createStock({ warehouseId: 'W2', productId: 'P2', quantity: 1 }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W1' }),
      createWarehouse({ id: 'W2' }),
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W1', fixedCost: 100, costPerKg: 1 }),
      createRouteEdge({ fromNode: 'W2', fixedCost: 0, costPerKg: 10 }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.totalCost).toBe(120); // W1 is 100 + (20 * 1) = 120. W2 would be 0 + (20 * 10) = 200.
    expect(result.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ warehouseId: 'W1', productId: 'P1' }),
      expect.objectContaining({ warehouseId: 'W1', productId: 'P2' })
    ]));
  });

  it('16. Deve suportar a divisão do atendimento em múltiplos armazéns quando necessário', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'P1', quantity: 5, unitWeightKg: 1 },
        { productId: 'P2', quantity: 5, unitWeightKg: 1 },
      ]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W1', productId: 'P1', quantity: 5 }),
      createStock({ warehouseId: 'W2', productId: 'P2', quantity: 5 }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W1' }),
      createWarehouse({ id: 'W2' }),
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W1' }),
      createRouteEdge({ fromNode: 'W2' }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.shipments.length).toBe(2);
    expect(result.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ warehouseId: 'W1', productId: 'P1' }),
      expect.objectContaining({ warehouseId: 'W2', productId: 'P2' }),
    ]));
  });

  it('17. Deve preferir o atendimento total ao invés do atendimento parcial mais barato', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'P1', quantity: 1, unitWeightKg: 1 },
        { productId: 'P2', quantity: 1, unitWeightKg: 1 },
      ]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W_CHEAP', productId: 'P1', quantity: 1 }), // Only P1
      createStock({ warehouseId: 'W_EXPENSIVE', productId: 'P1', quantity: 1 }),
      createStock({ warehouseId: 'W_EXPENSIVE', productId: 'P2', quantity: 1 }), // Both
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W_CHEAP' }),
      createWarehouse({ id: 'W_EXPENSIVE' }),
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W_CHEAP', fixedCost: 1, costPerKg: 0 }),
      createRouteEdge({ fromNode: 'W_EXPENSIVE', fixedCost: 1000, costPerKg: 0 }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.totalCost).toBe(1000); // Prioritize FULFILLED over PARTIALLY_FULFILLED
  });

  it('18. Deve retornar PARTIALLY_FULFILLED quando apenas parte do pedido puder ser atendida', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 10, unitWeightKg: 1 }]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ quantity: 5 }) // Only 5 out of 10 available
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('PARTIALLY_FULFILLED');
    expect(result.allocations[0].quantity).toBe(5);
  });

  it('19. Deve retornar NOT_FULFILLED quando nenhum item puder ser atendido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('20. Deve relatar os itens não atendidos com requestedQuantity e fulfilledQuantity', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 10, unitWeightKg: 1 }]
    }));
    stockRepository.getStock.mockResolvedValue([
      createStock({ quantity: 4 })
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.unfulfilledItems).toEqual([
      { productId: 'P1', requestedQuantity: 10, fulfilledQuantity: 4 }
    ]);
  });

  it('21. Deve usar um desempate determinístico quando dois planos tiverem a mesma quantidade atendida e o mesmo custo total', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W2' }),
      createStock({ warehouseId: 'W1' }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W1' }),
      createWarehouse({ id: 'W2' }),
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fromNode: 'W1' }),
      createRouteEdge({ fromNode: 'W2' }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    const result2 = await service.execute({ orderId: 'O1' });
    
    // Result should be consistent between calls despite identical conditions
    expect(result.allocations[0].warehouseId).toBe(result2.allocations[0].warehouseId);
  });

  it('22. Deve salvar o mesmo resultado retornado pelo método execute', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(fulfillmentPlanRepository.save).toHaveBeenCalledWith(result);
  });

  it('23. Deve publicar fulfillment.optimized quando totalmente atendido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('FULFILLED');
    expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.optimized', {
      orderId: result.orderId,
    });
  });

  it('24. Deve publicar fulfillment.partial quando parcialmente atendido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 10, unitWeightKg: 1 }]
    }));
    stockRepository.getStock.mockResolvedValue([createStock({ quantity: 5 })]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    const result = await service.execute({ orderId: 'O1' });
    expect(result.status).toBe('PARTIALLY_FULFILLED');
    expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', {
      orderId: result.orderId,
    });
  });

  it('25. Não deve publicar o evento quando nada for atendido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([createRouteEdge()]);

    await service.execute({ orderId: 'O1' });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('26. Deve arredondar os campos monetários e de peso finais para 2 casas decimais', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'P1', quantity: 3, unitWeightKg: 1.33333 }] // Total requested weight: ~3.99999
    }));
    stockRepository.getStock.mockResolvedValue([createStock()]);
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ fixedCost: 10.123, costPerKg: 1.456 }),
    ]);

    const result = await service.execute({ orderId: 'O1' });
    
    // Weight: 3.99999 rounded is 4.00
    expect(result.shipments[0].totalWeightKg).toBe(4.00);
    // Cost calculation based on rounded weight: 10.123 + (1.456 * 4.00) = 15.947 rounded is 15.95
    expect(result.shipments[0].cost).toBe(15.95);
    expect(result.totalCost).toBe(15.95);
  });

  it('27. Não deve usar um armazém inativo como nó intermediário em uma rota', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    stockRepository.getStock.mockResolvedValue([
      createStock({ warehouseId: 'W1', quantity: 10 })
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'W1', active: true }),
      createWarehouse({ id: 'W2', active: false })
    ]);
    routeRepository.getEdges.mockResolvedValue([
      createRouteEdge({ id: 'E1', fromNode: 'W1', toNode: 'W2' }),
      createRouteEdge({ id: 'E2', fromNode: 'W2', toNode: 'DEST1' }),
    ]);

    const result = await service.execute({ orderId: 'O1' });

    expect(result.status).toBe('NOT_FULFILLED');
    expect(result.allocations).toEqual([]);
    expect(result.shipments).toEqual([]);
    expect(result.unfulfilledItems).toEqual([
      { productId: 'P1', requestedQuantity: 10, fulfilledQuantity: 0 }
    ]);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
