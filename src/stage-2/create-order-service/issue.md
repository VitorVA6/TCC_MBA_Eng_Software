# Issue: Pedido permite itens duplicados do mesmo produto sem validar o estoque total

## Contexto

A classe `CreateOrderService` é responsável por criar pedidos a partir de uma lista de itens informados pelo cliente.

Atualmente, o serviço valida se o pedido possui itens, verifica se cada item possui quantidade válida, busca cada produto no repositório, valida se há estoque suficiente para aquele item individualmente, calcula o subtotal de cada item, calcula o total do pedido, salva o pedido e publica o evento `order.created`.

## Problema

Foi identificado que o serviço permite que o mesmo produto seja informado mais de uma vez na lista de itens do pedido.

Quando isso acontece, a validação de estoque é feita separadamente para cada ocorrência do produto, sem considerar a quantidade total solicitada.

Por exemplo, considere um produto com estoque igual a `5`.

Caso o pedido seja criado com os seguintes itens:

- produto `PROD-1`, quantidade `3`;
- produto `PROD-1`, quantidade `3`.

Cada item individualmente possui quantidade menor ou igual ao estoque disponível. Porém, a quantidade total solicitada para o produto é `6`, ultrapassando o estoque real de `5`.

Na implementação atual, esse pedido pode ser aceito indevidamente.

## Comportamento esperado

O serviço deve considerar a quantidade total solicitada por produto antes de validar o estoque.

Se o mesmo produto aparecer mais de uma vez no pedido, suas quantidades devem ser somadas para fins de validação.

Quando a quantidade total solicitada de um produto for maior que seu estoque disponível, o serviço deve lançar o erro:

`Insufficient stock`

Nesses casos, o pedido não deve ser salvo e o evento `order.created` não deve ser publicado.

## Exemplo

Dado um produto com:

- id: `PROD-1`;
- preço: `10`;
- estoque: `5`.

E uma entrada com:

- item 1: produto `PROD-1`, quantidade `3`;
- item 2: produto `PROD-1`, quantidade `3`.

O serviço deve rejeitar o pedido com o erro:

`Insufficient stock`

Pois a quantidade total solicitada para `PROD-1` é `6`, excedendo o estoque disponível de `5`.