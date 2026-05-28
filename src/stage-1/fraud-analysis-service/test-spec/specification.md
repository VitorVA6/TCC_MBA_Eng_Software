A suíte de testes gerada deve validar:

1. Deve aprovar transações de baixo risco
2. Deve revisar transações de médio risco
3. Deve bloquear transações de alto risco
4. Deve lançar um erro quando o valor for zero ou negativo
5. Deve aumentar o escrutínio quando o risco do país for alto
6. Deve aumentar o escrutínio quando o valor for muito maior que a média histórica
7. Deve aumentar o escrutínio quando muitas transações ocorreram nas últimas 24 horas
8. Deve reduzir o impacto do risco para usuários VIP
9. Deve chamar as dependências com os argumentos corretos
10. Deve notificar o usuário quando a decisão for REVIEW
11. Deve notificar o usuário quando a decisão for BLOCKED
12. Não deve notificar em caso de APPROVED
13. Deve sempre gravar o log de auditoria com o resultado da decisão
14. Deve suportar fatores de risco combinados