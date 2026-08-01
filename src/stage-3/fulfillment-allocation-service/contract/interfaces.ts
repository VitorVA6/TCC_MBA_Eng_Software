export interface Order {
  id: string;
  status: 'PAID' | 'PENDING' | 'CANCELLED';
  destinationRegion: string;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitWeightKg: number;
}

export interface InventoryBatch {
  id: string;
  productId: string;
  warehouseId: string;
  availableQuantity: number;
  expiresAt: string;
}

export interface Warehouse {
  id: string;
  active: boolean;
  supportedRegions: string[];
  priority: number;
}

export interface CarrierOption {
  id: string;
  warehouseId: string;
  region: string;
  deliveryDays: number;
  baseCost: number;
  costPerKg: number;
  maxWeightKg: number;
}

export interface Reservation {
  orderId: string;
  productId: string;
  batchId: string;
  warehouseId: string;
  carrierId: string;
  quantity: number;
}

export interface ShipmentItem {
  productId: string;
  batchId: string;
  quantity: number;
}

export interface Shipment {
  warehouseId: string;
  carrierId: string;
  items: ShipmentItem[];
  totalWeightKg: number;
  shippingCost: number;
}

export interface UnfulfilledItem {
  productId: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  reason: 'NO_STOCK' | 'NO_ELIGIBLE_WAREHOUSE' | 'NO_CARRIER';
}

export interface FulfillmentPlan {
  orderId: string;
  status: 'FULFILLED' | 'PARTIALLY_FULFILLED' | 'NOT_FULFILLED';
  shipments: Shipment[];
  unfulfilledItems: UnfulfilledItem[];
  totalShippingCost: number;
}

export interface OrderRepository {
  findById(orderId: string): Promise<Order | null>;
}

export interface InventoryRepository {
  getBatches(productIds: string[]): Promise<InventoryBatch[]>;
}

export interface WarehouseRepository {
  getWarehouses(): Promise<Warehouse[]>;
}

export interface CarrierRepository {
  getOptions(region: string): Promise<CarrierOption[]>;
}

export interface ReservationRepository {
  getReservedQuantities(batchIds: string[]): Promise<Record<string, number>>;
  saveReservations(reservations: Reservation[]): Promise<void>;
}

export interface EventBus {
  publish(eventName: string, payload: unknown): Promise<void>;
}
