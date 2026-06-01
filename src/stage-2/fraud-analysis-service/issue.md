# Issue: Transações de usuários sem média histórica são classificadas com risco excessivo

## Contexto

A classe `FraudAnalysisService` é responsável por analisar uma transação e retornar uma decisão antifraude.

A decisão é calculada com base em uma pontuação de risco formada por diferentes fatores: risco do país da transação, valor da transação em relação à média histórica do usuário, quantidade de transações realizadas nas últimas 24 horas, e status VIP do usuário.

Com base na pontuação final, a transação pode ser aprovada, enviada para revisão ou bloqueada.

## Problema

Foi identificado que usuários sem média histórica de transações estão recebendo pontuação de risco excessiva.

Atualmente, o serviço compara o valor da transação com `history.averageAmount`. Quando `history.averageAmount` é igual a `0`, qualquer valor positivo de transação será maior que `history.averageAmount * 3`, pois o resultado da multiplicação também será `0`.

Com isso, uma transação de usuário sem média histórica recebe automaticamente acréscimo de risco por valor anormal, mesmo que não exista uma média válida para comparação.

## Comportamento atual

Considere o seguinte histórico e transação:
- `averageAmount`: `0`;
- `transactionsLast24h`: `10`.
- `amount`: `100`;
- país com risco `70`;
- usuário não VIP.

A pontuação atual é calculada como:
- risco do país maior ou igual a `70`: `+3`;
- valor maior que três vezes a média histórica: `+3`;
- dez ou mais transações nas últimas 24 horas: `+2`.

Pontuação final: `8`. Com isso, a transação é bloqueada indevidamente devido ao acréscimo dos `+3` da média.

## Comportamento esperado

Quando `history.averageAmount` for igual a `0`, o serviço não deve aplicar penalidade relacionada ao valor da transação em comparação com a média histórica.

Nesse caso, o fator de valor anormal deve ser ignorado, pois não existe média histórica válida para comparação.

## Exemplo

Para o mesmo cenário descrito (histórico zerado, transação de `100`, país de risco `70`, e 10 transações prévias), a pontuação correta deve ser:

- risco do país maior ou igual a `70`: `+3`;
- valor comparado com média histórica igual a zero: `+0`;
- dez ou mais transações nas últimas 24 horas: `+2`.

Pontuação final: `5`. A decisão esperada deve ser `REVIEW`. O serviço deve chamar `notificationService.notifyReview` para o usuário analisado, sem chamar `notifyBlocked`. O log de auditoria deve registrar a pontuação final correta e a decisão `REVIEW`.