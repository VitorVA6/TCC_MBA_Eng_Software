import { CreateOrderService } from './CreateOrderService';
import { ProductRepository, OrderRepository, EventBus, Product, Order } from './interfaces';

describe('CreateOrderService', () => {
  let productRepository: jest.Mocked<ProductRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;
  let eventBus: jest.Mocked<EventBus>;
  let createOrderService: CreateOrderService;

  beforeEach(() => {
    productRepository = {
      findById: jest.fn(),
    };
    orderRepository = {
      save: jest.fn(),
    };
    eventBus = {
      publish: jest.fn(),
    };

    createOrderService = new CreateOrderService(
      productRepository,
      orderRepository,
      eventBus
    );
  });

  it('deve criar o pedido com sucesso com itens válidos', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 10 };
    const savedOrder: Order = { id: 'o1', items: [{ productId: 'p1', quantity: 2, unitPrice: 100, subtotal: 200 }], total: 200 };
    
    productRepository.findById.mockResolvedValue(product);
    orderRepository.save.mockResolvedValue(savedOrder);
    
    const result = await createOrderService.execute({ items: [{ productId: 'p1', quantity: 2 }] });
    
    expect(result).toEqual(savedOrder);
    expect(orderRepository.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith('order.created', savedOrder);
  });

  it('deve lançar um erro quando a lista de itens estiver vazia', async () => {
    await expect(createOrderService.execute({ items: [] })).rejects.toThrow();
  });

  it('deve lançar um erro quando a quantidade for zero ou negativa', async () => {
    await expect(createOrderService.execute({ items: [{ productId: 'p1', quantity: 0 }] })).rejects.toThrow();
    await expect(createOrderService.execute({ items: [{ productId: 'p1', quantity: -1 }] })).rejects.toThrow();
  });

  it('deve lançar um erro quando o produto não existir', async () => {
    productRepository.findById.mockResolvedValue(null);
    await expect(createOrderService.execute({ items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow();
  });

  it('deve lançar um erro quando a quantidade solicitada exceder o estoque', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 5 };
    productRepository.findById.mockResolvedValue(product);
    await expect(createOrderService.execute({ items: [{ productId: 'p1', quantity: 6 }] })).rejects.toThrow();
  });

  it('deve calcular o subtotal de cada item corretamente', async () => {
    const product1: Product = { id: 'p1', name: 'Product 1', price: 10, stock: 10 };
    const product2: Product = { id: 'p2', name: 'Product 2', price: 20, stock: 10 };
    
    productRepository.findById.mockImplementation(async (id) => {
      if (id === 'p1') return product1;
      if (id === 'p2') return product2;
      return null;
    });

    const savedOrder: Order = { 
      id: 'o1', 
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 10, subtotal: 20 },
        { productId: 'p2', quantity: 3, unitPrice: 20, subtotal: 60 }
      ], 
      total: 80 
    };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    await createOrderService.execute({ items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3 }] });
    
    expect(orderRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: 'p1', subtotal: 20 }),
        expect.objectContaining({ productId: 'p2', subtotal: 60 }),
      ])
    }));
  });

  it('deve calcular o valor total do pedido corretamente', async () => {
    const product1: Product = { id: 'p1', name: 'Product 1', price: 10, stock: 10 };
    const product2: Product = { id: 'p2', name: 'Product 2', price: 20, stock: 10 };
    
    productRepository.findById.mockImplementation(async (id) => {
      if (id === 'p1') return product1;
      if (id === 'p2') return product2;
      return null;
    });

    const savedOrder: Order = { id: 'o1', items: [], total: 80 };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    await createOrderService.execute({ items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3 }] });
    
    expect(orderRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      total: 80
    }));
  });

  it('deve persistir o pedido com os dados corretos', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 10 };
    productRepository.findById.mockResolvedValue(product);
    
    const savedOrder: Order = { id: 'o1', items: [{ productId: 'p1', quantity: 1, unitPrice: 100, subtotal: 100 }], total: 100 };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    await createOrderService.execute({ items: [{ productId: 'p1', quantity: 1 }] });
    
    expect(orderRepository.save).toHaveBeenCalledWith({
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, subtotal: 100 }],
      total: 100
    });
  });

  it('deve publicar o evento "order.created" após salvar com sucesso', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 10 };
    productRepository.findById.mockResolvedValue(product);
    
    const savedOrder: Order = { id: 'o1', items: [{ productId: 'p1', quantity: 1, unitPrice: 100, subtotal: 100 }], total: 100 };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    await createOrderService.execute({ items: [{ productId: 'p1', quantity: 1 }] });
    
    expect(eventBus.publish).toHaveBeenCalledWith('order.created', savedOrder);
  });

  it('não deve publicar o evento se a persistência falhar', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 10 };
    productRepository.findById.mockResolvedValue(product);
    
    orderRepository.save.mockRejectedValue(new Error('DB Error'));
    
    await expect(createOrderService.execute({ items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow('DB Error');
    
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('deve chamar os métodos do repositório com os argumentos corretos', async () => {
    const product: Product = { id: 'p1', name: 'Product 1', price: 100, stock: 10 };
    productRepository.findById.mockResolvedValue(product);
    
    const savedOrder: Order = { id: 'o1', items: [{ productId: 'p1', quantity: 2, unitPrice: 100, subtotal: 200 }], total: 200 };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    await createOrderService.execute({ items: [{ productId: 'p1', quantity: 2 }] });
    
    expect(productRepository.findById).toHaveBeenCalledWith('p1');
    expect(productRepository.findById).toHaveBeenCalledTimes(1);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deve suportar múltiplos itens no mesmo pedido', async () => {
    const product1: Product = { id: 'p1', name: 'Product 1', price: 50, stock: 10 };
    const product2: Product = { id: 'p2', name: 'Product 2', price: 100, stock: 10 };
    
    productRepository.findById.mockImplementation(async (id) => {
      if (id === 'p1') return product1;
      if (id === 'p2') return product2;
      return null;
    });

    const savedOrder: Order = { 
      id: 'o1', 
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 50, subtotal: 100 },
        { productId: 'p2', quantity: 1, unitPrice: 100, subtotal: 100 }
      ], 
      total: 200 
    };
    orderRepository.save.mockResolvedValue(savedOrder);
    
    const result = await createOrderService.execute({ 
      items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 }
      ] 
    });
    
    expect(result).toEqual(savedOrder);
    expect(productRepository.findById).toHaveBeenCalledTimes(2);
    expect(orderRepository.save).toHaveBeenCalledWith({
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 50, subtotal: 100 },
        { productId: 'p2', quantity: 1, unitPrice: 100, subtotal: 100 }
      ],
      total: 200
    });
  });
});
