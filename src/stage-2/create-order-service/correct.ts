import {
  ProductRepository,
  OrderRepository,
  EventBus,
  Product,
  OrderItemInput,
  Order,
  OrderItem
} from "../../stage-1/create-order-service/contract/interfaces";

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

    const requestedQuantityByProduct = new Map<string, number>();

    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error('Invalid quantity');
      }

      const currentQuantity =
        requestedQuantityByProduct.get(item.productId) ?? 0;

      requestedQuantityByProduct.set(
        item.productId,
        currentQuantity + item.quantity
      );
    }

    const productsById = new Map<string, Product>();

    for (const [productId, requestedQuantity] of requestedQuantityByProduct) {
      const product = await this.productRepository.findById(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      if (requestedQuantity > product.stock) {
        throw new Error('Insufficient stock');
      }

      productsById.set(productId, product);
    }

    const items: OrderItem[] = input.items.map((item) => {
      const product = productsById.get(item.productId);

      if (!product) {
        throw new Error('Product not found');
      }

      const subtotal = product.price * item.quantity;

      return {
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal
      };
    });

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
