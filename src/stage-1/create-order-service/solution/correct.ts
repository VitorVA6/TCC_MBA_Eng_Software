import {
  ProductRepository,
  OrderRepository,
  EventBus,
  Order,
  OrderItem,
  OrderItemInput
} from '../contract/interfaces';

// nível fácil

export class CreateOrderService {
  constructor(
    private productRepository: ProductRepository,
    private orderRepository: OrderRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: {
    items: OrderItemInput[];
  }): Promise<Order> {
    if (!input.items.length) {
      throw new Error('Empty order');
    }

    const items: OrderItem[] = [];

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error('Invalid quantity');
      }

      const product = await this.productRepository.findById(
        item.productId
      );

      if (!product) {
        throw new Error('Product not found');
      }

      if (item.quantity > product.stock) {
        throw new Error('Insufficient stock');
      }

      const subtotal = product.price * item.quantity;

      items.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal
      });
    }

    const total = items.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    const order = await this.orderRepository.save({
      items,
      total
    });

    await this.eventBus.publish(
      'order.created',
      order
    );

    return order;
  }
}
