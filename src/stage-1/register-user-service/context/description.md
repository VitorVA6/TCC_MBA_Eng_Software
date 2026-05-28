# RegisterUserService

Este serviço registra novos usuários.

Dependências:

- UserRepository: persistência e busca de usuários
- EmailService: envia e-mails de boas-vindas

Regras de negócio:

1. Validar os dados de entrada
2. Verificar se o e-mail já está registrado
3. Persistir o novo usuário
4. Enviar e-mail de boas-vindas
5. Retornar o usuário criado