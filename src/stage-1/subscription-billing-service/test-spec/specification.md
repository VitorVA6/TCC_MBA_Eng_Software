A suíte de testes gerada deve validar:

1. Não deve cobrar usuários trial
2. Deve bloquear usuários past due (em atraso)
3. Deve cobrar normalmente o ciclo mensal ativo
4. Deve cobrar o valor proporcional (prorated) para o upgrade
5. Deve cobrar apenas o plano atual para o downgrade
6. Deve aplicar desconto de cupom ativo
7. Deve ignorar cupom inativo
8. Deve aplicar desconto extra VIP após o cupom
9. Deve aplicar impostos após os descontos
10. Nunca deve resultar em um valor negativo
11. Não deve cobrar no gateway quando o valor for zero
12. Deve chamar o gateway com o valor correto
13. Deve lidar com cenário combinado de cupom, VIP e imposto
14. Deve lidar com upgrade com cupom e imposto
15. Deve retornar a resposta de bloqueio correta
16. Deve chamar as dependências corretamente
