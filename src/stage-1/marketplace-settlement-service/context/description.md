# MarketplaceSettlementService

Este serviço calcula os repasses (settlements) do marketplace para os vendedores dentro de um intervalo de datas, avaliando pedidos, itens, reembolsos, chargebacks, dados de risco e regras de comissão.

Dependências:

- OrderRepository: retorna os pedidos no período solicitado
- OrderItemRepository: retorna os itens para os pedidos selecionados
- RefundRepository: retorna os reembolsos para os itens de pedido selecionados
- ChargebackRepository: retorna os chargebacks para os pedidos selecionados
- SellerRepository: retorna os metadados do vendedor
- CommissionRepository: retorna as regras de porcentagem de comissão por categoria
- SettlementRepository: persiste o resultado final do repasse

Regras de negócio:

1. Agrupar os itens do pedido por vendedor
2. Calcular as vendas brutas (gross sales)
3. Deduzir reembolsos
4. Alocar o frete proporcionalmente
5. Calcular a comissão baseada na categoria
6. Alocar chargebacks proporcionalmente
7. Avaliar o risco do vendedor
8. Aplicar a taxa fixa de repasse
9. Calcular o repasse líquido (net settlement)
10. Calcular os totais globais de repasse
11. Retornar um repasse por vendedor
12. Persistir o resultado final do repasse
