# SubscriptionBillingService

Este serviço calcula e cobra o ciclo de faturamento atual.

Dependências:

- UserRepository: recupera dados do usuário
- PlanRepository: recupera os planos de assinatura
- SubscriptionRepository: recupera e persiste assinaturas
- CouponRepository: recupera cupons de desconto
- TaxService: aplica impostos
- PaymentGateway: processa pagamentos

Regras de negócio:

1. Não cobrar usuários TRIAL
2. Bloquear usuários PAST_DUE e não cobrar
3. Cobrar usuários ACTIVE normalmente
4. Se targetPlanId existir e o plano de destino for mais caro que o atual, cobrar apenas a diferença proporcional usando daysRemaining / 30
5. Se targetPlanId existir e o plano de destino for mais barato, fazer o downgrade apenas no próximo ciclo e manter a cobrança atual no preço do plano atual
6. Aplicar desconto percentual de cupom ativo antes dos impostos
7. Aplicar desconto adicional de 10 por cento para usuários VIP após o cupom
8. Aplicar imposto após todos os descontos
9. Garantir que o valor final nunca seja negativo
10. Não cobrar se o valor final for zero
11. Chamar o PaymentGateway apenas quando o valor > 0 e o usuário não estiver bloqueado
12. Retornar o motivo do bloqueio quando estiver bloqueado
