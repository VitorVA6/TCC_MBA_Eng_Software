# TCC MBA Engenharia de Software — TDD e Large Language Models

Este repositório contém os artefatos experimentais utilizados no trabalho **“Aplicação de Test Driven Development e Large Language Models no desenvolvimento de software”**.

O estudo investiga o uso de agentes baseados em **Large Language Models (LLMs)** em diferentes etapas de um fluxo de desenvolvimento orientado por testes (**Test-Driven Development — TDD**), abrangendo:

1. geração inicial de testes automatizados;
2. geração incremental de testes em cenários de manutenção evolutiva;
3. implementação de código de produção orientada por suítes de testes previamente validadas.

O objetivo deste repositório é favorecer a **transparência, rastreabilidade e reprodutibilidade do experimento**, disponibilizando os prompts, contratos, especificações, implementações de referência, mutantes, suítes de testes e demais artefatos utilizados durante a pesquisa.

---

## 1. Ambiente experimental

O experimento foi realizado utilizando:

* **Node.js**
* **TypeScript**
* **Jest**
* **Antigravity IDE**
* **Modelo experimental:** Gemini 3.1 Pro
* **Modo de raciocínio:** High
* **Período das execuções:** 28 de maio a 1 de agosto de 2026

Cada cenário experimental foi iniciado em uma **sessão independente**, sem reutilização do histórico de conversação dos demais serviços.

Os demais parâmetros de geração não foram modificados pelo pesquisador e permaneceram nas configurações disponibilizadas pelo ambiente utilizado.

### Modelo auxiliar

O **GPT-5.5**, no modo *thinking*, foi utilizado exclusivamente como ferramenta auxiliar na preparação inicial das implementações de referência da Fase 1.

Essas implementações foram posteriormente auditadas manualmente pelo pesquisador com base nas regras de negócio especificadas nos artefatos experimentais.

O GPT-5.5 **não constitui objeto de avaliação do experimento**.

Todos os resultados apresentados no estudo referentes ao desempenho de LLM correspondem ao **Gemini 3.1 Pro**.

---

## 2. Serviços avaliados

O conjunto experimental é composto por oito serviços de domínio distribuídos em três níveis de complexidade.

| Serviço                           | Regras de negócio | Dependências externas | Característica predominante                       | Complexidade |
| --------------------------------- | ----------------: | --------------------: | ------------------------------------------------- | ------------ |
| RegisterUserService               |                 5 |                     2 | Fluxo linear, validações e persistência simples   | Fácil        |
| CreateOrderService                |                 8 |                     3 | Fluxo linear, validações e criação de entidade    | Fácil        |
| FraudAnalysisService              |                12 |                     5 | Lógica condicional composta e múltiplos critérios | Médio        |
| SubscriptionBillingService        |                12 |                     6 | Cálculos financeiros e composição de regras       | Médio        |
| MarketplaceSettlementService      |                12 |                     7 | Consolidação e distribuição de valores            | Médio        |
| LedgerReconciliationService       |                 8 |                     3 | Cruzamento e reconciliação de estados             | Médio        |
| FulfillmentAllocationService      |                13 |                     6 | Alocação de recursos sob múltiplas restrições     | Difícil      |
| GlobalFulfillmentOptimizerService |                11 |                     6 | Otimização combinatória e travessia de grafos     | Difícil      |

A classificação considerou conjuntamente:

* quantidade de regras de negócio;
* quantidade de dependências externas;
* natureza e complexidade algorítmica.

A **natureza e a complexidade algorítmica** constituíram o critério de maior peso na classificação.

---

# 3. Desenho experimental

O experimento foi dividido em três fases.

---

## Fase 1 — Geração de testes automatizados

Nesta etapa, o Gemini 3.1 Pro recebeu os artefatos de especificação do serviço sem acesso à implementação real da classe.

Os principais artefatos fornecidos ao agente foram:

* `description.md`
* `specification.md`
* `interfaces.ts`
* `contract.ts`

A tarefa do agente consistiu em produzir uma suíte de testes unitários em Jest capaz de representar as regras e comportamentos descritos nesses artefatos.

Posteriormente, a suíte foi executada contra:

1. uma implementação de referência previamente validada;
2. implementações mutantes contendo defeitos intencionalmente inseridos.

Foram utilizados **47 mutantes**, cada um contendo uma única anomalia.

O objetivo foi avaliar simultaneamente:

* compatibilidade da suíte com uma implementação considerada correta;
* capacidade de detectar defeitos relacionados às regras de negócio e aos efeitos colaterais especificados.

### Prompt utilizado na Fase 1

```text
Gere um arquivo de teste unitário Jest para <service_name>.

Você receberá:
1. Uma assinatura de classe typescript <contract.ts>
2. Interfaces de dependência <interfaces.ts>
3. Contexto do negócio <description.md>
4. Especificação do teste <specification.md>

Regras:
- Use mocks para as dependências
- Cubra todos os comportamentos exigidos
- Use nomes de teste descritivos
- Valide cenários positivos e negativos

Gere apenas o arquivo de teste.
```

---

## Fase 2 — Manutenção evolutiva e resolução de incidentes

A segunda fase simulou cenários de manutenção de software.

Para cada serviço foi elaborado um arquivo:

`issue.md`

O documento descrevia um novo requisito ou defeito contendo:

* título;
* contexto;
* problema;
* comportamento atual;
* comportamento esperado;
* exemplo de entrada e saída.

O Gemini 3.1 Pro recebeu como contexto:

* código original do serviço;
* suíte de testes preexistente;
* `issue.md`.

Sua tarefa consistiu em gerar **um novo caso de teste** direcionado ao incidente apresentado.

O novo teste deveria:

* **falhar na versão original**, representando o estado Red;
* **passar na versão corrigida**, representando o estado Green.

Embora o arquivo completo de testes tenha sido executado, a métrica dessa fase considerou exclusivamente o comportamento do **novo caso de teste gerado**.

### Prompt utilizado na Fase 2

```text
Você está atuando na etapa de manutenção evolutiva e resolução de incidentes de uma
classe de serviço já existente.

Você receberá:

- o código-fonte atual da classe, ainda sem a correção <correct.ts>;

- a suíte de testes original <service.spec.ts>;

- o arquivo `issue.md`, contendo a descrição da issue ou nova feature a ser
coberta <issue.md>.

Sua tarefa é criar apenas um novo caso de teste automatizado que cubra o comportamento
descrito.

O teste gerado deve falhar contra a versão original da classe e passar contra a
versão corrigida usada como gabarito.

Não altere o código de produção.

```

---

## Fase 3 — Implementação de código orientada por testes

Na terceira fase, o fluxo experimental foi invertido.

O agente recebeu:

* contexto funcional;
* contratos;
* interfaces;
* assinatura da classe;
* suíte de testes refinada e previamente validada.

A implementação de referência utilizada nas etapas anteriores **não foi fornecida ao agente**.

A tarefa do Gemini 3.1 Pro consistiu em implementar autonomamente o código de produção necessário para satisfazer a suíte.

Durante a execução, o agente pôde:

1. escrever o código de produção;
2. executar a suíte;
3. analisar os logs;
4. modificar exclusivamente o código de produção;
5. executar novamente os testes.

Cada execução da suíte foi contabilizada como **um ciclo**, incluindo a primeira execução.

O limite previamente estabelecido foi de **dez ciclos por serviço**.

O processo deveria ser encerrado quando:

* 100% da suíte fosse aprovada; ou
* o décimo ciclo fosse concluído.

Nenhuma alteração na suíte de testes ou intervenção humana foi permitida após o envio do prompt inicial.

### Prompt utilizado na Fase 3

```text
Você está atuando na etapa de implementação de uma nova classe de serviço.

Você receberá:

1. A assinatura da classe typescript a ser implementada <contract.ts>;

2. Interfaces de dependência <interfaces.ts>;

3. Contexto do negócio <description.md>;

4. Suíte de testes <service.spec.ts>.

Sua tarefa é implementar a nova classe de serviço de forma a atender todas as regras
estabelecidas no contexto de negócio.

A classe gerada deve obter 100% de aprovação na suíte de testes.

Durante a implementação, você poderá executar autonomamente a suíte de testes,
analisar os logs produzidos e ajustar exclusivamente o código de produção.

A execução deverá obedecer aos seguintes critérios:

- Cada execução da suíte de testes será contabilizada como um ciclo, incluindo a
primeira execução;
- Será permitido o máximo de dez ciclos de execução da suíte;
- Caso a suíte não alcance 100% de aprovação até o décimo ciclo, encerre o processo.
```

---

# 4. Artefatos experimentais

O repositório disponibiliza os principais artefatos utilizados na pesquisa.

Entre eles estão:

### Especificações

* `description.md`
* `specification.md`
* `interfaces.ts`
* `contract.ts`
* `issue.md`

### Testes

* suítes originalmente geradas na Fase 1;
* novos casos de teste gerados na Fase 2;
* suítes refinadas utilizadas como gabarito na Fase 3.

### Implementações

* implementações de referência;
* versões utilizadas nos cenários de manutenção;
* versões corrigidas;
* implementações geradas na Fase 3.

### Mutantes

São disponibilizadas as implementações contendo as falhas intencionalmente introduzidas durante a Fase 1.

Cada arquivo mutante contém **uma única alteração defeituosa**, permitindo associar diretamente a eventual falha de um teste à anomalia introduzida.

---

# 5. Distribuição dos mutantes

Foram utilizados **47 cenários de mutação**, distribuídos da seguinte forma:

| Serviço                           | Quantidade de mutações |
| --------------------------------- | ---------------------: |
| RegisterUserService               |                      4 |
| CreateOrderService                |                      5 |
| FraudAnalysisService              |                      5 |
| SubscriptionBillingService        |                      5 |
| MarketplaceSettlementService      |                      3 |
| LedgerReconciliationService       |                      3 |
| FulfillmentAllocationService      |                     11 |
| GlobalFulfillmentOptimizerService |                     11 |
| **Total**                         |                 **47** |

---

# 6. Principais resultados

## Fase 1

Das oito suítes inicialmente produzidas:

* **6 de 8** foram integralmente compatíveis com as implementações de referência;
* taxa de validade: **75,0%**;
* **42 de 47 mutações** foram detectadas;
* taxa global de detecção de mutações: **89,4%**.

## Fase 2

Foram gerados oito novos casos de teste.

Todos apresentaram o comportamento experimental esperado:

* falha na versão original;
* aprovação na versão corrigida.

Resultado:

**8 de 8 cenários aprovados.**

## Fase 3

As oito implementações geradas pelo agente alcançaram aprovação integral nas respectivas suítes refinadas dentro do limite estabelecido de dez ciclos.

Resultado:

**8 de 8 serviços com 100% da suíte aprovada.**