import {
  OrderRepository,
  InventoryRepository,
  WarehouseRepository,
  CarrierRepository,
  ReservationRepository,
  EventBus,
  FulfillmentPlan,
  Order,
  InventoryBatch,
  Warehouse,
  CarrierOption,
  Reservation,
  Shipment
} from '../contract/interfaces';

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export class FulfillmentAllocationService {
  constructor(
    private orderRepository: OrderRepository,
    private inventoryRepository: InventoryRepository,
    private warehouseRepository: WarehouseRepository,
    private carrierRepository: CarrierRepository,
    private reservationRepository: ReservationRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: {
    orderId: string;
  }): Promise<FulfillmentPlan> {
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

    const productIds = Array.from(
      new Set(order.items.map(item => item.productId))
    );

    const batches = await this.inventoryRepository.getBatches(productIds);
    const batchIds = batches.map(batch => batch.id);

    const reservedByBatch =
      await this.reservationRepository.getReservedQuantities(batchIds);

    const warehouses = await this.warehouseRepository.getWarehouses();
    const carriers = await this.carrierRepository.getOptions(
      order.destinationRegion
    );

    const warehouseById = new Map<string, Warehouse>();
    for (const warehouse of warehouses) {
      warehouseById.set(warehouse.id, warehouse);
    }

    const carriersByWarehouse = new Map<string, CarrierOption[]>();
    for (const carrier of carriers) {
      const list = carriersByWarehouse.get(carrier.warehouseId) ?? [];
      list.push(carrier);
      carriersByWarehouse.set(carrier.warehouseId, list);
    }

    const remainingByBatch = new Map<string, number>();

    for (const batch of batches) {
      const reserved = reservedByBatch[batch.id] ?? 0;
      remainingByBatch.set(
        batch.id,
        Math.max(batch.availableQuantity - reserved, 0)
      );
    }

    const reservations: Reservation[] = [];
    const shipmentMap = new Map<string, Shipment>();

    const unfulfilledItems: FulfillmentPlan['unfulfilledItems'] = [];

    for (const item of order.items) {
      let remainingQuantity = item.quantity;
      let fulfilledQuantity = 0;

      const candidates = this.buildCandidates({
        order,
        itemProductId: item.productId,
        itemUnitWeightKg: item.unitWeightKg,
        batches,
        remainingByBatch,
        warehouseById,
        carriersByWarehouse
      });

      for (const candidate of candidates) {
        if (remainingQuantity <= 0) {
          break;
        }

        const available = remainingByBatch.get(candidate.batch.id) ?? 0;

        if (available <= 0) {
          continue;
        }

        const quantity = Math.min(available, remainingQuantity);

        remainingByBatch.set(candidate.batch.id, available - quantity);

        fulfilledQuantity += quantity;
        remainingQuantity -= quantity;

        reservations.push({
          orderId: order.id,
          productId: item.productId,
          batchId: candidate.batch.id,
          warehouseId: candidate.batch.warehouseId,
          carrierId: candidate.carrier.id,
          quantity
        });

        const shipmentKey = `${candidate.batch.warehouseId}:${candidate.carrier.id}`;

        let shipment = shipmentMap.get(shipmentKey);

        if (!shipment) {
          shipment = {
            warehouseId: candidate.batch.warehouseId,
            carrierId: candidate.carrier.id,
            items: [],
            totalWeightKg: 0,
            shippingCost: 0
          };

          shipmentMap.set(shipmentKey, shipment);
        }

        shipment.items.push({
          productId: item.productId,
          batchId: candidate.batch.id,
          quantity
        });

        shipment.totalWeightKg += quantity * item.unitWeightKg;
      }

      if (fulfilledQuantity < item.quantity) {
        unfulfilledItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          fulfilledQuantity,
          reason: this.resolveUnfulfilledReason({
            order,
            productId: item.productId,
            unitWeightKg: item.unitWeightKg,
            batches,
            remainingByBatch,
            warehouseById,
            carriersByWarehouse
          })
        });
      }
    }

    const shipments = Array.from(shipmentMap.values()).sort((a, b) => {
      if (a.warehouseId !== b.warehouseId) {
        return a.warehouseId.localeCompare(b.warehouseId);
      }

      return a.carrierId.localeCompare(b.carrierId);
    });

    for (const shipment of shipments) {
      const carrier = carriers.find(
        option =>
          option.id === shipment.carrierId &&
          option.warehouseId === shipment.warehouseId
      )!;

      shipment.totalWeightKg = round2(shipment.totalWeightKg);
      shipment.shippingCost = round2(
        carrier.baseCost + carrier.costPerKg * shipment.totalWeightKg
      );

      shipment.items.sort((a, b) => {
        if (a.productId !== b.productId) {
          return a.productId.localeCompare(b.productId);
        }

        return a.batchId.localeCompare(b.batchId);
      });
    }

    const totalShippingCost = round2(
      shipments.reduce((sum, shipment) => sum + shipment.shippingCost, 0)
    );

    let status: FulfillmentPlan['status'];

    if (shipments.length === 0) {
      status = 'NOT_FULFILLED';
    } else if (unfulfilledItems.length > 0) {
      status = 'PARTIALLY_FULFILLED';
    } else {
      status = 'FULFILLED';
    }

    const result: FulfillmentPlan = {
      orderId: order.id,
      status,
      shipments,
      unfulfilledItems,
      totalShippingCost
    };

    if (reservations.length > 0) {
      await this.reservationRepository.saveReservations(reservations);
    }

    if (status === 'FULFILLED') {
      await this.eventBus.publish('fulfillment.fulfilled', {
        orderId: order.id
      });
    }

    if (status === 'PARTIALLY_FULFILLED') {
      await this.eventBus.publish('fulfillment.partial', {
        orderId: order.id,
        unfulfilledItems
      });
    }

    return result;
  }

  private buildCandidates(input: {
    order: Order;
    itemProductId: string;
    itemUnitWeightKg: number;
    batches: InventoryBatch[];
    remainingByBatch: Map<string, number>;
    warehouseById: Map<string, Warehouse>;
    carriersByWarehouse: Map<string, CarrierOption[]>;
  }): Array<{
    batch: InventoryBatch;
    warehouse: Warehouse;
    carrier: CarrierOption;
  }> {
    const candidates: Array<{
      batch: InventoryBatch;
      warehouse: Warehouse;
      carrier: CarrierOption;
    }> = [];

    for (const batch of input.batches) {
      if (batch.productId !== input.itemProductId) {
        continue;
      }

      if (batch.expiresAt <= input.order.createdAt) {
        continue;
      }

      const available = input.remainingByBatch.get(batch.id) ?? 0;

      if (available <= 0) {
        continue;
      }

      const warehouse = input.warehouseById.get(batch.warehouseId);

      if (!warehouse) {
        continue;
      }

      if (!warehouse.active) {
        continue;
      }

      const carriers =
        input.carriersByWarehouse.get(batch.warehouseId) ?? [];

      const eligibleCarriers = carriers.filter(
        carrier =>
          carrier.region === input.order.destinationRegion &&
          carrier.maxWeightKg >= input.itemUnitWeightKg
      );

      if (eligibleCarriers.length === 0) {
        continue;
      }

      eligibleCarriers.sort((a, b) => {
        if (a.deliveryDays !== b.deliveryDays) {
          return a.deliveryDays - b.deliveryDays;
        }

        const aCost =
          a.baseCost + a.costPerKg * input.itemUnitWeightKg;

        const bCost =
          b.baseCost + b.costPerKg * input.itemUnitWeightKg;

        if (aCost !== bCost) {
          return aCost - bCost;
        }

        return a.id.localeCompare(b.id);
      });

      candidates.push({
        batch,
        warehouse,
        carrier: eligibleCarriers[0]
      });
    }

    candidates.sort((a, b) => {
      if (a.carrier.deliveryDays !== b.carrier.deliveryDays) {
        return a.carrier.deliveryDays - b.carrier.deliveryDays;
      }

      const aCost =
        a.carrier.baseCost + a.carrier.costPerKg * input.itemUnitWeightKg;

      const bCost =
        b.carrier.baseCost + b.carrier.costPerKg * input.itemUnitWeightKg;

      if (aCost !== bCost) {
        return aCost - bCost;
      }

      if (a.batch.expiresAt !== b.batch.expiresAt) {
        return a.batch.expiresAt.localeCompare(b.batch.expiresAt);
      }

      if (a.warehouse.priority !== b.warehouse.priority) {
        return a.warehouse.priority - b.warehouse.priority;
      }

      if (a.warehouse.id !== b.warehouse.id) {
        return a.warehouse.id.localeCompare(b.warehouse.id);
      }

      return a.batch.id.localeCompare(b.batch.id);
    });

    return candidates;
  }

  private resolveUnfulfilledReason(input: {
    order: Order;
    productId: string;
    unitWeightKg: number;
    batches: InventoryBatch[];
    remainingByBatch: Map<string, number>;
    warehouseById: Map<string, Warehouse>;
    carriersByWarehouse: Map<string, CarrierOption[]>;
  }): 'NO_STOCK' | 'NO_ELIGIBLE_WAREHOUSE' | 'NO_CARRIER' {
    const productBatches = input.batches.filter(
      batch =>
        batch.productId === input.productId &&
        batch.expiresAt > input.order.createdAt &&
        (input.remainingByBatch.get(batch.id) ?? 0) > 0
    );

    if (productBatches.length === 0) {
      return 'NO_STOCK';
    }

    const warehouseEligibleBatches = productBatches.filter(batch => {
      const warehouse = input.warehouseById.get(batch.warehouseId);

      return (
        warehouse &&
        warehouse.active &&
        warehouse.supportedRegions.includes(input.order.destinationRegion)
      );
    });

    if (warehouseEligibleBatches.length === 0) {
      return 'NO_ELIGIBLE_WAREHOUSE';
    }

    const hasCarrier = warehouseEligibleBatches.some(batch => {
      const carriers =
        input.carriersByWarehouse.get(batch.warehouseId) ?? [];

      return carriers.some(
        carrier =>
          carrier.region === input.order.destinationRegion &&
          carrier.maxWeightKg >= input.unitWeightKg
      );
    });

    if (!hasCarrier) {
      return 'NO_CARRIER';
    }

    return 'NO_STOCK';
  }
}
