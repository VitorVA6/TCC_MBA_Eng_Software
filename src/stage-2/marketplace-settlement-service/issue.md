# Issue: Ajustes financeiros negativos aumentam indevidamente o repasse do seller

## Contexto

A classe `MarketplaceSettlementService` é responsável por consolidar o repasse financeiro de sellers em um marketplace.

O cálculo considera pedidos, itens dos pedidos, refunds, chargebacks, regras de comissão, frete, taxa fixa, risco do seller e totais consolidados. Refunds e chargebacks representam deduções financeiras. Portanto, eles devem reduzir ou, no limite, não alterar o valor a ser repassado ao seller.

## Problema

Foi identificado que o serviço não trata corretamente registros de refund ou chargeback com valor negativo.

Atualmente, o valor dos refunds e chargebacks é somado diretamente. Caso algum desses registros possua valor negativo, o cálculo passa a interpretar a dedução como um acréscimo financeiro, já que subtrair um número negativo equivale a uma adição. Isso aumenta indevidamente o valor líquido do seller.

## Comportamento atual

Considere um item com valor de `100` e sem comissão. Um refund negativo de `-20` é atrelado a ele. O serviço soma o refund negativo e calcula o valor líquido do item como se fosse `100 - (-20) = 120`.

O mesmo acontece para um chargeback. Um pedido com líquido de `100` e chargeback de `-30` faz com que o valor líquido final do seller aumente indevidamente para `130`.

## Comportamento esperado

Refunds e chargebacks com valor menor ou igual a zero devem ser ignorados no cálculo financeiro. Somente valores positivos devem ser considerados como deduções.

Assim, um refund ou chargeback com valor negativo não deve aumentar o repasse do seller, e os campos `refunds` e `chargebacks` do settlement não devem acumular valores negativos. O resultado salvo no `SettlementRepository` deve refletir os valores corrigidos.

## Exemplo

Dado um item de `100`, comissão de `0%`, sem frete e com um refund de `-20`, o valor líquido deve ser calculado como se o refund negativo não existisse (ou seja, `100`).

Considerando também uma taxa fixa de `1.50`, o resultado final para o seller deve ser:
- `gross`: `100`
- `refunds`: `0`
- `chargebacks`: `0`
- `net`: `98.50`