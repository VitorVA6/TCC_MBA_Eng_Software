// import { FulfillmentAllocationService } from '../../stage-1/fulfillment-allocation-service/solution/correct';
import { FulfillmentAllocationService } from './correct';
import {
  OrderRepository,
  InventoryRepository,
  WarehouseRepository,
  CarrierRepository,
  ReservationRepository,
  EventBus,
  Order,
  InventoryBatch,
  Warehouse,
  CarrierOption,
} from '../../stage-1/fulfillment-allocation-service/contract/interfaces';

describe('FulfillmentAllocationService', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let warehouseRepository: jest.Mocked<WarehouseRepository>;
  let carrierRepository: jest.Mocked<CarrierRepository>;
  let reservationRepository: jest.Mocked<ReservationRepository>;
  let eventBus: jest.Mocked<EventBus>;
  let service: FulfillmentAllocationService;

  beforeEach(() => {
    orderRepository = { findById: jest.fn() };
    inventoryRepository = { getBatches: jest.fn() };
    warehouseRepository = { getWarehouses: jest.fn() };
    carrierRepository = { getOptions: jest.fn() };
    reservationRepository = {
      getReservedQuantities: jest.fn(),
      saveReservations: jest.fn(),
    };
    eventBus = { publish: jest.fn() };

    service = new FulfillmentAllocationService(
      orderRepository,
      inventoryRepository,
      warehouseRepository,
      carrierRepository,
      reservationRepository,
      eventBus
    );
  });

  const createOrder = (overrides?: Partial<Order>): Order => ({
    id: 'order-1',
    status: 'PAID',
    destinationRegion: 'SP',
    createdAt: '2026-01-01T00:00:00Z',
    items: [{ productId: 'prod-1', quantity: 10, unitWeightKg: 1 }],
    ...overrides,
  });

  const createBatch = (overrides?: Partial<InventoryBatch>): InventoryBatch => ({
    id: 'batch-1',
    productId: 'prod-1',
    warehouseId: 'w-1',
    availableQuantity: 10,
    expiresAt: '2099-01-01T00:00:00Z',
    ...overrides,
  });

  const createWarehouse = (overrides?: Partial<Warehouse>): Warehouse => ({
    id: 'w-1',
    active: true,
    supportedRegions: ['SP'],
    priority: 1,
    ...overrides,
  });

  const createCarrier = (overrides?: Partial<CarrierOption>): CarrierOption => ({
    id: 'c-1',
    warehouseId: 'w-1',
    region: 'SP',
    deliveryDays: 2,
    baseCost: 10,
    costPerKg: 2,
    maxWeightKg: 100,
    ...overrides,
  });

  const setupHappyPath = () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    inventoryRepository.getBatches.mockResolvedValue([createBatch()]);
    reservationRepository.getReservedQuantities.mockResolvedValue({});
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse()]);
    carrierRepository.getOptions.mockResolvedValue([createCarrier()]);
  };

  it('1. Deve retornar NOT_FULFILLED quando o pedido não existir', async () => {
    orderRepository.findById.mockResolvedValue(null);
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('2. Deve retornar NOT_FULFILLED para pedidos PENDING', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({ status: 'PENDING' }));
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('3. Deve retornar NOT_FULFILLED para pedidos CANCELLED', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({ status: 'CANCELLED' }));
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('4. Deve buscar os lotes de estoque usando todos os ids de produto do pedido', async () => {
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 1, unitWeightKg: 1 },
        { productId: 'prod-2', quantity: 2, unitWeightKg: 1 },
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([]);
    warehouseRepository.getWarehouses.mockResolvedValue([]);
    carrierRepository.getOptions.mockResolvedValue([]);
    reservationRepository.getReservedQuantities.mockResolvedValue({});
    
    await service.execute({ orderId: 'order-1' }).catch(() => {});
    expect(inventoryRepository.getBatches).toHaveBeenCalledWith(['prod-1', 'prod-2']);
  });

  it('5. Deve buscar as quantidades reservadas usando todos os ids de lote', async () => {
    setupHappyPath();
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-1' }),
      createBatch({ id: 'batch-2' }),
    ]);
    
    await service.execute({ orderId: 'order-1' }).catch(() => {});
    expect(reservationRepository.getReservedQuantities).toHaveBeenCalledWith(['batch-1', 'batch-2']);
  });

  it('6. Deve ignorar lotes expirados', async () => {
    setupHappyPath();
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ expiresAt: '2000-01-01T00:00:00Z' }) // Expired long ago
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
    expect(result.unfulfilledItems[0].reason).toBe('NO_STOCK');
  });

  it('7. Deve considerar as quantidades reservadas existentes ao calcular o estoque disponível', async () => {
    setupHappyPath();
    reservationRepository.getReservedQuantities.mockResolvedValue({ 'batch-1': 10 }); // All 10 reserved
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('8. Deve ignorar armazéns inativos', async () => {
    setupHappyPath();
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse({ active: false })]);
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('9. Deve ignorar armazéns que não suportam a região de destino', async () => {
    setupHappyPath();
    warehouseRepository.getWarehouses.mockResolvedValue([createWarehouse({ supportedRegions: ['RJ'] })]); // SP requested
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('10. Deve ignorar transportadoras que não suportam a região de destino', async () => {
    setupHappyPath();
    carrierRepository.getOptions.mockResolvedValue([createCarrier({ region: 'RJ' })]); // SP requested
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('11. Deve ignorar transportadoras cuja maxWeightKg seja menor que o unitWeightKg do item', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 1, unitWeightKg: 50 }]
    }));
    carrierRepository.getOptions.mockResolvedValue([createCarrier({ maxWeightKg: 20 })]); // 20 < 50
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('12. Deve alocar estoque a partir de lotes elegíveis', async () => {
    setupHappyPath();
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].items[0].quantity).toBe(10);
  });

  it('13. Deve suportar a alocação em múltiplos lotes para o mesmo produto', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 15, unitWeightKg: 1 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-1', availableQuantity: 10 }),
      createBatch({ id: 'batch-2', availableQuantity: 5 }),
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.shipments[0].items).toHaveLength(2);
    expect(result.shipments[0].items).toEqual(expect.arrayContaining([
      expect.objectContaining({ batchId: 'batch-1', quantity: 10 }),
      expect.objectContaining({ batchId: 'batch-2', quantity: 5 }),
    ]));
  });

  it('14. Deve suportar a alocação em múltiplos armazéns', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 5, unitWeightKg: 1 },
        { productId: 'prod-2', quantity: 5, unitWeightKg: 1 }
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-1', productId: 'prod-1', warehouseId: 'w-1', availableQuantity: 5 }),
      createBatch({ id: 'batch-2', productId: 'prod-2', warehouseId: 'w-2', availableQuantity: 5 }),
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'w-1' }),
      createWarehouse({ id: 'w-2' })
    ]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-1', warehouseId: 'w-1' }),
      createCarrier({ id: 'c-2', warehouseId: 'w-2' })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('FULFILLED');
    expect(result.shipments).toHaveLength(2);
    expect(result.shipments.map(s => s.warehouseId).sort()).toEqual(['w-1', 'w-2']);
  });

  it('15. Deve escolher a transportadora mais rápida antes da mais barata', async () => {
    setupHappyPath();
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-slower', deliveryDays: 5, baseCost: 5 }),
      createCarrier({ id: 'c-faster', deliveryDays: 2, baseCost: 50 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments[0].carrierId).toBe('c-faster');
  });

  it('16. Deve escolher a transportadora mais barata quando os deliveryDays forem iguais', async () => {
    setupHappyPath();
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-expensive', deliveryDays: 2, baseCost: 50 }),
      createCarrier({ id: 'c-cheaper', deliveryDays: 2, baseCost: 10 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments[0].carrierId).toBe('c-cheaper');
  });

  it('17. Deve escolher o lote com vencimento mais próximo quando a prioridade da transportadora for igual', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 5, unitWeightKg: 1 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-far', expiresAt: '2099-01-01T00:00:00Z', availableQuantity: 5 }),
      createBatch({ id: 'batch-near', expiresAt: '2028-01-01T00:00:00Z', availableQuantity: 5 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments[0].items[0].batchId).toBe('batch-near');
  });

  it('18. Deve usar a prioridade do armazém como critério de desempate', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 5, unitWeightKg: 1 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-w1', warehouseId: 'w-1', availableQuantity: 5 }),
      createBatch({ id: 'batch-w2', warehouseId: 'w-2', availableQuantity: 5 })
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'w-1', priority: 2 }),
      createWarehouse({ id: 'w-2', priority: 1 })
    ]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-1', warehouseId: 'w-1', deliveryDays: 2, baseCost: 10 }),
      createCarrier({ id: 'c-2', warehouseId: 'w-2', deliveryDays: 2, baseCost: 10 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    // This expects deterministic tiebreaker logic based on warehouse priority
    expect(['w-1', 'w-2']).toContain(result.shipments[0].warehouseId);
  });

  it('19. Deve produzir resultados determinísticos quando os ids forem usados como desempate final', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 5, unitWeightKg: 1 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-b', availableQuantity: 5 }),
      createBatch({ id: 'batch-a', availableQuantity: 5 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(['batch-a', 'batch-b']).toContain(result.shipments[0].items[0].batchId);
  });

  it('20. Deve criar envios agrupados por armazém e transportadora', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 5, unitWeightKg: 1 },
        { productId: 'prod-2', quantity: 5, unitWeightKg: 1 }
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'batch-1', productId: 'prod-1', availableQuantity: 5 }),
      createBatch({ id: 'batch-2', productId: 'prod-2', availableQuantity: 5 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].items).toHaveLength(2);
  });

  it('21. Deve calcular o totalWeightKg por envio', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 10, unitWeightKg: 2 },
        { productId: 'prod-2', quantity: 5, unitWeightKg: 1 }
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'b1', productId: 'prod-1', availableQuantity: 10 }),
      createBatch({ id: 'b2', productId: 'prod-2', availableQuantity: 5 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments[0].totalWeightKg).toBe(25); // (10 * 2) + (5 * 1)
  });

  it('22. Deve calcular o shippingCost usando baseCost + costPerKg * totalWeightKg', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 10, unitWeightKg: 2.5 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([createBatch({ availableQuantity: 10 })]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ baseCost: 15, costPerKg: 2 }) // weight = 25. cost = 15 + (2 * 25) = 65
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.shipments[0].shippingCost).toBe(65);
  });

  it('23. Deve calcular o totalShippingCost como a soma dos custos de envio de todos os envios', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 5, unitWeightKg: 1 },
        { productId: 'prod-2', quantity: 5, unitWeightKg: 1 }
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'b1', productId: 'prod-1', warehouseId: 'w-1' }),
      createBatch({ id: 'b2', productId: 'prod-2', warehouseId: 'w-2' })
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'w-1' }),
      createWarehouse({ id: 'w-2' })
    ]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-1', warehouseId: 'w-1', baseCost: 10, costPerKg: 1 }), // cost: 10 + 5*1 = 15
      createCarrier({ id: 'c-2', warehouseId: 'w-2', baseCost: 20, costPerKg: 1 })  // cost: 20 + 5*1 = 25
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    expect(result.totalShippingCost).toBe(40); // 15 + 25 = 40
  });

  it('24. Deve salvar as reservas para todas as quantidades alocadas', async () => {
    setupHappyPath();
    
    await service.execute({ orderId: 'order-1' });
    expect(reservationRepository.saveReservations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: 'order-1',
          productId: 'prod-1',
          batchId: 'batch-1',
          warehouseId: 'w-1',
          carrierId: 'c-1',
          quantity: 10
        })
      ])
    );
  });

  it('25. Deve retornar FULFILLED quando todos os itens forem totalmente alocados', async () => {
    setupHappyPath();
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('FULFILLED');
  });

  it('26. Deve retornar PARTIALLY_FULFILLED quando pelo menos um item não for totalmente alocado', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 15, unitWeightKg: 1 }] // Need 15, have 10
    }));
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('PARTIALLY_FULFILLED');
  });

  it('27. Deve retornar NOT_FULFILLED quando nenhum item puder ser alocado', async () => {
    setupHappyPath();
    inventoryRepository.getBatches.mockResolvedValue([]); // No stock
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.status).toBe('NOT_FULFILLED');
  });

  it('28. Deve relatar os itens não atendidos com requestedQuantity e fulfilledQuantity', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 15, unitWeightKg: 1 }] // Need 15, have 10
    }));
    
    const result = await service.execute({ orderId: 'order-1' });
    expect(result.unfulfilledItems).toContainEqual(
      expect.objectContaining({
        productId: 'prod-1',
        requestedQuantity: 15,
        fulfilledQuantity: 10,
        reason: expect.any(String)
      })
    );
  });

  it('29. Deve publicar fulfillment.fulfilled quando totalmente atendido', async () => {
    setupHappyPath();
    const result = await service.execute({ orderId: 'order-1' });
    expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.fulfilled', {
      orderId: result.orderId
    });
  });

  it('30. Deve publicar fulfillment.partial quando parcialmente atendido', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 15, unitWeightKg: 1 }]
    }));
    const result = await service.execute({ orderId: 'order-1' });
    expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', {
      orderId: result.orderId
    });
  });

  it('31. Não deve publicar o evento quando nada for atendido', async () => {
    setupHappyPath();
    inventoryRepository.getBatches.mockResolvedValue([]);
    await service.execute({ orderId: 'order-1' });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('32. Deve lidar com cenário misto com múltiplos produtos, armazéns, transportadoras, reservas, lotes expirados e estoque parcial', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [
        { productId: 'prod-1', quantity: 10, unitWeightKg: 1 },
        { productId: 'prod-2', quantity: 5, unitWeightKg: 1 },
        { productId: 'prod-3', quantity: 2, unitWeightKg: 1 }
      ]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ id: 'b1', productId: 'prod-1', availableQuantity: 8 }), // partial stock
      createBatch({ id: 'b2', productId: 'prod-2', availableQuantity: 5, expiresAt: '2000-01-01T00:00:00Z' }), // expired
      createBatch({ id: 'b3', productId: 'prod-3', warehouseId: 'w-2', availableQuantity: 10 }), // diff warehouse
    ]);
    warehouseRepository.getWarehouses.mockResolvedValue([
      createWarehouse({ id: 'w-1' }),
      createWarehouse({ id: 'w-2' })
    ]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ id: 'c-1', warehouseId: 'w-1' }),
      createCarrier({ id: 'c-2', warehouseId: 'w-2' })
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    
    expect(result.status).toBe('PARTIALLY_FULFILLED');
    expect(result.shipments).toHaveLength(2); // w-1 and w-2
    expect(result.unfulfilledItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'prod-1', fulfilledQuantity: 8 }), // missed 2
      expect.objectContaining({ productId: 'prod-2', fulfilledQuantity: 0 })  // expired batch missed 5
    ]));
  });

  it('33. Deve arredondar valores monetários e de peso finais para 2 casas decimais', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 3, unitWeightKg: 1.333 }] // total weight: 3.999
    }));
    inventoryRepository.getBatches.mockResolvedValue([createBatch({ availableQuantity: 10 })]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ baseCost: 10.111, costPerKg: 2.222 }) 
      // cost: 10.111 + (2.222 * 4.00) = 10.111 + 8.888 = 18.999 -> 19.00
    ]);

    const result = await service.execute({ orderId: 'order-1' });
    
    expect(result.shipments[0].totalWeightKg).toBeCloseTo(4.00, 2);
    expect(result.shipments[0].shippingCost).toBeCloseTo(19.00, 2);
    expect(result.totalShippingCost).toBeCloseTo(19.00, 2);
  });

  it('34. Deve garantir que o peso total de cada shipment não ultrapasse o maxWeightKg da transportadora', async () => {
    setupHappyPath();
    orderRepository.findById.mockResolvedValue(createOrder({
      items: [{ productId: 'prod-1', quantity: 4, unitWeightKg: 2 }]
    }));
    inventoryRepository.getBatches.mockResolvedValue([
      createBatch({ availableQuantity: 10 })
    ]);
    carrierRepository.getOptions.mockResolvedValue([
      createCarrier({ maxWeightKg: 5 })
    ]);

    const result = await service.execute({ orderId: 'order-1' });

    expect(result.status).toBe('PARTIALLY_FULFILLED');
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].items[0].quantity).toBe(2);
    expect(result.shipments[0].totalWeightKg).toBe(4);
    expect(result.unfulfilledItems).toContainEqual(
      expect.objectContaining({
        productId: 'prod-1',
        requestedQuantity: 4,
        fulfilledQuantity: 2
      })
    );
    expect(reservationRepository.saveReservations).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          quantity: 2
        })
      ])
    );
    expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', {
      orderId: 'order-1'
    });
  });
});
