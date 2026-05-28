A suíte de testes gerada deve validar:

1. Deve retornar um resultado de repasse vazio e salvá-lo quando a lista de pedidos estiver vazia
2. Deve chamar os repositórios dependentes com os ids e intervalo de datas corretos
3. Deve calcular o bruto (gross) a partir da quantidade * unitPrice
4. Deve atribuir reembolsos ao vendedor correto através do orderItemId
5. Deve somar múltiplos reembolsos para o mesmo item
6. Não deve reduzir um item para menos de zero devido a reembolsos
7. Deve dividir o frete proporcionalmente pelo valor líquido do item do vendedor dentro do mesmo pedido
8. Deve calcular a parcela do frete como zero quando todos os itens de um pedido forem totalmente reembolsados
9. Deve calcular a comissão por item após reembolsos e antes do frete
10. Deve aplicar 0% de comissão quando não houver regra de comissão
11. Deve alocar chargebacks proporcionalmente pelo valor líquido do item do vendedor após os reembolsos
12. Deve calcular a alocação de chargeback como zero quando todos os itens de um pedido forem totalmente reembolsados
13. Deve aplicar a taxa fixa de 1.50 apenas quando o valor antes da taxa fixa for positivo
14. Não deve permitir nunca que o líquido (net) seja negativo
15. Deve marcar vendedores de alto risco (HIGH) como retidos (held) mas ainda calcular seu líquido
16. Não deve reter vendedores de risco baixo (LOW) ou médio (MEDIUM)
17. Deve calcular totalGross como a soma do bruto dos vendedores
18. Deve calcular totalNet como a soma do líquido dos vendedores
19. Deve garantir que o resultado retornado e o resultado salvo sejam idênticos
20. Deve lidar com cenário misto com múltiplos pedidos, vendedores, reembolsos, chargebacks, comissões, divisão de frete e vendedor retido
21. Deve arredondar os campos monetários finais para 2 casas decimais
