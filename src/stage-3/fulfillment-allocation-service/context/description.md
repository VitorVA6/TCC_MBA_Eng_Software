# FulfillmentAllocationService

Este serviço cria um plano de atendimento (fulfillment) para um pedido pago, decidindo quais lotes de estoque reservar, quais armazéns devem enviar os produtos e quais transportadoras utilizar.

Dependências:

- OrderRepository: recupera os dados do pedido
- InventoryRepository: recupera os lotes de estoque
- WarehouseRepository: recupera os metadados do armazém
- CarrierRepository: recupera as opções de transportadoras para a região de destino
- ReservationRepository: recupera as quantidades já reservadas e salva novas reservas
- EventBus: publica eventos de atendimento (fulfillment)

Regras de negócio:

1. Validar o status do pedido (apenas pedidos pagos podem ser atendidos)
2. Validar a disponibilidade de estoque
3. Considerar reservas existentes
4. Validar o vencimento dos lotes
5. Validar a elegibilidade do armazém
6. Validar a elegibilidade da transportadora
7. Priorizar a alocação
8. Suportar atendimento parcial (partial fulfillment)
9. Agrupar envios (shipments)
10. Calcular o custo de envio
11. Persistir as reservas para as quantidades alocadas
12. Publicar eventos de atendimento
13. Retornar um plano de atendimento indicando se o pedido foi atendido total, parcialmente ou não atendido