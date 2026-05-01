import { GlobalFulfillmentOptimizerService } from '../mutations/mutation8';
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
  RouteEdge
} from './interfaces';

describe('GlobalFulfillmentOptimizerService', () => {
  let service: GlobalFulfillmentOptimizerService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let stockRepository: jest.Mocked<StockRepository>;
  let warehouseRepository: jest.Mocked<WarehouseRepository>;
  let routeRepository: jest.Mocked<RouteRepository>;
  let fulfillmentPlanRepository: jest.Mocked<FulfillmentPlanRepository>;
  let eventBus: jest.Mocked<EventBus>;

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

  const createBaseOrder = (): Order => ({
    id: 'ORDER-123',
    status: 'PAID',
    destinationNode: 'DEST-1',
    maxDeliveryDays: 5,
    items: [{ productId: 'PROD-A', quantity: 10, unitWeightKg: 1.5 }],
  });

  describe('Order status validation', () => {
    it('1. Returns NOT_FULFILLED when order does not exist', async () => {
      orderRepository.findById.mockResolvedValue(null);
      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
      expect(result.totalCost).toBe(0);
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('2. Returns NOT_FULFILLED for PENDING orders', async () => {
      orderRepository.findById.mockResolvedValue({ ...createBaseOrder(), status: 'PENDING' });
      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('3. Returns NOT_FULFILLED for CANCELLED orders', async () => {
      orderRepository.findById.mockResolvedValue({ ...createBaseOrder(), status: 'CANCELLED' });
      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
    });
  });

  describe('Data fetching and filtering', () => {
    it('4. Fetches stock using all unique product ids from the order', async () => {
      const order = createBaseOrder();
      order.items.push({ productId: 'PROD-B', quantity: 5, unitWeightKg: 2.0 });
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([]);
      routeRepository.getEdges.mockResolvedValue([]);
      stockRepository.getStock.mockResolvedValue([]);

      await service.execute({ orderId: 'ORDER-123' });
      expect(stockRepository.getStock).toHaveBeenCalledWith(['PROD-A', 'PROD-B']);
    });

    it('5. Ignores stock from inactive warehouses & 6. Ignores stock positions with zero quantity', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'WH-ACTIVE', active: true },
        { id: 'WH-INACTIVE', active: false },
      ]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-ACTIVE', productId: 'PROD-A', quantity: 0 }, // zero quantity
        { warehouseId: 'WH-INACTIVE', productId: 'PROD-A', quantity: 100 }, // inactive WH
      ]);
      routeRepository.getEdges.mockResolvedValue([]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('7. Ignores inactive route edges & 8. Finds a valid multi-hop route from warehouse to destination', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder()); // DEST-1
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'NODE-A', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
        { id: 'E2', fromNode: 'NODE-A', toNode: 'DEST-1', active: false, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 }, // Inactive hop
        { id: 'E3', fromNode: 'NODE-A', toNode: 'DEST-1', active: true, fixedCost: 5, costPerKg: 2, maxWeightKg: 100, deliveryDays: 2 }, // Active alternative
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('FULFILLED');
      expect(result.shipments[0].path).toEqual(['WH-1', 'NODE-A', 'DEST-1']);
    });
  });

  describe('Route and constraint validation', () => {
    it('9. Ignores routes whose maxWeightKg is smaller than shipment total weight', async () => {
      const order = createBaseOrder(); // 10 items * 1.5kg = 15kg
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 10, deliveryDays: 1 }, // Too small
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('10. Ignores routes whose total deliveryDays exceeds order maxDeliveryDays', async () => {
      const order = createBaseOrder(); // maxDeliveryDays: 5
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 6 }, // Too slow
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
    });
  });

  describe('Calculation and optimization', () => {
    it('11. Groups allocations by warehouse, 12. Calculates shipment totalWeightKg correctly, & 13. Calculates route cost (sum(fixed + costPerKg * weight))', async () => {
      const order = createBaseOrder();
      order.items.push({ productId: 'PROD-B', quantity: 2, unitWeightKg: 2.5 }); // total weight: 10*1.5 + 2*2.5 = 20kg
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-1', productId: 'PROD-B', quantity: 2 },
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'NODE-A', active: true, fixedCost: 10, costPerKg: 0.5, maxWeightKg: 100, deliveryDays: 1 },
        { id: 'E2', fromNode: 'NODE-A', toNode: 'DEST-1', active: true, fixedCost: 5, costPerKg: 1.5, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.allocations.length).toBe(2);
      expect(result.shipments.length).toBe(1);
      expect(result.shipments[0].warehouseId).toBe('WH-1');
      expect(result.shipments[0].totalWeightKg).toBe(20.00); // 15 + 5

      // Cost E1: 10 + (0.5 * 20) = 20
      // Cost E2: 5 + (1.5 * 20) = 35
      // Total cost = 55
      expect(result.totalCost).toBe(55.00);
      expect(result.shipments[0].cost).toBe(55.00);
    });

    it('14. Minimizes total cost globally & 15. Does not use greedy per-item allocation when it produces higher total cost', async () => {
      const order = createBaseOrder(); // 1 item: 10 of A, weight 15kg
      order.items.push({ productId: 'PROD-B', quantity: 5, unitWeightKg: 1 }); // 5 of B, weight 5kg
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'WH-1', active: true },
        { id: 'WH-2', active: true }
      ]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-1', productId: 'PROD-B', quantity: 5 },
        { warehouseId: 'WH-2', productId: 'PROD-B', quantity: 5 },
      ]);
      
      routeRepository.getEdges.mockResolvedValue([
        // WH-1 route: Fixed 100, perKg 1. (Consolidated cost = 100 + 1 * 20kg = 120)
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 100, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
        // WH-2 route: Fixed 10, perKg 1. (Split cost for B = 10 + 1 * 5kg = 15. But splitting means WH-1 sends A for 100 + 1*15kg = 115. Total = 130)
        { id: 'E2', fromNode: 'WH-2', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      // Greedy would pick WH-2 for PROD-B because route E2 is cheaper than E1 for that item individually.
      // But globally, grouping everything in WH-1 (cost 120) is cheaper than splitting (cost 130).
      expect(result.shipments.length).toBe(1);
      expect(result.shipments[0].warehouseId).toBe('WH-1');
      expect(result.totalCost).toBe(120.00);
    });

    it('16. Supports splitting fulfillment across multiple warehouses when necessary', async () => {
      const order = createBaseOrder();
      order.items.push({ productId: 'PROD-B', quantity: 5, unitWeightKg: 1 });
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }, { id: 'WH-2', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-2', productId: 'PROD-B', quantity: 5 },
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
        { id: 'E2', fromNode: 'WH-2', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('FULFILLED');
      expect(result.shipments.length).toBe(2);
      expect(result.allocations).toEqual(expect.arrayContaining([
        { productId: 'PROD-A', warehouseId: 'WH-1', quantity: 10 },
        { productId: 'PROD-B', warehouseId: 'WH-2', quantity: 5 },
      ]));
    });

    it('17. Prefers full fulfillment over cheaper partial fulfillment', async () => {
      const order = createBaseOrder();
      order.items.push({ productId: 'PROD-B', quantity: 5, unitWeightKg: 1 });
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }, { id: 'WH-2', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-2', productId: 'PROD-B', quantity: 5 },
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 1, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 }, // Cheap
        { id: 'E2', fromNode: 'WH-2', toNode: 'DEST-1', active: true, fixedCost: 9999, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 }, // Very Expensive
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('FULFILLED');
      expect(result.unfulfilledItems.length).toBe(0);
      expect(result.totalCost).toBeGreaterThan(9999);
    });

    it('21. Uses deterministic tie-breaking when two plans have same fulfilled quantity and same total cost', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-B', active: true }, { id: 'WH-A', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-B', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-A', productId: 'PROD-A', quantity: 10 },
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-B', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
        { id: 'E2', fromNode: 'WH-A', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result1 = await service.execute({ orderId: 'ORDER-123' });
      const result2 = await service.execute({ orderId: 'ORDER-123' });
      expect(result1.shipments[0].warehouseId).toBe(result2.shipments[0].warehouseId);
    });
  });

  describe('Fulfillment statuses & Reporting', () => {
    it('18. Returns PARTIALLY_FULFILLED when only part of the order can be fulfilled & 20. Reports unfulfilled items', async () => {
      const order = createBaseOrder();
      order.items.push({ productId: 'PROD-B', quantity: 5, unitWeightKg: 1 });
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 },
        { warehouseId: 'WH-1', productId: 'PROD-B', quantity: 2 }, // Only 2 available
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('PARTIALLY_FULFILLED');
      expect(result.unfulfilledItems).toContainEqual({
        productId: 'PROD-B',
        requestedQuantity: 5,
        fulfilledQuantity: 2,
      });
    });

    it('19. Returns NOT_FULFILLED when no item can be fulfilled', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([
        { warehouseId: 'WH-1', productId: 'PROD-A', quantity: 0 },
      ]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.status).toBe('NOT_FULFILLED');
      expect(result.unfulfilledItems).toEqual([{ productId: 'PROD-A', requestedQuantity: 10, fulfilledQuantity: 0 }]);
    });
  });

  describe('Persistence and Side Effects', () => {
    it('22. Saves the same result returned by execute', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(fulfillmentPlanRepository.save).toHaveBeenCalledWith(result);
    });

    it('23. Publishes fulfillment.optimized when fully fulfilled', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      await service.execute({ orderId: 'ORDER-123' });

      expect(eventBus.publish).toHaveBeenCalledWith(
        'fulfillment.optimized',
        { orderId: 'ORDER-123' }
      );
    });

    it('24. Publishes fulfillment.partial when partially fulfilled', async () => {
      const order = createBaseOrder();
      order.items[0].quantity = 20; // Need 20
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]); // Only 10 available
      routeRepository.getEdges.mockResolvedValue([
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10, costPerKg: 1, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      await service.execute({ orderId: 'ORDER-123' });
      expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', { orderId: 'ORDER-123' });
    });

    it('25. Does not publish event when nothing is fulfilled', async () => {
      orderRepository.findById.mockResolvedValue(createBaseOrder());
      warehouseRepository.getWarehouses.mockResolvedValue([]);
      
      await service.execute({ orderId: 'ORDER-123' });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('Precision formatting', () => {
    it('26. Final monetary and weight fields are rounded to 2 decimal places', async () => {
      const order = createBaseOrder();
      order.items[0].unitWeightKg = 1.33333; // Will result in 13.3333... weight
      orderRepository.findById.mockResolvedValue(order);
      warehouseRepository.getWarehouses.mockResolvedValue([{ id: 'WH-1', active: true }]);
      stockRepository.getStock.mockResolvedValue([{ warehouseId: 'WH-1', productId: 'PROD-A', quantity: 10 }]);
      routeRepository.getEdges.mockResolvedValue([
        // Cost: 10.1234 + (1.1111 * 13.33)
        { id: 'E1', fromNode: 'WH-1', toNode: 'DEST-1', active: true, fixedCost: 10.1234, costPerKg: 1.1111, maxWeightKg: 100, deliveryDays: 1 },
      ]);

      const result = await service.execute({ orderId: 'ORDER-123' });
      expect(result.shipments[0].totalWeightKg).toBe(13.33);
      
      const expectedCost = Number((10.1234 + (1.1111 * 13.3333)).toFixed(2));
      expect(result.shipments[0].cost).toBe(expectedCost);
      expect(result.totalCost).toBe(expectedCost);
    });
  });
});
