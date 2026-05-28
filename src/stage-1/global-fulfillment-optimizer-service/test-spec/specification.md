A suíte de testes gerada deve validar:

1. Deve retornar NOT_FULFILLED quando o pedido não existir
2. Deve retornar NOT_FULFILLED para pedidos PENDING
3. Deve retornar NOT_FULFILLED para pedidos CANCELLED
4. Deve buscar o estoque usando todos os ids únicos de produto do pedido
5. Deve ignorar o estoque de armazéns inativos
6. Deve ignorar as posições de estoque com quantidade zero
7. Deve ignorar arestas de rota inativas
8. Deve encontrar uma rota válida com múltiplos saltos (multi-hop) do armazém até o destino
9. Deve ignorar rotas cuja maxWeightKg seja menor que o peso total do envio
10. Deve ignorar rotas cujos deliveryDays totais excedam os maxDeliveryDays do pedido
11. Deve agrupar as alocações por armazém
12. Deve calcular o totalWeightKg do envio corretamente
13. Deve calcular o custo da rota como a soma do fixedCost mais o costPerKg vezes o peso do envio para cada aresta no caminho
14. Deve minimizar o custo total globalmente
15. Não deve usar a alocação gulosa (greedy) por item quando esta produzir um custo total maior
16. Deve suportar a divisão do atendimento em múltiplos armazéns quando necessário
17. Deve preferir o atendimento total ao invés do atendimento parcial mais barato
18. Deve retornar PARTIALLY_FULFILLED quando apenas parte do pedido puder ser atendida
19. Deve retornar NOT_FULFILLED quando nenhum item puder ser atendido
20. Deve relatar os itens não atendidos com requestedQuantity e fulfilledQuantity
21. Deve usar um desempate determinístico quando dois planos tiverem a mesma quantidade atendida e o mesmo custo total
22. Deve salvar o mesmo resultado retornado pelo método execute
23. Deve publicar fulfillment.optimized quando totalmente atendido
24. Deve publicar fulfillment.partial quando parcialmente atendido
25. Não deve publicar o evento quando nada for atendido
26. Deve arredondar os campos monetários e de peso finais para 2 casas decimais