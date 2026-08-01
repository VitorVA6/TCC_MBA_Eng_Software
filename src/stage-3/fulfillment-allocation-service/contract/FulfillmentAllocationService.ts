import {
  OrderRepository,
  InventoryRepository,
  WarehouseRepository,
  CarrierRepository,
  ReservationRepository,
  EventBus,
  FulfillmentPlan,
  Shipment,
  UnfulfilledItem
} from './interfaces';

export class FulfillmentAllocationService {
  constructor(
    private orderRepository: OrderRepository,
    private inventoryRepository: InventoryRepository,
    private warehouseRepository: WarehouseRepository,
    private carrierRepository: CarrierRepository,
    private reservationRepository: ReservationRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: { orderId: string }): Promise<FulfillmentPlan> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order || order.status !== 'PAID') {
      return {
        orderId: input.orderId,
        status: 'NOT_FULFILLED',
        shipments: [],
        unfulfilledItems: [],
        totalShippingCost: 0
      };
    }

    const productIds = Array.from(new Set(order.items.map(i => i.productId)));
    const batches = await this.inventoryRepository.getBatches(productIds);
    const batchIds = batches.map(b => b.id);
    const reservedQuantities = await this.reservationRepository.getReservedQuantities(batchIds);
    const warehouses = await this.warehouseRepository.getWarehouses();
    const carriers = await this.carrierRepository.getOptions(order.destinationRegion);

    const now = new Date();

    const batchAvailableQty = new Map<string, number>();
    for (const batch of batches) {
      const reserved = reservedQuantities[batch.id] || 0;
      batchAvailableQty.set(batch.id, batch.availableQuantity - reserved);
    }

    const allocations: any[] = [];
    const unfulfilledItems: UnfulfilledItem[] = [];

    for (const item of order.items) {
      let remainingQty = item.quantity;
      
      let hasStock = false;
      let hasValidWarehouse = false;
      let hasValidCarrier = false;
      
      const options = [];
      
      for (const batch of batches.filter(b => b.productId === item.productId)) {
        if (new Date(batch.expiresAt).getTime() <= now.getTime()) continue;
        
        const available = batchAvailableQty.get(batch.id) || 0;
        if (available <= 0) continue;
        
        hasStock = true;
        
        const warehouse = warehouses.find(w => w.id === batch.warehouseId);
        if (!warehouse || !warehouse.active || !warehouse.supportedRegions.includes(order.destinationRegion)) {
          continue;
        }
        
        hasValidWarehouse = true;
        
        const eligibleCarriers = carriers.filter(c => 
          c.warehouseId === warehouse.id && 
          c.region === order.destinationRegion &&
          c.maxWeightKg >= item.unitWeightKg
        );
        
        if (eligibleCarriers.length === 0) continue;
        
        hasValidCarrier = true;
        
        eligibleCarriers.sort((a, b) => {
          if (a.deliveryDays !== b.deliveryDays) return a.deliveryDays - b.deliveryDays;
          if (a.baseCost !== b.baseCost) return a.baseCost - b.baseCost;
          return a.id.localeCompare(b.id);
        });
        
        const bestCarrier = eligibleCarriers[0];
        
        options.push({
          batch,
          warehouse,
          carrier: bestCarrier,
          availableQty: available
        });
      }
      
      options.sort((a, b) => {
        if (a.carrier.deliveryDays !== b.carrier.deliveryDays) return a.carrier.deliveryDays - b.carrier.deliveryDays;
        if (a.carrier.baseCost !== b.carrier.baseCost) return a.carrier.baseCost - b.carrier.baseCost;
        
        const dateA = new Date(a.batch.expiresAt).getTime();
        const dateB = new Date(b.batch.expiresAt).getTime();
        if (dateA !== dateB) return dateA - dateB;
        
        if (a.warehouse.priority !== b.warehouse.priority) return b.warehouse.priority - a.warehouse.priority;
        
        return a.batch.id.localeCompare(b.batch.id);
      });
      
      for (const option of options) {
        if (remainingQty <= 0) break;
        
        const currentAvailable = batchAvailableQty.get(option.batch.id) || 0;
        if (currentAvailable <= 0) continue;
        
        const allocateQty = Math.min(remainingQty, currentAvailable);
        
        allocations.push({
          productId: item.productId,
          batchId: option.batch.id,
          warehouseId: option.warehouse.id,
          carrierId: option.carrier.id,
          quantity: allocateQty,
          unitWeightKg: item.unitWeightKg
        });
        
        remainingQty -= allocateQty;
        batchAvailableQty.set(option.batch.id, currentAvailable - allocateQty);
      }
      
      if (remainingQty > 0) {
        let reason: 'NO_STOCK' | 'NO_ELIGIBLE_WAREHOUSE' | 'NO_CARRIER' = 'NO_STOCK';
        if (hasValidCarrier) reason = 'NO_STOCK';
        else if (hasValidWarehouse) reason = 'NO_CARRIER';
        else if (hasStock) reason = 'NO_ELIGIBLE_WAREHOUSE';
        
        unfulfilledItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          fulfilledQuantity: item.quantity - remainingQty,
          reason
        });
      }
    }

    const shipmentsMap = new Map<string, Shipment>();
    for (const alloc of allocations) {
      const key = `${alloc.warehouseId}_${alloc.carrierId}`;
      if (!shipmentsMap.has(key)) {
        shipmentsMap.set(key, {
          warehouseId: alloc.warehouseId,
          carrierId: alloc.carrierId,
          items: [],
          totalWeightKg: 0,
          shippingCost: 0
        });
      }
      
      const shipment = shipmentsMap.get(key)!;
      shipment.items.push({
        productId: alloc.productId,
        batchId: alloc.batchId,
        quantity: alloc.quantity
      });
      
      shipment.totalWeightKg += alloc.quantity * alloc.unitWeightKg;
    }

    let totalShippingCost = 0;
    const shipments: Shipment[] = [];

    for (const shipment of shipmentsMap.values()) {
      shipment.totalWeightKg = Number(shipment.totalWeightKg.toFixed(2));
      
      const carrier = carriers.find(c => c.id === shipment.carrierId)!;
      shipment.shippingCost = Number((carrier.baseCost + carrier.costPerKg * shipment.totalWeightKg).toFixed(2));
      
      totalShippingCost += shipment.shippingCost;
      shipments.push(shipment);
    }

    totalShippingCost = Number(totalShippingCost.toFixed(2));

    let status: 'FULFILLED' | 'PARTIALLY_FULFILLED' | 'NOT_FULFILLED';
    if (allocations.length === 0) {
      status = 'NOT_FULFILLED';
    } else if (unfulfilledItems.length > 0) {
      status = 'PARTIALLY_FULFILLED';
    } else {
      status = 'FULFILLED';
    }

    if (allocations.length > 0) {
      const reservations = allocations.map(a => ({
        orderId: order.id,
        productId: a.productId,
        batchId: a.batchId,
        warehouseId: a.warehouseId,
        carrierId: a.carrierId,
        quantity: a.quantity
      }));
      await this.reservationRepository.saveReservations(reservations);
    }

    if (status === 'FULFILLED') {
      await this.eventBus.publish('fulfillment.fulfilled', { orderId: order.id });
    } else if (status === 'PARTIALLY_FULFILLED') {
      await this.eventBus.publish('fulfillment.partial', { orderId: order.id });
    }

    return {
      orderId: order.id,
      status,
      shipments,
      unfulfilledItems,
      totalShippingCost
    };
  }
}
