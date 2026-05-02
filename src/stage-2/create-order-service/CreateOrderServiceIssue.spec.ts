import { CreateOrderService } from '../create-order-service/correct'
import { ProductRepository, OrderRepository, EventBus, Product, Order } from '../../stage-1/create-order-service/contract/interfaces';

describe('CreateOrderService', () => {
  let productRepository: jest.Mocked<ProductRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let eventBus: jest.Mocked<EventBus>;
  let sut: CreateOrderService;

  const mockProductA: Product = { id: 'p1', name: 'Product A', price: 10, stock: 100 };
  const mockProductB: Product = { id: 'p2', name: 'Product B', price: 20, stock: 50 };

  const mockOrder: Order = {
    id: 'order-1',
    items: [
      { productId: 'p1', quantity: 2, unitPrice: 10, subtotal: 20 },
      { productId: 'p2', quantity: 3, unitPrice: 20, subtotal: 60 }
    ],
    total: 80
  };

  beforeEach(() => {
    productRepository = {
      findById: jest.fn()
    };
    orderRepository = {
      save: jest.fn()
    };
    eventBus = {
      publish: jest.fn()
    };

    sut = new CreateOrderService(productRepository, orderRepository, eventBus);
  });

  it('should successfully create an order with valid multiple items, calculating subtotals and total correctly', async () => {
    productRepository.findById.mockImplementation(async (id) => {
      if (id === 'p1') return mockProductA;
      if (id === 'p2') return mockProductB;
      return null;
    });

    orderRepository.save.mockResolvedValue(mockOrder);
    eventBus.publish.mockResolvedValue(undefined);

    const input = {
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 3 }
      ]
    };

    const result = await sut.execute(input);

    // Assertions for retrieving products
    expect(productRepository.findById).toHaveBeenCalledWith('p1');
    expect(productRepository.findById).toHaveBeenCalledWith('p2');
    expect(productRepository.findById).toHaveBeenCalledTimes(2);

    // Assertions for correctly calculating subtotals, total, and passing to repository
    expect(orderRepository.save).toHaveBeenCalledWith({
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 10, subtotal: 20 },
        { productId: 'p2', quantity: 3, unitPrice: 20, subtotal: 60 }
      ],
      total: 80
    });

    // Assertions for publishing the event and returning the saved order
    expect(eventBus.publish).toHaveBeenCalledWith('order.created', mockOrder);
    expect(result).toEqual(mockOrder);
  });

  it('should throw an error when the items list is empty', async () => {
    await expect(sut.execute({ items: [] })).rejects.toThrow();

    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should throw an error when item quantity is zero or negative', async () => {
    const inputZero = { items: [{ productId: 'p1', quantity: 0 }] };
    const inputNegative = { items: [{ productId: 'p1', quantity: -5 }] };

    await expect(sut.execute(inputZero)).rejects.toThrow();
    await expect(sut.execute(inputNegative)).rejects.toThrow();

    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('should throw an error when a product does not exist', async () => {
    productRepository.findById.mockResolvedValue(null);

    const input = { items: [{ productId: 'p1', quantity: 1 }] };

    await expect(sut.execute(input)).rejects.toThrow();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('should throw an error when requested quantity exceeds available stock', async () => {
    productRepository.findById.mockResolvedValue({ ...mockProductA, stock: 5 });

    const input = { items: [{ productId: 'p1', quantity: 10 }] };

    await expect(sut.execute(input)).rejects.toThrow();
    expect(orderRepository.save).not.toHaveBeenCalled();
  });

  it('should not publish "order.created" event if saving the order fails', async () => {
    productRepository.findById.mockResolvedValue(mockProductA);
    orderRepository.save.mockRejectedValue(new Error('Database error'));

    const input = { items: [{ productId: 'p1', quantity: 1 }] };

    await expect(sut.execute(input)).rejects.toThrow('Database error');

    // Make sure event is not published if we encounter an error in the persist step
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should throw an error when the total quantity of a duplicated product exceeds available stock', async () => {
    productRepository.findById.mockResolvedValue({ ...mockProductA, stock: 5 });

    const input = {
      items: [
        { productId: 'p1', quantity: 3 },
        { productId: 'p1', quantity: 3 }
      ]
    };

    await expect(sut.execute(input)).rejects.toThrow('Insufficient stock');
    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
