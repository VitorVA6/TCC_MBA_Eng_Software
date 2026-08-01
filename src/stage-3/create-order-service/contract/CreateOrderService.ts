import {
  ProductRepository,
  OrderRepository,
  EventBus,
  Order,
  OrderItemInput,
  OrderItem
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
    if (!input.items || input.items.length === 0) {
      throw new Error('Items list cannot be empty');
    }

    const orderItems: OrderItem[] = [];
    let total = 0;

    for (const itemInput of input.items) {
      if (itemInput.quantity <= 0) {
        throw new Error('Quantity must be greater than zero');
      }

      const product = await this.productRepository.findById(itemInput.productId);
      if (!product) {
        throw new Error('Product not found');
      }

      if (itemInput.quantity > product.stock) {
        throw new Error('Insufficient stock');
      }

      const subtotal = itemInput.quantity * product.price;
      orderItems.push({
        productId: product.id,
        quantity: itemInput.quantity,
        unitPrice: product.price,
        subtotal
      });

      total += subtotal;
    }

    const savedOrder = await this.orderRepository.save({
      items: orderItems,
      total
    });

    await this.eventBus.publish('order.created', savedOrder);

    return savedOrder;
  }
}
