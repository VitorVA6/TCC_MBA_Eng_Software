import {
  ProductRepository,
  OrderRepository,
  EventBus,
  Order,
  OrderItemInput
} from './interfaces';

export class CreateOrderService {
  constructor(
    private productRepository: ProductRepository,
    private orderRepository: OrderRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: {
    items: OrderItemInput[];
  }): Promise<Order> {
    throw new Error('Not implemented');
  }
}
