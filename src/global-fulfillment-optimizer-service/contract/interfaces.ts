export interface Order {
  id: string;
  status: 'PAID' | 'PENDING' | 'CANCELLED';
  destinationNode: string;
  maxDeliveryDays: number;
  items: OrderItem[];
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitWeightKg: number;
}

export interface StockPosition {
  warehouseId: string;
  productId: string;
  quantity: number;
}

export interface Warehouse {
  id: string;
  active: boolean;
}

export interface RouteEdge {
  id: string;
  fromNode: string;
  toNode: string;
  active: boolean;
  fixedCost: number;
  costPerKg: number;
  maxWeightKg: number;
  deliveryDays: number;
}

export interface Allocation {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface ShipmentRoute {
  warehouseId: string;
  path: string[];
  totalWeightKg: number;
  cost: number;
}

export interface UnfulfilledItem {
  productId: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
}

export interface FulfillmentOptimizationResult {
  orderId: string;
  status: 'FULFILLED' | 'PARTIALLY_FULFILLED' | 'NOT_FULFILLED';
  allocations: Allocation[];
  shipments: ShipmentRoute[];
  unfulfilledItems: UnfulfilledItem[];
  totalCost: number;
}

export interface OrderRepository {
  findById(orderId: string): Promise<Order | null>;
}

export interface StockRepository {
  getStock(productIds: string[]): Promise<StockPosition[]>;
}

export interface WarehouseRepository {
  getWarehouses(): Promise<Warehouse[]>;
}

export interface RouteRepository {
  getEdges(): Promise<RouteEdge[]>;
}

export interface FulfillmentPlanRepository {
  save(result: FulfillmentOptimizationResult): Promise<void>;
}

export interface EventBus {
  publish(eventName: string, payload: unknown): Promise<void>;
}
