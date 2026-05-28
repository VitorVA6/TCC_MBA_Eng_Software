A suíte de testes gerada deve validar:

1. Deve retornar NOT_FULFILLED quando o pedido não existir
2. Deve retornar NOT_FULFILLED para pedidos PENDING
3. Deve retornar NOT_FULFILLED para pedidos CANCELLED
4. Deve buscar os lotes de estoque usando todos os ids de produto do pedido
5. Deve buscar as quantidades reservadas usando todos os ids de lote
6. Deve ignorar lotes expirados
7. Deve considerar as quantidades reservadas existentes ao calcular o estoque disponível
8. Deve ignorar armazéns inativos
9. Deve ignorar armazéns que não suportam a região de destino
10. Deve ignorar transportadoras que não suportam a região de destino
11. Deve ignorar transportadoras cuja maxWeightKg seja menor que o unitWeightKg do item
12. Deve alocar estoque a partir de lotes elegíveis
13. Deve suportar a alocação em múltiplos lotes para o mesmo produto
14. Deve suportar a alocação em múltiplos armazéns
15. Deve escolher a transportadora mais rápida antes da mais barata
16. Deve escolher a transportadora mais barata quando os deliveryDays forem iguais
17. Deve escolher o lote com vencimento mais próximo quando a prioridade da transportadora for igual
18. Deve usar a prioridade do armazém como critério de desempate
19. Deve produzir resultados determinísticos quando os ids forem usados como desempate final
20. Deve criar envios agrupados por armazém e transportadora
21. Deve calcular o totalWeightKg por envio
22. Deve calcular o shippingCost usando baseCost + costPerKg * totalWeightKg
23. Deve calcular o totalShippingCost como a soma dos custos de envio de todos os envios
24. Deve salvar as reservas para todas as quantidades alocadas
25. Deve retornar FULFILLED quando todos os itens forem totalmente alocados
26. Deve retornar PARTIALLY_FULFILLED quando pelo menos um item não for totalmente alocado
27. Deve retornar NOT_FULFILLED quando nenhum item puder ser alocado
28. Deve relatar os itens não atendidos com requestedQuantity e fulfilledQuantity
29. Deve publicar fulfillment.fulfilled quando totalmente atendido
30. Deve publicar fulfillment.partial quando parcialmente atendido
31. Não deve publicar o evento quando nada for atendido
32. Deve lidar com cenário misto com múltiplos produtos, armazéns, transportadoras, reservas, lotes expirados e estoque parcial
33. Deve arredondar valores monetários e de peso finais para 2 casas decimais