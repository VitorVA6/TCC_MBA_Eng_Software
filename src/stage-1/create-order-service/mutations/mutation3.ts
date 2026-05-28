import {
  ProductRepository,
  OrderRepository,
  EventBus,
  Order,
  OrderItem,
  OrderItemInput
} from '../contract/interfaces';

// evento publicado antes do save

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
    
    await this.eventBus.publish(
      'order.created',
      { 
        id: 'order-1',
        items: [
          { productId: 'p1', quantity: 2, unitPrice: 10, subtotal: 20 },
          { productId: 'p2', quantity: 3, unitPrice: 20, subtotal: 60 }
        ],
        total: 80 
      }
    );

    const order = await this.orderRepository.save({
      items,
      total
    });


    return order;
  }
}
