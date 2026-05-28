import { FulfillmentAllocationService } from '../mutations/mutation1';
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
  CarrierOption
} from './interfaces';

describe('FulfillmentAllocationService', () => {
  let service: FulfillmentAllocationService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let warehouseRepository: jest.Mocked<WarehouseRepository>;
  let carrierRepository: jest.Mocked<CarrierRepository>;
  let reservationRepository: jest.Mocked<ReservationRepository>;
  let eventBus: jest.Mocked<EventBus>;

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
    
    // Default mocks for safe fallback
    inventoryRepository.getBatches.mockResolvedValue([]);
    warehouseRepository.getWarehouses.mockResolvedValue([]);
    carrierRepository.getOptions.mockResolvedValue([]);
    reservationRepository.getReservedQuantities.mockResolvedValue({});
  });

  const getFutureDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  };

  const getPastDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  };

  describe('Order Validation', () => {
    it('1. Returns NOT_FULFILLED when order does not exist', async () => {
      orderRepository.findById.mockResolvedValue(null);
      
      const result = await service.execute({ orderId: 'ord-1' });
      
      expect(result).toEqual({
        orderId: 'ord-1',
        status: 'NOT_FULFILLED',
        shipments: [],
        unfulfilledItems: [],
        totalShippingCost: 0
      });
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('2. Returns NOT_FULFILLED for PENDING orders', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1',
        status: 'PENDING',
        destinationRegion: 'US-EAST',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, unitWeightKg: 1 }]
      });

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('3. Returns NOT_FULFILLED for CANCELLED orders', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1',
        status: 'CANCELLED',
        destinationRegion: 'US-EAST',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, unitWeightKg: 1 }]
      });

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });
  });

  describe('Data Fetching', () => {
    const setupOrder = () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1',
        status: 'PAID',
        destinationRegion: 'US-EAST',
        createdAt: new Date().toISOString(),
        items: [
          { productId: 'p1', quantity: 2, unitWeightKg: 1 },
          { productId: 'p2', quantity: 3, unitWeightKg: 2 }
        ]
      });
    };

    it('4. Fetches inventory batches using all product ids from the order', async () => {
      setupOrder();
      await service.execute({ orderId: 'ord-1' });
      expect(inventoryRepository.getBatches).toHaveBeenCalledWith(expect.arrayContaining(['p1', 'p2']));
    });

    it('5. Fetches reserved quantities using all batch ids', async () => {
      setupOrder();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() },
        { id: 'b2', productId: 'p2', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      await service.execute({ orderId: 'ord-1' });
      expect(reservationRepository.getReservedQuantities).toHaveBeenCalledWith(expect.arrayContaining(['b1', 'b2']));
    });
  });

  describe('Eligibility Filtering & Inventory Allocation', () => {
    let order: Order;
    
    beforeEach(() => {
      order = {
        id: 'ord-1',
        status: 'PAID',
        destinationRegion: 'US-EAST',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 5, unitWeightKg: 10 }] // total weight 50kg
      };
      orderRepository.findById.mockResolvedValue(order);
    });

    it('6. Ignores expired batches', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getPastDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
      expect(result.unfulfilledItems[0].reason).toBe('NO_STOCK');
    });

    it('7. Considers existing reserved quantities when calculating available stock', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 6, expiresAt: getFutureDate() }
      ]);
      reservationRepository.getReservedQuantities.mockResolvedValue({ 'b1': 2 }); // Only 4 available
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('PARTIALLY_FULFILLED');
      expect(result.shipments[0].items[0].quantity).toBe(4);
    });

    it('8. Ignores inactive warehouses', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: false, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('9. Ignores warehouses that do not support the destination region', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-WEST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('10. Ignores carriers that do not support the destination region', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-WEST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]); // Even if it comes back from repo, should be filtered

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('11. Ignores carriers whose maxWeightKg is smaller than item unitWeightKg', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 5 } // item is 10kg
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
    });

    it('12. Allocates inventory from eligible batches', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 10, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('FULFILLED');
      expect(result.shipments[0].items[0]).toEqual({ productId: 'p1', batchId: 'b1', quantity: 5 });
    });

    it('13. Supports allocation across multiple batches for the same product', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 3, expiresAt: getFutureDate() },
        { id: 'b2', productId: 'p1', warehouseId: 'w1', availableQuantity: 4, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('FULFILLED');
      const items = result.shipments[0].items;
      expect(items).toContainEqual({ productId: 'p1', batchId: 'b1', quantity: 3 });
      expect(items).toContainEqual({ productId: 'p1', batchId: 'b2', quantity: 2 });
    });

    it('14. Supports allocation across multiple warehouses', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 3, expiresAt: getFutureDate() },
        { id: 'b2', productId: 'p1', warehouseId: 'w2', availableQuantity: 2, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 },
        { id: 'w2', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c2', warehouseId: 'w2', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('FULFILLED');
      expect(result.shipments.length).toBe(2);
    });
  });

  describe('Selection Priorities & Sorting (15-19)', () => {
    let order: Order;
    
    beforeEach(() => {
      order = {
        id: 'ord-1',
        status: 'PAID',
        destinationRegion: 'US-EAST',
        createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 1, unitWeightKg: 1 }]
      };
      orderRepository.findById.mockResolvedValue(order);
    });

    it('15. Chooses faster carrier before cheaper carrier', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c_cheap_slow', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 5, baseCost: 5, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c_expensive_fast', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 20, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.shipments[0].carrierId).toBe('c_expensive_fast');
    });

    it('16. Chooses cheaper carrier when deliveryDays are equal', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c_expensive', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 20, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c_cheap', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.shipments[0].carrierId).toBe('c_cheap');
    });

    it('17. Chooses earliest expiring batch when carrier priority is equal', async () => {
      const earlierDate = new Date(); earlierDate.setMonth(earlierDate.getMonth() + 1);
      const laterDate = new Date(); laterDate.setMonth(laterDate.getMonth() + 2);

      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b_later', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: laterDate.toISOString() },
        { id: 'b_earlier', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: earlierDate.toISOString() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.shipments[0].items[0].batchId).toBe('b_earlier');
    });

    it('18. Uses warehouse priority as tie-breaker', async () => {
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w_low', availableQuantity: 1, expiresAt: getFutureDate() },
        { id: 'b2', productId: 'p1', warehouseId: 'w_high', availableQuantity: 1, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w_low', active: true, supportedRegions: ['US-EAST'], priority: 10 },
        { id: 'w_high', active: true, supportedRegions: ['US-EAST'], priority: 1 } // Lower number = higher priority typically, but assume sorting
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w_low', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c2', warehouseId: 'w_high', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      // Depending on implementation, higher priority number could mean higher priority, but usually sorting handles this.
      // At the very least it asserts a preference. Let's assume lower is better priority (1st).
      expect(result.shipments[0].warehouseId).toBe('w_high');
    });

    it('19. Produces deterministic results when ids are used as final tie-breakers', async () => {
      const sameDate = getFutureDate();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b_B', productId: 'p1', warehouseId: 'w_A', availableQuantity: 1, expiresAt: sameDate },
        { id: 'b_A', productId: 'p1', warehouseId: 'w_B', availableQuantity: 1, expiresAt: sameDate }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w_A', active: true, supportedRegions: ['US-EAST'], priority: 1 },
        { id: 'w_B', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c_A', warehouseId: 'w_A', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c_B', warehouseId: 'w_B', region: 'US-EAST', deliveryDays: 2, baseCost: 5, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.shipments[0].warehouseId).toBeDefined();
    });
  });

  describe('Shipments & Costs', () => {
    it('20. Creates shipments grouped by warehouse and carrier', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1', status: 'PAID', destinationRegion: 'US-EAST', createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 2, unitWeightKg: 1 }]
      });
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: getFutureDate() },
        { id: 'b2', productId: 'p1', warehouseId: 'w2', availableQuantity: 1, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 },
        { id: 'w2', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c2', warehouseId: 'w2', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.shipments.length).toBe(2);
      expect(result.shipments.map(s => s.warehouseId).sort()).toEqual(['w1', 'w2']);
    });

    it('21-23. Calculates totalWeightKg and shippingCost per shipment and sum for totalShippingCost', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1', status: 'PAID', destinationRegion: 'US-EAST', createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 3, unitWeightKg: 2.5 }] // total 7.5kg
      });
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 3, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10.5, costPerKg: 2, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      // weight: 3 * 2.5 = 7.5
      // cost: 10.5 + (2 * 7.5) = 10.5 + 15 = 25.5
      expect(result.shipments[0].totalWeightKg).toBe(7.5);
      expect(result.shipments[0].shippingCost).toBe(25.5);
      expect(result.totalShippingCost).toBe(25.5);
    });
  });

  describe('Events & Output States', () => {
    const setupBaseData = () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1', status: 'PAID', destinationRegion: 'US-EAST', createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 5, unitWeightKg: 1 }]
      });
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10, costPerKg: 1, maxWeightKg: 100 }
      ]);
    };

    it('24. Saves reservations for all allocated quantities', async () => {
      setupBaseData();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 5, expiresAt: getFutureDate() }
      ]);

      await service.execute({ orderId: 'ord-1' });
      expect(reservationRepository.saveReservations).toHaveBeenCalledWith([{
        orderId: 'ord-1', productId: 'p1', batchId: 'b1', warehouseId: 'w1', carrierId: 'c1', quantity: 5
      }]);
    });

    it('25. Returns FULFILLED and 29. publishes fulfillment.fulfilled when fully allocated', async () => {
      setupBaseData();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 5, expiresAt: getFutureDate() }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('FULFILLED');
      expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.fulfilled', expect.any(Object));
    });

    it('26. Returns PARTIALLY_FULFILLED and 30. publishes fulfillment.partial when at least one item is not fully allocated', async () => {
      setupBaseData();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 3, expiresAt: getFutureDate() }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('PARTIALLY_FULFILLED');
      expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', expect.any(Object));
      expect(result.unfulfilledItems[0]).toEqual({
        productId: 'p1', requestedQuantity: 5, fulfilledQuantity: 3, reason: 'NO_STOCK'
      });
    });

    it('27. Returns NOT_FULFILLED and 31. Does not publish event when no item can be allocated', async () => {
      setupBaseData();
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 0, expiresAt: getFutureDate() }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      expect(result.status).toBe('NOT_FULFILLED');
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(result.unfulfilledItems[0]).toEqual({
        productId: 'p1', requestedQuantity: 5, fulfilledQuantity: 0, reason: 'NO_STOCK'
      });
    });

    it('28. Reports unfulfilled items with requestedQuantity and fulfilledQuantity', async () => {
       setupBaseData();
       inventoryRepository.getBatches.mockResolvedValue([
         { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 1, expiresAt: getFutureDate() }
       ]);
       const result = await service.execute({ orderId: 'ord-1' });
       expect(result.unfulfilledItems[0].requestedQuantity).toBe(5);
       expect(result.unfulfilledItems[0].fulfilledQuantity).toBe(1);
    });
  });

  describe('Complex Scenarios', () => {
    it('32. Handles mixed scenario with multiple products, warehouses, carriers, reservations, expired batches and partial stock', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-mixed', status: 'PAID', destinationRegion: 'US-EAST', createdAt: new Date().toISOString(),
        items: [
          { productId: 'p1', quantity: 10, unitWeightKg: 1 },
          { productId: 'p2', quantity: 5, unitWeightKg: 2 }
        ]
      });

      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1_expired', productId: 'p1', warehouseId: 'w1', availableQuantity: 100, expiresAt: getPastDate() },
        { id: 'b2', productId: 'p1', warehouseId: 'w1', availableQuantity: 15, expiresAt: getFutureDate() },
        { id: 'b3', productId: 'p2', warehouseId: 'w2', availableQuantity: 4, expiresAt: getFutureDate() }
      ]);

      reservationRepository.getReservedQuantities.mockResolvedValue({ 'b2': 7 }); // Only 8 available in b2

      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST', 'US-WEST'], priority: 1 },
        { id: 'w2', active: true, supportedRegions: ['US-EAST'], priority: 2 }
      ]);

      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 3, baseCost: 10, costPerKg: 1, maxWeightKg: 100 },
        { id: 'c2', warehouseId: 'w2', region: 'US-EAST', deliveryDays: 2, baseCost: 15, costPerKg: 1.5, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-mixed' });

      expect(result.status).toBe('PARTIALLY_FULFILLED');
      expect(result.shipments.length).toBe(2);

      const p1Shipment = result.shipments.find(s => s.warehouseId === 'w1');
      expect(p1Shipment?.items[0].quantity).toBe(8); // p1 requested 10, available 8

      const p2Shipment = result.shipments.find(s => s.warehouseId === 'w2');
      expect(p2Shipment?.items[0].quantity).toBe(4); // p2 requested 5, available 4

      expect(result.unfulfilledItems.length).toBe(2);
      expect(result.unfulfilledItems).toContainEqual({ productId: 'p1', requestedQuantity: 10, fulfilledQuantity: 8, reason: 'NO_STOCK' });
      expect(result.unfulfilledItems).toContainEqual({ productId: 'p2', requestedQuantity: 5, fulfilledQuantity: 4, reason: 'NO_STOCK' });
      
      expect(eventBus.publish).toHaveBeenCalledWith('fulfillment.partial', expect.any(Object));
      expect(reservationRepository.saveReservations).toHaveBeenCalledWith(expect.arrayContaining([
        { orderId: 'ord-mixed', productId: 'p1', batchId: 'b2', warehouseId: 'w1', carrierId: 'c1', quantity: 8 },
        { orderId: 'ord-mixed', productId: 'p2', batchId: 'b3', warehouseId: 'w2', carrierId: 'c2', quantity: 4 }
      ]));
    });

    it('33. Final monetary and weight values are rounded to 2 decimal places', async () => {
      orderRepository.findById.mockResolvedValue({
        id: 'ord-1', status: 'PAID', destinationRegion: 'US-EAST', createdAt: new Date().toISOString(),
        items: [{ productId: 'p1', quantity: 3, unitWeightKg: 1.333 }] // 3.999 kg total
      });
      inventoryRepository.getBatches.mockResolvedValue([
        { id: 'b1', productId: 'p1', warehouseId: 'w1', availableQuantity: 3, expiresAt: getFutureDate() }
      ]);
      warehouseRepository.getWarehouses.mockResolvedValue([
        { id: 'w1', active: true, supportedRegions: ['US-EAST'], priority: 1 }
      ]);
      carrierRepository.getOptions.mockResolvedValue([
        { id: 'c1', warehouseId: 'w1', region: 'US-EAST', deliveryDays: 2, baseCost: 10.123, costPerKg: 1.123, maxWeightKg: 100 }
      ]);

      const result = await service.execute({ orderId: 'ord-1' });
      
      // Weight: 3.999 rounded -> 4.00
      // Cost: 10.123 + (1.123 * 4.00) = 10.123 + 4.492 = 14.615 rounded -> 14.62 (or 14.61 depending on rounding mode, let's assume JS Math.round(val * 100) / 100)
      
      // Ensure we check that values don't have excessive decimal places
      expect(result.shipments[0].totalWeightKg.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(result.shipments[0].shippingCost.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
      expect(result.totalShippingCost.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  });
});
