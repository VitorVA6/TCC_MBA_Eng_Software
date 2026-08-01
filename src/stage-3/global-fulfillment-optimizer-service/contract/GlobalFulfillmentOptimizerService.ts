import {
  OrderRepository,
  StockRepository,
  WarehouseRepository,
  RouteRepository,
  FulfillmentPlanRepository,
  EventBus,
  FulfillmentOptimizationResult
} from './interfaces';

export class GlobalFulfillmentOptimizerService {
  constructor(
    private orderRepository: OrderRepository,
    private stockRepository: StockRepository,
    private warehouseRepository: WarehouseRepository,
    private routeRepository: RouteRepository,
    private fulfillmentPlanRepository: FulfillmentPlanRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: {
    orderId: string;
  }): Promise<FulfillmentOptimizationResult> {
    throw new Error('Not implemented');
  }
}
