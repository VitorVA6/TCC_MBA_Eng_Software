# Issue: Conciliação não identifica divergência de valor quando há lançamentos bancários duplicados

## Contexto

A classe `LedgerReconciliationService` é responsável por comparar lançamentos internos com lançamentos obtidos do extrato bancário em um determinado período.

O resultado da conciliação separa as referências em cinco categorias:
- `matched`: lançamentos encontrados no sistema interno e no banco com o mesmo valor;
- `missingInternal`: lançamentos existentes no sistema interno, mas ausentes no extrato bancário;
- `unexpectedBank`: lançamentos existentes no extrato bancário, mas ausentes no sistema interno;
- `duplicatedBank`: referências que aparecem mais de uma vez no extrato bancário;
- `amountMismatch`: referências encontradas no sistema interno e no banco, mas com valores divergentes.

## Problema

Foi identificado que, quando uma referência aparece mais de uma vez no extrato bancário, o serviço registra essa referência apenas em `duplicatedBank`.

Nessa situação, o serviço interrompe a análise daquele item interno e não verifica se os lançamentos bancários duplicados também possuem divergência de valor em relação ao lançamento interno. Isso faz com que uma inconsistência relevante seja omitida do resultado da conciliação.

## Comportamento atual

Considere um lançamento interno com a referência `PAY-001` e valor `100`. Existem dois lançamentos bancários com a mesma referência `PAY-001` e valor `90`.

Atualmente, o serviço classifica `PAY-001` apenas como `duplicatedBank`. A referência não é incluída em `amountMismatch`, omitindo a real divergência financeira.

## Comportamento esperado

Quando uma referência interna possuir mais de um lançamento correspondente no extrato bancário, o serviço deve continuar registrando essa referência em `duplicatedBank`.

Além disso, caso nenhum dos lançamentos bancários duplicados tenha o mesmo valor do lançamento interno, a referência também deve ser registrada em `amountMismatch`.

## Exemplo

Para o cenário descrito (referência `PAY-001` interna no valor de `100` e duas bancárias no valor de `90`), o resultado esperado deve conter a referência listada em duas categorias:
- `duplicatedBank`: `["PAY-001"]`
- `amountMismatch`: `["PAY-001"]`

A referência não deve ser considerada como `matched`. O resultado final da conciliação deve ser registrado no `auditLogger`.