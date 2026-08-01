# FraudAnalysisService

Este serviço avalia transações financeiras em relação ao risco de fraude.

Dependências:

- UserRepository: determina usuários VIP
- TransactionRepository: fornece o histórico de transações do usuário
- RiskEngine: retorna a pontuação de risco do país (0 a 100)
- NotificationService: envia alertas
- AuditLogger: armazena logs de auditoria

Regras de negócio:

1. Decidir entre os resultados APPROVED, REVIEW e BLOCKED
2. Calcular a pontuação de fraude baseada no risco do país: +3 pontos para 70 ou superior, +1 ponto para 40 a 69
3. Calcular a pontuação de fraude baseada no valor da transação: +3 pontos se maior que 3x a média histórica, +1 ponto se maior que 1,5x a média
4. Calcular a pontuação de fraude baseada em transações recentes (últimas 24 horas): +2 pontos para 10 ou mais, +1 ponto para 5 a 9
5. Reduzir a pontuação final de fraude em 1 ponto para usuários VIP
6. Aprovar transação se a pontuação final for de 0 a 2
7. Revisar transação se a pontuação final for de 3 a 5
8. Bloquear transação se a pontuação final for de 6 ou mais
9. Notificar o usuário sobre decisões de REVIEW
10. Notificar o usuário sobre decisões de BLOCKED
11. Não notificar o usuário sobre decisões APPROVED
12. Sempre registrar log de auditoria