A suíte de testes gerada deve validar:

1. Deve criar o pedido com sucesso com itens válidos
2. Deve lançar um erro quando a lista de itens estiver vazia
3. Deve lançar um erro quando a quantidade for zero ou negativa
4. Deve lançar um erro quando o produto não existir
5. Deve lançar um erro quando a quantidade solicitada exceder o estoque
6. Deve calcular o subtotal de cada item corretamente
7. Deve calcular o valor total do pedido corretamente
8. Deve persistir o pedido com os dados corretos
9. Deve publicar o evento "order.created" após salvar com sucesso
10. Não deve publicar o evento se a persistência falhar
11. Deve chamar os métodos do repositório com os argumentos corretos
12. Deve suportar múltiplos itens no mesmo pedido