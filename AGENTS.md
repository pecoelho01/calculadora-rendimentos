# Instruções da Calculadora de Rendimentos

Este ficheiro define as regras do repositório e o routing de agentes, seguindo a organização do MetroLiveTime e adaptando-a a esta aplicação Next.js/React/TypeScript, preparada para Vercel.

## Contexto do projeto

- `src/app/`: Next.js App Router, layout, navegação e estilos em `globals.css`.
- `src/components/`: interface React, dashboard, diálogos e gráficos.
- `src/lib/portfolio.ts`: cálculos puros e reconstrução histórica; nunca duplicar fórmulas na UI ou no relatório.
- `src/lib/validation.ts`: validação partilhada de números, datas, tickers, ordens e carteiras.
- `src/lib/csv.ts`: contrato de importação/exportação CSV.
- `src/lib/storage.ts`: persistência local versionada e validação de cópias de segurança.
- `src/lib/market.ts`: adaptador Yahoo Finance exclusivamente no servidor, com cache curto.
- `src/app/api/market/route.ts`: validação dos pedidos e resposta de mercado.
- `public/`: modelos CSV para download; manter sincronizados com os exemplos na raiz.
- `tests/`: cálculos determinísticos e fluxos Playwright.
- `legacy/streamlit/`: referência da implementação Python anterior, fora do build e do deploy ativos.
- `package.json` e `package-lock.json`: dependências e comandos. Usar Node.js 24 LTS e npm.

Manter o texto apresentado ao utilizador em português. Usar TypeScript estrito e respeitar a separação entre interface, cálculos, armazenamento e integração externa.

## Regras da stack e dos dados

- Preferir Server Components por omissão; usar `use client` apenas nas fronteiras interativas. Nunca importar o adaptador Yahoo num componente cliente.
- Não enviar carteiras, quantidades ou preços de compra ao endpoint de mercado. Enviar apenas os tickers e a data inicial necessários.
- Não guardar dados de carteiras em memória global, ficheiros temporários ou cache partilhada da Vercel. A cache do servidor contém apenas dados públicos de mercado.
- A persistência atual é `localStorage`, sem autenticação ou sincronização. Validar esquema/versão antes de carregar ou restaurar e não sobrescrever dados corrompidos automaticamente.
- Uma carteira tem uma moeda. Sem conversão cambial explícita, não somar cotações incompatíveis como se fossem da mesma moeda. Preservar a distinção entre preço zero e cotação ausente.
- Validar vendas cronologicamente; não permitir vender mais do que a posição. Para ordens no mesmo dia, preservar a ordem de registo. Importações devem ser atómicas.
- Manter contabilização FIFO por lotes, rentabilidade das posições abertas e ROI sobre todas as compras conforme o README. Não apresentar essa métrica como retorno anualizado, TWR ou XIRR.
- Reconstruir o histórico apenas com observações anteriores ou iguais à data de avaliação. Sem fallback silencioso para custo médio nem alinhamento do benchmark para o futuro.
- A integração Yahoo é não oficial: limitar tickers/pedidos, validar respostas, usar timeout/cache e mostrar indisponibilidade sem inventar preços.
- O relatório usa os mesmos valores do dashboard através da impressão do navegador. Verificar o CSS de impressão quando a tabela/métricas mudarem.
- Deploy alvo: Vercel com runtime Node.js; não usar exportação estática para uma aplicação que depende de `/api/market`.
- Contas, base de dados, câmbio, dividendos e splits automáticos ampliam o âmbito: definir contratos e migração antes de implementar.

## Papel do agente principal

O agente principal é responsável por compreender o pedido, classificar a complexidade e o risco, escolher o routing, fornecer contexto aos agentes, consolidar resultados e validar a solução antes de concluir.

## Routing obrigatório

Antes de trabalhar no repositório, classificar o pedido pelo âmbito, risco e tipo de alteração. Usar os seguintes papéis quando a delegação estiver disponível e acrescentar valor.

### Tarefa trivial

Executar diretamente com o agente principal quando a tarefa for pequena, clara e de baixo risco, sem alteração de código nem de comportamento.

Exemplos: consulta de ficheiros, correção textual ou pequena atualização documental.

### Pequena alteração de código clara

Pode usar-se `luna_coder` para uma alteração focada, com contexto suficiente e validação proporcional ao impacto. O agente principal pode executá-la diretamente quando a coordenação for mais dispendiosa do que a implementação.

### Tarefa não trivial ou complexa

Começar por `sol_planner` para analisar o pedido e produzir um plano. Selecionar os restantes agentes conforme a necessidade:

| Agente | Responsabilidade |
| --- | --- |
| `sol_planner` | Definir abordagem, dependências, riscos e critérios de aceitação. |
| `luna_scout` | Mapear código e recolher evidência sem editar ficheiros. |
| `luna_coder` | Implementar alterações delimitadas pelo plano. |
| `luna_tester` | Preparar ou executar validações e reportar falhas. |
| `sol_reviewer` | Rever correção, segurança, manutenção e regressões sem editar. |
| `regression_reviewer` | Rever impacto em cálculos existentes, CSV, gráficos e PDF. |
| `integration_guardian` | Rever contratos entre UI, lógica, adaptador Yahoo, persistência e dependências. |
| `test_auditor` | Avaliar cobertura e qualidade das verificações, sobretudo dos cálculos. |

Os três últimos papéis são opcionais, conforme o risco. Não é obrigatório usar agentes de implementação em análises ou reviews, nem agentes de testes ou revisão quando não acrescentarem valor.

Alterações às fórmulas de ROI, contabilização de compras e vendas, custo médio, séries temporais ou tratamento de dados financeiros exigem planeamento e validação explícitos, mesmo que o diff seja pequeno.

### Disponibilidade dos agentes

Os nomes acima identificam papéis de routing; este ficheiro não instala agentes nem configura modelos. Este repositório ainda não contém definições em `.codex/agents/`.

- Usar agentes personalizados com estes nomes quando estiverem configurados e disponíveis no ambiente.
- Respeitar as ferramentas e regras de delegação do ambiente em execução.
- Se um agente ou modelo necessário não estiver disponível, indicar a limitação e não afirmar que foi utilizado.
- Quando as regras do ambiente permitirem execução direta, o agente principal assume as responsabilidades necessárias e mantém o mesmo nível de planeamento e validação.
- Não substituir um modelo ou fornecedor expressamente pedido pelo utilizador sem autorização.

## Regras de delegação

- Dar a cada agente uma tarefa delimitada, os ficheiros relevantes, as restrições e o resultado esperado.
- Pedir referências concretas a ficheiros, símbolos, linhas ou comandos nas análises e revisões.
- Iniciar a implementação apenas quando houver contexto suficiente.
- Executar em paralelo apenas tarefas independentes, com responsabilidade explícita sobre os ficheiros; nunca permitir edições simultâneas dos mesmos ficheiros.
- O agente de testes reporta falhas e evidência; não corrige código por iniciativa própria.
- O agente de revisão permanece em modo de leitura e procura erros, regressões, problemas de segurança e lacunas de validação.
- Esperar pelos resultados necessários antes de concluir e resolver os problemas relevantes encontrados.
- Manter a delegação visível quando a interface o permitir e comunicar apenas agentes efetivamente iniciados.

## Qualidade e validação

- Fazer alterações focadas e preservar trabalho não relacionado.
- Manter os cálculos em `src/lib/portfolio.ts` e evitar duplicar fórmulas na interface ou no PDF.
- Preservar o contrato CSV documentado no `README.md`; atualizar documentação e exemplos se esse contrato mudar.
- Validar dados externos e entradas do utilizador, incluindo números, datas, tickers e tipos de ordem.
- Distinguir ausência ou falha de dados de preços e retornos iguais a zero.
- Em alterações de cálculos, verificar casos relevantes com resultados conhecidos: compras múltiplas, venda parcial ou total, posições abertas e carteira vazia. Usar dados locais ou mocks para verificações determinísticas.
- Em alterações temporais, verificar ordenação de datas, fusos horários e alinhamento com o benchmark.
- Em alterações de UI, CSV ou PDF, verificar o fluxo afetado e a coerência dos valores apresentados.
- Executar as verificações adequadas à alteração; não criar testes que apenas reproduzam a implementação.
- Não afirmar que testes passaram ou que a aplicação foi verificada sem executar essas verificações. Identificar limitações de rede, dependências ou ambiente.

Executar `npm ci` e `npm run dev` para desenvolvimento. Antes de concluir alterações de código, executar `npm test`, `npm run typecheck`, `npm run lint` e `npm run build`. Para alterações de UI/CSV/persistência, executar também `npm run test:e2e` após instalar Chromium com `npx playwright install chromium`. Usar dados mockados nos testes determinísticos; distinguir esses testes de uma consulta Yahoo real e de uma validação na Vercel. Consultar o `README.md` para fórmulas, contrato CSV, limitações e deploy.

## Git e segurança

- Nunca usar o prefixo `codex/` nos nomes de branches. Usar nomes descritivos diretamente, como `fix/csv-validation` ou `refactor/portfolio-logic`.
- Não criar commits diretamente na `main`.
- Não fazer push, merge, deploy ou operações destrutivas sem autorização do utilizador; respeitar autorizações já dadas na sessão.
- Nunca expor credenciais, tokens, sessões ou dados pessoais de carteiras reais em código, logs ou exemplos.
- Não adicionar dependências nem alterar a arquitetura sem necessidade para o pedido.

## Estilo dos commits

Seguir a convenção do MetroLiveTime: **Conventional Commits**, com o tipo em inglês e a descrição em português.

```text
<type>(<scope>): <descrição>
```

O `scope` é opcional e identifica a área afetada, por exemplo `portfolio`, `csv`, `ui`, `pdf` ou `docs`.

| Tipo | Utilização |
| --- | --- |
| `feat` | Nova funcionalidade. |
| `fix` | Correção de erro ou comportamento incorreto. |
| `docs` | Alterações exclusivamente de documentação. |
| `style` | Formatação sem impacto no comportamento. |
| `refactor` | Alteração interna sem nova funcionalidade nem correção de erro. |
| `perf` | Melhoria de desempenho. |
| `test` | Adição ou alteração de testes. |
| `build` | Alterações no build ou em dependências externas. |
| `ci` | Alterações na integração contínua. |
| `chore` | Manutenção sem alteração do código funcional. |
| `revert` | Reversão de uma alteração anterior. |

Regras para o título do commit:

- Escrever a descrição em português, em letras minúsculas e começando com um verbo no infinitivo.
- Ser breve e específico, sem ponto final.
- Evitar mensagens vagas como `update`, `changes`, `fix stuff` ou `final`.
- Incluir apenas uma alteração lógica por commit e rever todo o conteúdo antes de o criar.

Exemplos:

```text
feat(csv): permitir importar ordens de venda
fix(portfolio): corrigir custo médio após venda parcial
docs: atualizar instruções de execução
refactor(pdf): simplificar geração do relatório
```

Quando necessário, separar o corpo do título por uma linha em branco e explicar o motivo, decisões técnicas e efeitos secundários relevantes.

Assinalar alterações incompatíveis com `!` após o tipo ou scope e descrever o impacto e a migração num rodapé `BREAKING CHANGE:`. Por exemplo:

```text
feat(csv)!: alterar nomes das colunas de importação

BREAKING CHANGE: a coluna `pricebuy` foi substituída por `price`.
Atualizar os ficheiros CSV antes de os importar.
```

Não criar commits sem autorização do utilizador. Não alterar commits existentes, fazer rebase ou force push sem autorização explícita; respeitar autorizações já dadas na sessão.

## Estilo dos Pull Requests

Usar o mesmo formato de Conventional Commits, tipos permitidos e regras de descrição dos commits para o título do PR: tipo em inglês, descrição em português, verbo no infinitivo, letras minúsculas e sem ponto final.

Cada PR deve ser pequeno, focado e conter uma alteração lógica ou um conjunto pequeno de alterações diretamente relacionadas. Evitar refatorações, alterações cosméticas ou atualizações de dependências fora do âmbito.

A descrição deve representar o estado final da branch e explicar o problema, a solução e o resultado esperado para alguém que não acompanhou a implementação. Seguir o modelo do MetroLiveTime:

```markdown
## Resumo

Descrever o problema ou necessidade, a solução e o resultado principal.

## Alterações

- Indicar as alterações relevantes e os módulos ou comportamentos afetados.
- Explicar decisões técnicas relevantes.

## Validação

- Indicar os comandos executados e os respetivos resultados.
- Descrever verificações manuais relevantes.
- Identificar verificações não executadas e explicar o motivo.

## Riscos e limitações

- Indicar riscos, limitações conhecidas e casos não testados.
- Identificar trabalho deliberadamente fora do âmbito, quando relevante.

## Breaking changes

Indicar alterações incompatíveis e instruções de migração ou escrever `Nenhum`.

## Issues relacionadas

- Closes #123
- Relates to #456
```

- Remover secções sem conteúdo relevante, salvo se existir um modelo obrigatório no repositório.
- Substituir as referências de exemplo por issues reais relacionadas; não inventar números. Usar `Closes` apenas quando se pretende fechar a issue após o merge.
- Não limitar a descrição a repetir o título nem usar afirmações vagas sobre validação.
- Quando houver alterações de comportamento, incluir testes adequados se existir infraestrutura; se não forem adicionados, explicar o motivo e a validação alternativa.
- Documentar dependências alteradas, o motivo e o impacto. Para alterações incompatíveis, identificar formatos, APIs ou configurações afetadas e instruções de atualização.
- Incluir evidência visual adequada para alterações de interface sempre que possível, sem dados pessoais ou sensíveis.
- Antes de abrir ou atualizar o PR, rever o diff completo, título, descrição, validações, documentação e possíveis alterações acidentais. Excluir logs temporários, caches, artefactos gerados e segredos.
- Manter como `draft` enquanto a implementação, decisões ou validações essenciais estiverem pendentes. Não marcar como pronto com testes relevantes a falhar, conflitos ou comentários importantes por resolver.
- Após correções de revisão, executar novamente as verificações afetadas e atualizar a descrição para refletir o resultado final.
- A publicação do PR, a marcação como pronto e o merge exigem autorização do utilizador; respeitar autorizações já dadas na sessão.
- Antes de publicar, apresentar título, descrição, branches de origem e destino, resumo dos commits, validações e riscos conhecidos.
- Antes do merge, confirmar verificações obrigatórias, aprovações necessárias, ausência de conflitos e resolução dos comentários importantes. Não ignorar proteções da branch.
- Respeitar a estratégia de merge do repositório; na ausência de regra, preferir `squash merge` para PRs pequenos e focados. A mensagem final deve seguir a convenção de commits.

## Resultado final

Responder de forma curta e factual: alterações e ficheiros principais, agentes efetivamente utilizados quando houver delegação, validações executadas e limitações relevantes.
