# Instruções da Calculadora de Rendimentos

Este ficheiro define as regras do repositório e o routing de agentes, seguindo a organização do MetroLiveTime e adaptando-a a esta aplicação Next.js/React/TypeScript, preparada para Vercel.

## Contexto do projeto

- `src/app/`: Next.js App Router, layout, navegação e estilos em `globals.css`.
- `src/components/`: interface React, dashboard, diálogos e gráficos.
- `src/lib/portfolio.ts`: cálculos puros e reconstrução histórica; nunca duplicar fórmulas na UI ou no relatório.
- `src/lib/validation.ts`: validação partilhada de números, datas, tickers, ordens e carteiras.
- `src/lib/csv.ts`: contrato de importação/exportação CSV.
- `src/lib/storage.ts`: persistência local versionada e validação de cópias de segurança.
- `src/server/market/yahoo.adapter.ts`: adaptador Yahoo Finance exclusivamente no servidor, com cache curto.
- `src/app/api/`: rotas finas e composição de dependências por pedido.
- `src/server/`: controllers HTTP, services de casos de uso, repository de conta e adaptadores externos.
- `public/`: modelos CSV para download; manter sincronizados com os exemplos na raiz.
- `tests/`: cálculos determinísticos e fluxos Playwright.
- `legacy/streamlit/`: referência da implementação Python anterior, fora do build e do deploy ativos.
- `package.json` e `package-lock.json`: dependências e comandos. Usar Node.js 24 LTS e npm.

Manter o texto apresentado ao utilizador em português. Usar TypeScript estrito e respeitar a separação entre interface, cálculos, armazenamento e integração externa.

## Regras da stack e dos dados

- Preferir Server Components por omissão; usar `use client` apenas nas fronteiras interativas. Nunca importar o adaptador Yahoo num componente cliente.
- Não enviar carteiras, quantidades ou preços de compra ao endpoint de mercado. Enviar apenas os tickers e a data inicial necessários.
- Não guardar dados de carteiras em memória global, ficheiros temporários ou cache partilhada da Vercel. A cache do servidor contém apenas dados públicos de mercado.
- O modo local usa `localStorage`, sem autenticação ou sincronização. A conta Supabase opcional segue `supabase/CONTRACT.md`, com autenticação, RLS e revisões por carteira; não sincronizar os dois modos implicitamente. Validar esquema/versão antes de carregar ou restaurar e não sobrescrever dados corrompidos automaticamente.
- Uma carteira tem uma moeda. Sem conversão cambial explícita, não somar cotações incompatíveis como se fossem da mesma moeda. Preservar a distinção entre preço zero e cotação ausente.
- Validar vendas cronologicamente; não permitir vender mais do que a posição. Para ordens no mesmo dia, preservar a ordem de registo. Importações devem ser atómicas.
- Manter contabilização FIFO por lotes, rentabilidade das posições abertas e ROI sobre todas as compras conforme o README. Não apresentar essa métrica como retorno anualizado, TWR ou XIRR.
- Reconstruir o histórico apenas com observações anteriores ou iguais à data de avaliação. Sem fallback silencioso para custo médio nem alinhamento do benchmark para o futuro.
- A integração Yahoo é não oficial: limitar tickers/pedidos, validar respostas, usar timeout/cache e mostrar indisponibilidade sem inventar preços.
- O relatório usa os mesmos valores do dashboard através da impressão do navegador. Verificar o CSS de impressão quando a tabela/métricas mudarem.
- Deploy alvo: Vercel com runtime Node.js; não usar exportação estática para uma aplicação que depende de `/api/market`.
- Contas, base de dados, câmbio, dividendos e splits automáticos ampliam o âmbito: definir contratos e migração antes de implementar.

## Legibilidade e organização do código

- Priorizar a compreensão por quem mantém o projeto. Não reduzir o número de linhas à custa da clareza.
- Escrever funções e componentes com uma responsabilidade clara. Separar responsabilidades quando isso facilitar a leitura, os testes ou a manutenção.
- Usar nomes descritivos para variáveis, funções e tipos. Evitar abreviações que exijam conhecer o contexto.
- Separar etapas lógicas com uma linha em branco, sem espaçamento excessivo nem separadores decorativos.
- Dividir chamadas, objetos e expressões extensas por várias linhas, seguindo o formatador do projeto.
- Dar nomes a resultados intermédios quando isso explicar uma condição, transformação ou cálculo.
- Preferir condições explícitas e retornos antecipados quando reduzirem a profundidade de indentação.
- Evitar ternários aninhados, encadeamentos difíceis de acompanhar e várias operações independentes na mesma expressão.
- Manter o JSX centrado na apresentação. Colocar cálculos de domínio nos módulos existentes e extrair lógica interativa quando necessário.
- Reservar arrow functions para callbacks curtos e simples. Preferir funções nomeadas com `function` para lógica extensa, handlers com várias etapas e operações autónomas.
- Extrair callbacks extensos do JSX e corpos grandes de `map` para funções ou componentes com responsabilidade clara. Dar nomes às operações e reduzir o aninhamento; trocar apenas a sintaxe de uma arrow extensa não resolve a legibilidade.
- Nos hooks, preservar closures, dependências, ordem de execução e limpeza ao extrair callbacks. Não adicionar `useCallback` apenas por estilo nem impor conversões mecânicas ou limites arbitrários de linhas.
- Extrair funções, hooks ou componentes quando tiverem um propósito identificável. Evitar fragmentar o código em pequenas abstrações que obriguem a saltar entre ficheiros sem benefício.
- Usar comentários para explicar motivos, restrições e decisões. Melhorar nomes e estrutura antes de comentar código confuso.
- Preservar comportamento, contratos e precisão dos cálculos durante refatorações de legibilidade.
- Limitar a reorganização ao âmbito do pedido. Não reformatar ficheiros não relacionados.

Antes de concluir, rever o diff à procura de nomes ambíguos, expressões densas, responsabilidades misturadas e abstrações desnecessárias.

### Exemplos de estilo em TypeScript e React

Estes exemplos ilustram legibilidade; não introduzem novas regras de negócio nem justificam duplicar cálculos existentes.

Preferir condições com nomes que revelem a intenção:

```typescript
type PortfolioSummary = {
  name: string;
  currency: string;
};

function filterPortfolios(
  portfolios: PortfolioSummary[],
  search: string,
  currency: string,
): PortfolioSummary[] {
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-PT");

  return portfolios.filter((portfolio) => {
    const matchesSearch = portfolio.name
      .toLocaleLowerCase("pt-PT")
      .includes(normalizedSearch);
    const matchesCurrency = portfolio.currency === currency;

    return matchesSearch && matchesCurrency;
  });
}
```

Preferir estados explícitos e JSX distribuído por linhas legíveis:

```tsx
type ExportButtonProps = {
  isExporting: boolean;
  onExport: () => void;
};

function ExportButton({ isExporting, onExport }: ExportButtonProps) {
  const label = isExporting ? "A exportar…" : "Exportar CSV";

  return (
    <button
      type="button"
      disabled={isExporting}
      onClick={onExport}
    >
      {label}
    </button>
  );
}
```

### Formatação automática

- Usar a versão local de Prettier fixada no `package-lock.json` e a configuração `.prettierrc.json`: indentação de dois espaços, aspas duplas, ponto e vírgula e largura preferida de 80 colunas. A largura é uma preferência do formatador, não um limite rígido.
- Formatar apenas os ficheiros abrangidos pelo pedido: `npm run format -- caminho/ficheiro.ts caminho/componente.tsx`.
- Verificar esses mesmos ficheiros com `npm run format:check -- caminho/ficheiro.ts caminho/componente.tsx`.
- Os comandos exigem caminhos explícitos para evitar uma reformatação global acidental. Não executar uma reformatação de todo o repositório sem pedido explícito.
- No editor, usar o Prettier local e a configuração do projeto. Não manter regras de formatação concorrentes no ESLint.
- O Prettier trata a apresentação do código; nomes, responsabilidades e clareza do fluxo continuam sujeitos a revisão.
- A reorganização do código existente será feita apenas quando o utilizador a pedir explicitamente.

### ESLint e revisão automática de qualidade

- O job `Quality, tests and build`, em `.github/workflows/ci.yml`, executa Prettier antes de `npm run lint`, seguido dos restantes checks existentes. O Prettier verifica os ficheiros alterados suportados pelo formatador, respeitando `.prettierignore`; uma falha de formatação ou um erro de ESLint faz falhar o job.
- Os limites de manutenção em `eslint.config.mjs` são avisos para permitir adoção gradual, sem bloquear PRs pela dívida existente. Não usar `--max-warnings 0` nesta fase.

| Regra                               | Critério                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `complexity`                        | Complexidade ciclomática máxima de 15.                                                                                                  |
| `max-lines-per-function`            | Até 100 linhas por função, excluindo linhas vazias e comentários.                                                                       |
| `max-depth`                         | Até 4 níveis de aninhamento de blocos.                                                                                                  |
| `max-params`                        | Até 4 parâmetros por função.                                                                                                            |
| `max-nested-callbacks`              | Até 3 callbacks aninhados.                                                                                                              |
| `no-unreachable`                    | Detetar código inalcançável.                                                                                                            |
| `no-useless-return`                 | Detetar retornos desnecessários.                                                                                                        |
| `no-constant-binary-expression`     | Detetar expressões binárias com resultado constante.                                                                                    |
| `@typescript-eslint/no-unused-vars` | Detetar imports e variáveis TypeScript não utilizados; parâmetros e erros capturados intencionalmente não usados podem começar por `_`. |

- Manter as configurações existentes de Next.js Core Web Vitals, React, React Hooks e TypeScript. Os erros dessas configurações continuam a bloquear o CI, incluindo `@typescript-eslint/no-explicit-any`.
- Ao alterar código, rever os avisos introduzidos e procurar respeitar os limites com nomes claros e responsabilidades coesas. Não fragmentar funções nem criar abstrações apenas para satisfazer métricas. Não desativar regras nem aumentar limites apenas para ocultar avisos; justificar exceções necessárias.
- Não corrigir dívida não relacionada nem reorganizar o repositório fora do âmbito do pedido. Os avisos existentes não justificam uma refatoração global.
- O comentário da revisão IA deve começar por um resumo das alterações, áreas afetadas e impacto esperado, antes da avaliação de qualidade, usando a mesma chamada gratuita. Identificar a cobertura potencialmente parcial e não inventar intenções ou impactos que os patches não permitam inferir.
- A revisão por IA é um workflow separado, `.github/workflows/ai-review.yml`, informativo e sem bloqueio automático do merge. Avaliar as sugestões com evidência antes de as aplicar; a IA não substitui os testes nem a revisão humana.
- Ao manter essa integração, preservar o endpoint `https://openrouter.ai/api/v1/chat/completions`, o modelo exclusivo `openrouter/free`, os preços máximos de entrada/saída zero e a ausência de retries ou fallback pago. Usar apenas o secret `OPENROUTER_API_KEY`, sem o expor em código, logs ou comentários.
- Preservar o isolamento do job de IA: obter apenas o script da revisão confiável da base `main` pela API GitHub, sem checkout de repositórios nesse job; nunca executar código do PR com acesso à chave, tratar o diff como dados não confiáveis e manter os filtros de ficheiros sensíveis e os limites de contexto. Forks, Dependabot, chave ausente e indisponibilidade devem continuar a produzir indicação informativa sem falhar os restantes checks.
- Consultar [.github/CODE_QUALITY.md](.github/CODE_QUALITY.md) para configuração do secret, detalhes dos checks, limites gratuitos e validação da integração. Manter esse documento, estas instruções e as configurações coerentes quando as regras mudarem.

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

| Agente                 | Responsabilidade                                                                |
| ---------------------- | ------------------------------------------------------------------------------- |
| `sol_planner`          | Definir abordagem, dependências, riscos e critérios de aceitação.               |
| `luna_scout`           | Mapear código e recolher evidência sem editar ficheiros.                        |
| `luna_coder`           | Implementar alterações delimitadas pelo plano.                                  |
| `luna_tester`          | Preparar ou executar validações e reportar falhas.                              |
| `sol_reviewer`         | Rever correção, segurança, manutenção e regressões sem editar.                  |
| `regression_reviewer`  | Rever impacto em cálculos existentes, CSV, gráficos e PDF.                      |
| `integration_guardian` | Rever contratos entre UI, lógica, adaptador Yahoo, persistência e dependências. |
| `test_auditor`         | Avaliar cobertura e qualidade das verificações, sobretudo dos cálculos.         |

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
- Ao implementar ou alterar a interface, considerar a responsividade desde o início: o telemóvel é um dispositivo de utilização frequente, tal como o computador. Adaptar layouts, navegação, tabelas, gráficos e diálogos a ecrãs pequenos, garantindo texto legível e controlos fáceis de usar por toque.
- Em alterações de UI, verificar os fluxos afetados em larguras de telemóvel e de computador, incluindo ausência de sobreposições, conteúdo cortado ou deslocamento horizontal inesperado.
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

| Tipo       | Utilização                                                      |
| ---------- | --------------------------------------------------------------- |
| `feat`     | Nova funcionalidade.                                            |
| `fix`      | Correção de erro ou comportamento incorreto.                    |
| `docs`     | Alterações exclusivamente de documentação.                      |
| `style`    | Formatação sem impacto no comportamento.                        |
| `refactor` | Alteração interna sem nova funcionalidade nem correção de erro. |
| `perf`     | Melhoria de desempenho.                                         |
| `test`     | Adição ou alteração de testes.                                  |
| `build`    | Alterações no build ou em dependências externas.                |
| `ci`       | Alterações na integração contínua.                              |
| `chore`    | Manutenção sem alteração do código funcional.                   |
| `revert`   | Reversão de uma alteração anterior.                             |

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

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
