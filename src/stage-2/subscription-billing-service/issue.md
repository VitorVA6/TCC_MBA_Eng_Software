# Issue: Cobrança proporcional de upgrade permite dias restantes acima do ciclo mensal

## Contexto

A classe `SubscriptionBillingService` é responsável por calcular a cobrança de uma assinatura.

O cálculo considera o status da assinatura, o plano atual, uma possível troca de plano, cupons promocionais, desconto para usuários VIP, imposto conforme o país do usuário e a cobrança final no gateway de pagamento.

Quando a assinatura possui um `targetPlanId` e o plano alvo possui mensalidade maior que a do plano atual, o serviço trata a mudança como upgrade. A cobrança é calculada proporcionalmente com base na diferença entre o preço do plano alvo e o preço do plano atual, considerando a quantidade de dias restantes no ciclo.

## Problema

Foi identificado que o serviço utiliza diretamente o valor de `subscription.daysRemaining` no cálculo proporcional do upgrade através da fórmula `diff * (daysRemaining / 30)`.

Porém, `daysRemaining` representa a quantidade de dias restantes em um ciclo mensal e não deve ultrapassar `30`. Caso venha com um valor maior (por erro de integração ou inconsistência de dados), o serviço calcula uma cobrança proporcional maior do que a diferença mensal completa entre os planos.

## Comportamento atual

Considere um upgrade onde o plano atual custa `100` e o alvo custa `300` (diferença de `200`), com `daysRemaining` configurado como `45`.

A implementação atual calcula `200 * (45 / 30) = 300`. O usuário é cobrado em `300`, o que é indevido, pois ultrapassa a diferença mensal máxima de `200`.

## Comportamento esperado

Ao calcular uma cobrança proporcional de upgrade, o serviço deve limitar `daysRemaining` ao máximo de `30`.

Assim, qualquer valor acima de `30` deve ser tratado como `30` para fins de cálculo proporcional. Após esse cálculo base, o serviço deve continuar aplicando normalmente as demais regras existentes, como cupom, desconto VIP, imposto, arredondamento e cobrança no gateway.

## Exemplo

Considere um usuário não VIP, em país com imposto de `10%`, sem cupom. A assinatura está ativa, com plano atual em `100`, plano alvo em `300` e `daysRemaining` de `45`.

Como `daysRemaining` excede o limite mensal, ele deve ser tratado como `30`.
A diferença base é `300 - 100 = 200`.
O valor proporcional do upgrade deve ser calculado como `200 * (30 / 30) = 200`.
Aplicando o imposto de `10%`, o valor final é `220`.

O gateway de pagamento deve ser chamado com `220` e o resultado retornado deve conter `amount: 220` e `blocked: false`.