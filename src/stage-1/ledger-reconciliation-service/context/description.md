# LedgerReconciliationService

Este serviço reconcilia os registros financeiros internos com os lançamentos do extrato bancário.

Dependências:

- InternalLedgerRepository: retorna os lançamentos internos
- BankStatementProvider: retorna os lançamentos do extrato bancário
- AuditLogger: armazena os logs de execução da reconciliação

Regras de negócio:

1. Corresponder os lançamentos por referência
2. Classificar múltiplos lançamentos bancários que compartilham a mesma referência como duplicados
3. Classificar referências correspondentes com valores diferentes como divergência de valor (amountMismatch)
4. Classificar lançamentos internos sem correspondência bancária como interno ausente (missingInternal)
5. Classificar lançamentos bancários sem correspondência interna como banco inesperado (unexpectedBank)
6. Classificar correspondências corretas como correspondidas (matched)
7. Gerar como saída listas de referências
8. Sempre gravar log de auditoria
