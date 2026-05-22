# Issue: Cobrança proporcional de upgrade permite dias restantes acima do ciclo mensal

## Contexto

A classe `SubscriptionBillingService` é responsável por calcular a cobrança de uma assinatura.

O cálculo considera o status da assinatura, o plano atual, uma possível troca de plano, cupons promocionais, desconto para usuários VIP, imposto conforme o país do usuário e a cobrança final no gateway de pagamento.

Quando a assinatura possui um `targetPlanId` e o plano alvo possui mensalidade maior que a do plano atual, o serviço trata a mudança como upgrade.

Nesse caso, a cobrança é calculada proporcionalmente com base na diferença entre o preço do plano alvo e o preço do plano atual, considerando a quantidade de dias restantes no ciclo.

## Problema

Foi identificado que o serviço utiliza diretamente o valor de `subscription.daysRemaining` no cálculo proporcional do upgrade.

A fórmula atual considera:

`diff * (daysRemaining / 30)`

Porém, `daysRemaining` representa a quantidade de dias restantes em um ciclo mensal. Portanto, esse valor não deve ultrapassar `30`.

Caso `daysRemaining` venha com um valor maior que `30`, por inconsistência de dados ou erro de integração, o serviço calcula uma cobrança proporcional maior do que a diferença mensal completa entre os planos.

Isso pode gerar cobrança indevida no upgrade.

## Comportamento atual

Considere:

- plano atual com mensalidade de `100`;
- plano alvo com mensalidade de `300`;
- diferença entre planos: `200`;
- `daysRemaining`: `45`.

A implementação atual calcula:

`200 * (45 / 30) = 300`

Ou seja, o usuário é cobrado em `300`, mesmo que a diferença mensal completa entre os planos seja apenas `200`.

## Comportamento esperado

Ao calcular uma cobrança proporcional de upgrade, o serviço deve limitar `daysRemaining` ao máximo de `30`.

Assim, qualquer valor acima de `30` deve ser tratado como `30` para fins de cálculo proporcional.

Para o cenário descrito, o cálculo correto deve ser:

`200 * (30 / 30) = 200`

Após esse cálculo base, o serviço deve continuar aplicando normalmente as demais regras existentes, como cupom, desconto VIP, imposto, arredondamento e cobrança no gateway.

## Exemplo

Considere:

- usuário não VIP;
- país com imposto de `10%`;
- assinatura ativa;
- plano atual com mensalidade de `100`;
- plano alvo com mensalidade de `300`;
- `daysRemaining`: `45`;
- nenhum cupom informado.

A diferença entre os planos é:

`300 - 100 = 200`

Como `daysRemaining` excede o limite mensal, ele deve ser tratado como `30`.

O valor proporcional do upgrade deve ser:

`200 * (30 / 30) = 200`

Aplicando imposto de `10%`, o valor final deve ser:

`220`

O gateway de pagamento deve cobrar o usuário com o valor `220`.

O resultado retornado deve ser:

- `amount`: `220`;
- `blocked`: `false`.