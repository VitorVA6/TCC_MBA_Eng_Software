# Issue: Ajustes financeiros negativos aumentam indevidamente o repasse do seller

## Contexto

A classe `MarketplaceSettlementService` é responsável por consolidar o repasse financeiro de sellers em um marketplace.

O cálculo considera pedidos, itens dos pedidos, refunds, chargebacks, regras de comissão, frete, taxa fixa, risco do seller e totais consolidados.

Refunds e chargebacks representam deduções financeiras. Portanto, eles devem reduzir ou, no limite, não alterar o valor a ser repassado ao seller.

## Problema

Foi identificado que o serviço não trata corretamente registros de refund ou chargeback com valor negativo.

Atualmente, o valor dos refunds é somado diretamente a partir de `refund.amount`.

Da mesma forma, o valor dos chargebacks também é somado diretamente a partir de `chargeback.amount`.

Caso algum desses registros possua valor negativo, o cálculo passa a interpretar a dedução como um acréscimo financeiro.

Isso pode aumentar indevidamente o valor líquido do seller.

## Exemplo do problema com refund negativo

Considere um item com:

- seller: `SELLER-1`;
- quantidade: `1`;
- preço unitário: `100`;
- categoria com comissão de `0%`.

E um refund associado ao item com:

- valor: `-20`.

Como refund é uma dedução, esse valor negativo não deve aumentar o valor líquido do seller.

No entanto, a implementação atual soma o refund negativo e calcula o valor líquido do item como se fosse:

`100 - (-20) = 120`

Isso aumenta indevidamente o repasse.

## Exemplo do problema com chargeback negativo

Considere um pedido com valor líquido de `100`.

E um chargeback associado ao pedido com:

- valor: `-30`.

Como chargeback também é uma dedução, esse valor negativo não deve aumentar o repasse do seller.

A implementação atual soma o chargeback negativo e, ao subtrair esse valor no cálculo final, acaba aumentando o líquido do seller.

## Comportamento esperado

Refunds e chargebacks com valor menor ou igual a zero devem ser ignorados no cálculo financeiro.

Somente valores positivos devem ser considerados como deduções.

Assim:

- refund com valor negativo não deve aumentar o valor líquido do item;
- chargeback com valor negativo não deve aumentar o valor líquido do seller;
- os campos `refunds` e `chargebacks` do settlement não devem acumular valores negativos;
- o resultado salvo no `SettlementRepository` deve refletir os valores corrigidos.

## Critério esperado

Dado um item de `100`, comissão de `0%`, sem frete e com um refund negativo de `-20`, o seller não deve receber `120`.

O valor líquido deve ser calculado como se o refund negativo não existisse.

Considerando a taxa fixa de `1.50`, o resultado esperado para o seller deve ser:

- `gross`: `100`;
- `refunds`: `0`;
- `chargebacks`: `0`;
- `net`: `98.50`.