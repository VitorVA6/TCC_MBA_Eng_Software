# Issue: Cadastro permite e-mails com formato inválido

## Contexto

A classe `RegisterUserService` é responsável por registrar novos usuários no sistema.

Atualmente, o serviço normaliza o nome e o e-mail recebidos, valida se ambos foram informados, verifica se o e-mail já está cadastrado, salva o usuário e envia um e-mail de boas-vindas.

## Problema

Foi identificado que o serviço permite o cadastro de usuários com e-mails em formato inválido.

Entradas como `johnexample.com`, `john@`, `john@example` ou `john @example.com` podem passar pela validação atual, desde que o campo não esteja vazio.

Esse comportamento permite que usuários sejam cadastrados com dados inconsistentes.

## Comportamento esperado

O serviço deve rejeitar e-mails com formato inválido antes de consultar o repositório de usuários.

Um e-mail válido deve conter:

- texto antes do caractere `@`;
- o caractere `@`;
- domínio após o `@`;
- ao menos um ponto no domínio;
- ausência de espaços internos.

Quando o e-mail for inválido, o serviço deve lançar o erro:

`Invalid email`

Nesses casos, o serviço não deve consultar o repositório, não deve salvar o usuário e não deve enviar o e-mail de boas-vindas.
