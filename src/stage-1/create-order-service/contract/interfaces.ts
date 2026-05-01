export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
}

export interface OrderRepository {
  save(data: {
    items: OrderItem[];
    total: number;
  }): Promise<Order>;
}

export interface EventBus {
  publish(eventName: string, payload: unknown): Promise<void>;
}
