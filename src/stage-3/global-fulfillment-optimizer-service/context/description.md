# GlobalFulfillmentOptimizerService

Este serviço cria um plano de atendimento (fulfillment) otimizado para um pedido pago, decidindo quais armazéns devem atender cada produto e qual rota de entrega deve ser utilizada.

Dependências:

- OrderRepository: recupera o pedido
- StockRepository: recupera as posições de estoque para os produtos solicitados
- WarehouseRepository: recupera os metadados do armazém
- RouteRepository: recupera o grafo de rotas de entrega
- FulfillmentPlanRepository: persiste o plano gerado
- EventBus: publica eventos de atendimento

Regras de negócio:

1. Validar o status do pedido (apenas pedidos PAID podem ser atendidos)
2. Validar a disponibilidade de estoque
3. Filtrar armazéns ativos
4. Percorrer o grafo de rotas
5. Validar a viabilidade da rota por peso e tempo de entrega
6. Minimizar o custo global em vez de escolher apenas a opção mais barata para cada item independentemente
7. Suportar atendimento parcial
8. Agrupar envios por armazém
9. Desempatar de forma determinística
10. Persistir o plano e publicar eventos
11. Retornar se o pedido foi atendido totalmente, parcialmente ou não atendido