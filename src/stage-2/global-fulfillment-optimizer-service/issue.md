# Issue: Rotas de entrega podem atravessar warehouses inativos

## Contexto

A classe `GlobalFulfillmentOptimizerService` é responsável por encontrar o melhor plano global de fulfillment para um pedido pago.

O serviço considera estoque disponível, warehouses ativos, rotas ativas, peso total dos shipments, prazo máximo de entrega e custo total para decidir a melhor combinação de alocações e rotas.

Atualmente, o serviço ignora posições de estoque localizadas em warehouses inativos. Isso impede que um warehouse inativo seja usado como origem de uma alocação.

## Problema

Foi identificado que, embora o serviço ignore estoque originado de warehouses inativos, ele ainda pode usar um warehouse inativo como nó intermediário em uma rota de entrega.

Isso acontece porque a validação de warehouses ativos é aplicada apenas ao estoque inicial. Durante a busca de rotas, o serviço considera apenas se as arestas da rota estão ativas, se suportam o peso e se respeitam o prazo máximo de entrega.

Como consequência, uma rota multi-hop pode atravessar um warehouse desativado, desde que as arestas estejam ativas.

## Exemplo do problema

Considere os warehouses:

- `W1`: ativo;
- `W2`: inativo.

Considere um pedido cujo destino é `DEST`.

Considere também as seguintes rotas ativas:

- `W1 -> W2`;
- `W2 -> DEST`.

Mesmo com `W2` inativo, a implementação atual pode considerar a rota:

`W1 -> W2 -> DEST`

como válida.

Esse comportamento está incorreto, pois warehouses inativos não devem participar do plano de fulfillment, nem como origem de estoque nem como ponto intermediário de transporte.

## Comportamento esperado

O serviço não deve usar warehouses inativos em nenhuma etapa do plano de fulfillment.

Um warehouse inativo não deve ser usado como:

- origem de estoque;
- nó intermediário de uma rota;
- ponto de passagem em um shipment.

Rotas que dependam de warehouses inativos devem ser desconsideradas.

Nós que não representam warehouses cadastrados, como destinos finais ou hubs externos, podem continuar sendo usados normalmente, desde que as rotas estejam ativas e respeitem as demais restrições.

## Exemplo esperado

Considere:

- pedido pago;
- produto disponível em `W1`;
- `W1` ativo;
- `W2` inativo;
- destino `DEST`;
- rota ativa `W1 -> W2`;
- rota ativa `W2 -> DEST`;
- nenhuma outra rota válida até o destino.

Nesse cenário, o serviço não deve considerar `W1 -> W2 -> DEST` como rota válida.

Como não existe rota válida sem atravessar o warehouse inativo, o pedido deve retornar:

- status: `NOT_FULFILLED`;
- sem alocações;
- sem shipments;
- com o item em `unfulfilledItems`;
- sem publicação de evento de fulfillment.