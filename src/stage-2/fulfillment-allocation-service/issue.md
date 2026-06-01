# Issue: Shipment pode ultrapassar o peso máximo permitido pela transportadora

## Contexto

A classe `FulfillmentAllocationService` é responsável por gerar um plano de fulfillment para pedidos pagos.

Durante a alocação, o serviço busca estoques disponíveis, considera reservas já existentes, filtra armazéns elegíveis, escolhe transportadoras disponíveis para a região de destino e cria shipments agrupados por armazém e transportadora.

Cada transportadora possui um limite máximo de peso representado pelo campo `maxWeightKg`. Esse limite deve representar o peso máximo que a transportadora consegue transportar em um shipment.

## Problema

Foi identificado que o serviço valida apenas se a transportadora suporta o peso unitário de um item.

Atualmente, uma transportadora é considerada elegível quando atende a região de destino e possui `maxWeightKg` maior ou igual ao `unitWeightKg` do item. No entanto, o serviço não verifica se o peso total acumulado no shipment ultrapassa o `maxWeightKg` da transportadora.

Com isso, um pedido com várias unidades de um mesmo item pode gerar um shipment cujo peso total excede o limite suportado.

## Comportamento atual

Considere um pedido pago com um item: produto `PROD-1`, quantidade `4` e peso unitário `2kg`. Considere também uma transportadora com `maxWeightKg` igual a `5`.

A transportadora consegue carregar uma unidade individual do item, pois `2kg <= 5kg`. Porém, as 4 unidades são alocadas no mesmo shipment, e o peso total do shipment fica em `8kg`. Esse shipment ultrapassa o limite máximo de `5kg` da transportadora, resultando em um pacote inválido.

## Comportamento esperado

O serviço deve garantir que o peso total de cada shipment não ultrapasse o `maxWeightKg` da transportadora utilizada.

Durante a alocação, a quantidade reservada para um shipment deve ser limitada pelo peso restante suportado pela transportadora. Se não for possível alocar toda a quantidade solicitada sem exceder o limite de peso, o pedido deve ser retornado como parcialmente atendido. As unidades não alocadas devem aparecer em `unfulfilledItems`.

## Exemplo

Considere um pedido pago com o produto `PROD-1`, solicitando a quantidade `4` com peso unitário de `2kg`. O estoque e armazéns são válidos, e a transportadora tem `maxWeightKg` igual a `5`.

O serviço deve alocar apenas `2` unidades no shipment, totalizando `4kg`. A terceira unidade faria o shipment chegar a `6kg`, ultrapassando o limite.

Portanto, o resultado esperado deve ser:
- status: `PARTIALLY_FULFILLED`;
- shipment com `2` unidades e `totalWeightKg` de `4`;
- item não atendido com `requestedQuantity`: `4` e `fulfilledQuantity`: `2`;
- nenhuma reserva deve exceder o limite de peso do shipment;
- evento `fulfillment.partial` deve ser publicado.