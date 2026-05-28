A suíte de testes gerada deve validar:

1. Deve registrar o usuário com sucesso com nome e e-mail válidos
2. Deve lançar um erro quando o nome estiver vazio
3. Deve lançar um erro quando o e-mail estiver vazio
4. Deve lançar um erro se o e-mail já existir
5. Deve salvar o usuário usando o repositório
6. Deve enviar o e-mail de boas-vindas após a criação com sucesso
7. Deve retornar o objeto do usuário criado
8. Não deve enviar e-mail se a criação falhar
9. Não deve salvar o usuário quando a validação falhar
10. Deve chamar os métodos do repositório com os argumentos corretos
