# CreateOrderService

Este serviço cria pedidos de clientes.

Dependências:

- ProductRepository: recupera dados do produto
- OrderRepository: persiste os pedidos
- EventBus: publica eventos de integração

Regras de negócio:

1. Validar os itens recebidos
2. Recuperar produtos por id
3. Validar a disponibilidade de estoque
4. Calcular o subtotal do pedido por item
5. Calcular o valor total do pedido
6. Persistir o pedido
7. Publicar o evento "order.created"
8. Retornar o pedido criado