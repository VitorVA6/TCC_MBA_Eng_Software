import {
  OrderRepository,
  InventoryRepository,
  WarehouseRepository,
  CarrierRepository,
  ReservationRepository,
  EventBus,
  FulfillmentPlan
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

  async execute(input: {
    orderId: string;
  }): Promise<FulfillmentPlan> {
    throw new Error('Not implemented');
  }
}
