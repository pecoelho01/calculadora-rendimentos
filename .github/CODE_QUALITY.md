# Qualidade e revisão automática de Pull Requests

## Prettier e ESLint

O job `Quality checks and build` verifica a formatação com a versão
local de Prettier, `config/prettier.config.json` e `.prettierignore`. O script
`scripts/check-format.mjs` passa caminhos explícitos a `npm run format:check`,
sem escrever ficheiros, através de `npm run format:check:changed`. O Git é
invocado por `/usr/bin/git` (runners Ubuntu e desenvolvimento macOS/Linux), e o
npm pelo seu CLI absoluto com o Node em execução, sem procurar executáveis em
`PATH`. Em PRs usa a diferença entre os SHAs base e head; em
pushes usa before/head. O primeiro push de uma branch (before nulo) é
ignorado por não ter uma revisão anterior. A execução manual mantém os restantes checks e omite
este passo por não existir um intervalo de alterações no evento.

A verificação cobre todo o conteúdo dos ficheiros alterados suportados pelo
Prettier; não exige formatar o repositório inteiro. Um ficheiro antigo alterado
pode precisar de formatação. Para o corrigir, indicar apenas os caminhos afetados:

```bash
npm run format -- src/exemplo.ts
npm run format:check -- src/exemplo.ts
```

O ESLint mantém Next.js, React, Hooks e TypeScript, incluindo as regras de imports
e variáveis não utilizados. Novos limites são avisos, sem `--max-warnings 0`:

| Regra                    | Limite                             |
| ------------------------ | ---------------------------------- |
| Complexidade ciclomática | 15                                 |
| Profundidade de blocos   | 4                                  |
| Linhas por função        | 100, sem linhas vazias/comentários |
| Parâmetros por função    | 4                                  |
| Callbacks aninhados      | 3                                  |

Também avisa sobre código inalcançável, retornos inúteis e expressões binárias
constantes. Imports/variáveis TypeScript não utilizados são avisos; parâmetros
intencionalmente não usados podem começar por `_`. As regras de erro existentes
continuam a bloquear o CI. Estes avisos tornam a dívida visível sem exigir uma
refatoração global imediata. Não foram adicionadas dependências.

## Ativar OpenRouter gratuito

1. Criar uma conta e uma API key em [OpenRouter](https://openrouter.ai/settings/keys).
   Não é necessário comprar créditos para usar o router gratuito.
2. No repositório GitHub, abrir **Settings → Secrets and variables → Actions →
   New repository secret**.
3. Guardar a chave com o nome exato `OPENROUTER_API_KEY`. Nunca a colocar num
   ficheiro, comentário ou variável pública.
4. Integrar o workflow e o script na `main`. O workflow obtém apenas o script da
   revisão confiável da base `main` através da API GitHub; a primeira versão deste PR não consegue
   rever-se automaticamente antes dessa integração.
5. Abrir ou atualizar um PR interno para `main`. O comentário identificado por
   marcador é atualizado em cada execução; os restantes workflows mantêm-se.

O mesmo comentário começa com um **Resumo das alterações**, seguido das **Áreas
afetadas** e do **Impacto esperado**, antes da avaliação de qualidade. O resumo
usa a mesma chamada ao modelo e é atualizado com os novos commits. Baseia-se
apenas nos patches elegíveis enviados; um aviso identifica sempre a cobertura
potencialmente parcial. Quando os patches não permitem inferir a finalidade ou
o impacto, o modelo deve indicar essa limitação. Os novos campos são validados,
limitados e neutralizados como o restante texto da resposta.

O único endpoint de inferência é
`https://openrouter.ai/api/v1/chat/completions`, com modelo fixo
`openrouter/free`, preços máximos de entrada e saída zero e fallback de providers
desativado. Não existem modelos alternativos, retries, ferramentas, plugins ou
opções configuráveis que possam selecionar um modelo pago. Há no máximo uma
chamada por execução/commit; novos commits voltam a executar a revisão.

O [router gratuito](https://openrouter.ai/docs/guides/routing/routers/free-router)
escolhe entre modelos gratuitos, pelo que a qualidade e disponibilidade variam.
As [quotas gratuitas](https://openrouter.ai/docs/api/reference/limits) dependem da
conta e podem mudar. Rate limits, falta de capacidade, chave ausente, respostas
inválidas ou erros de rede não provocam tentativas pagas. O relatório indica a
indisponibilidade e não bloqueia os outros checks. A configuração exige providers
que não recolham dados para treino (`data_collection: deny`), o que pode reduzir
a disponibilidade. A revisão é informativa; não a adicionar aos checks
obrigatórios de proteção da branch. O custo de inferência é zero; as quotas e
custos próprios de GitHub Actions continuam sujeitos ao plano GitHub.

## Segurança e alcance

O workflow separado usa `pull_request_target` e Actions fixadas por SHA, sem
checkout de qualquer repositório. Obtém apenas `scripts/ai-review.mjs` pela API
GitHub do próprio repositório, no `${{ github.sha }}`, que identifica a revisão
confiável da base `main`
[neste evento](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).
A API key OpenRouter só está disponível no passo que executa esse script; o passo
de leitura usa apenas o token GitHub. Não instala dependências, não usa
caches/artefactos do PR e não descarrega nem executa código do head do PR. As únicas permissões são
`contents: read` e `pull-requests: write`, necessárias para ler alterações e
atualizar o comentário. A chave só chega ao processo de revisão. Forks e
Dependabot são sempre ignorados, mesmo que exista uma chave; o comentário e o
resumo do job explicam o skip. Sem permissão para comentar, a indicação fica no
resumo do job.

A API GitHub fornece apenas patches; não são enviados título, descrição,
comentários, ficheiros completos nem dados de carteiras. O script considera até
300 registos de ficheiros, selecionando no máximo 12 patches de código em
`src/`, `tests/` e `scripts/`, até 6 000 caracteres por patch e 24 000 no conjunto
(serialização JSON, mais o prompt fixo). Configurações, lockfiles, dados,
credenciais, backups e caminhos suspeitos ficam fora. Patches com padrões comuns
de segredos são omitidos integralmente. A resposta tem até 2 000 tokens e timeout
de 60 segundos, sem retry. O comentário identifica o commit e o contexto parcial.

O diff é tratado como dados não confiáveis e não tem acesso a ferramentas. A
resposta é validada: problemas só são publicados para ficheiros enviados e linhas
adicionadas, com gravidade, explicação e sugestão. HTML, links e menções do modelo
são neutralizados. Apenas comentários do bot com o marcador próprio são editados.
Resultados de commits ultrapassados não são publicados. Nunca se registam os
corpos de erros da API, cabeçalhos de autenticação ou patches nos logs.

Os filtros de segredos são conservadores e não garantem detetar credenciais
arbitrárias inseridas em código. Não colocar segredos no Git; manter a deteção de
segredos do GitHub. Os patches elegíveis são enviados a um serviço externo e aos
seus providers segundo as respetivas políticas. A revisão pode omitir problemas,
produzir falsos positivos ou ser manipulada pelo contexto; requer avaliação humana
e não substitui testes, CodeQL, auditoria de dependências nem revisão humana.

## Validação local

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
```

Os testes `tests/integration/ai-review.test.mjs` usam HTTP simulado e verificam os limites,
modelo/preço fixos, skips, falhas, atualização do comentário, neutralização da
resposta e commits ultrapassados. Não consomem quota nem usam credenciais reais.
Para verificar o script incremental, usar SHAs completos existentes no clone:

```bash
FORMAT_BASE=<sha-base> FORMAT_HEAD=<sha-head> npm run format:check:changed
```

## Publicação e rollback

A CI agrega quatro jobs independentes: `Quality checks and build` (formatação,
lint, tipos, unitários e build), `E2E local` (build sem conta), `E2E account`
(build com configuração fictícia e mocks HTTP) e `E2E Supabase local real`
(Auth, Mailpit, PostgREST e PostgreSQL numa pilha Docker descartável). Os E2E
local e account correm por omissão nos projetos desktop e mobile; só os testes
que não dependem de layout, navegação ou toque recebem `@desktop-only`, que o
projeto mobile exclui com `grepInvert`. Estes dois jobs guardam diagnósticos em
caso de falha durante sete dias. A suite real usa Chromium e contas sintéticas
para verificar confirmação de registo por email e isolamento de carteiras. Os
diagnósticos omitem conteúdo de email, ligações de confirmação, credenciais e
sessões.
O agregador `Quality, tests and build` corre ainda que uma dependência falhe,
seja cancelada ou ignorada. Só passa se todos os resultados forem `success`.
O nome obrigatório no GitHub e na Vercel mantém-se, com as proteções existentes.
`forbidOnly` impede suites focadas acidentais no CI. SQL e auditoria conservam os
checks próprios. A revisão IA continua informativa e não é uma condição de release.

A auditoria corre às segundas-feiras às 07:23 UTC e CodeQL às 07:41 UTC, além dos
triggers de PR/push. A auditoria agendada tem workflow e nome de check próprios, sem gerar estados skipped para os checks obrigatórios da CI. O schedule não corre builds, SQL ou E2E. Os agendamentos só
ficam ativos depois de estes workflows entrarem na branch predefinida.

Em 14 de novembro de 2026 foram adicionados e confirmados no painel da Vercel os
Deployment Checks GitHub de produção: `Quality, tests and build`,
`SQL migrations and isolation`, `Dependency audit`, `CodeQL JavaScript/TypeScript`
e `SonarCloud Code Analysis`. O comportamento do agregador foi confirmado como
`Blocking`; o painel indicou que entram em vigor no próximo deployment de produção.
Manter a atribuição automática de domínios de produção ligada. Não usar Force
Promote para contornar falhas. O check adicional `CodeQL`, da app GitHub Advanced
Security, foi confirmado com sucesso no PR #38 e mantém-se na proteção do GitHub;
não foi adicionado à Vercel, pois não aparece no commit de push da `main`.
Não foram removidas ou reduzidas proteções existentes.

Procedimento de release com conta:

1. Preparar e rever as migrations e testar SQL/E2E com dados sintéticos.
2. Na primeira transição, usar janela controlada e aplicar 006, 007 e 008 pela ordem,
   apenas as ainda pendentes. 007 e 008 têm commits distintos; não prometer zero downtime.
3. Confirmar metadados e permissões da 008. Publicar apenas depois disso. O
   `next.config.ts` executa o preflight na fase de build quando `VERCEL_ENV=production`;
   o Next já carregou as variáveis. Conta configurada exige versão 8, RPC v1 e aliases.
   Configuração parcial, chave administrativa, falha de rede ou contrato incompatível
   bloqueiam o build. Sem URL nem chave, o modo local continua permitido.
4. Os checks obrigatórios bloqueiam a promoção/atribuição do domínio pela Vercel.
5. O workflow `Production deployment smoke` corre após um deployment de produção
   bem-sucedido e também pode ser iniciado manualmente. Usa apenas o domínio público
   fixo, sem tokens, contas reais ou bypass. Verifica HTML da página inicial, HTTP 401
   e `no-store` em `/api/account`, saúde do contrato em `/api/health` e SHA publicado.
   O script aguarda a atribuição do domínio à revisão esperada (até 40 consultas,
   intervalos de 15 segundos, timeout de 10 segundos por pedido), pois o evento pode
   chegar enquanto os Deployment Checks ainda bloqueiam a promoção. Uma versão antiga
   nunca passa como se fosse a nova; esgotar a espera faz falhar o smoke. Este smoke é deteção após publicação, não uma
   condição anterior à promoção; os checks da CI e o preflight são os bloqueios.
6. Promoção de previews e rollback de deployments já construídos podem não voltar
   a executar o build. Antes dessas operações, executar obrigatoriamente o preflight
   com a configuração pública do destino: `node --env-file=.env.production.local --import tsx scripts/check-release.ts`.
   O ficheiro local não deve ser versionado. Confirmar que o modo devolvido é o
   pretendido e rever SHA/destino; não confiar apenas no preflight do build antigo.
   No rollback da aplicação, manter 008 e os aliases na BD.
   Rollback da aplicação não faz rollback de dados nem de migrations.

### Verificação manual do contrato de produção

1. Em **Settings → Secrets and variables → Actions → Variables**, criar as
   variáveis de repositório `PRODUCTION_SUPABASE_URL` e
   `PRODUCTION_SUPABASE_PUBLISHABLE_KEY`. Usar os valores públicos do mesmo
   projeto Supabase configurado na Vercel para Production. O workflow fornece
   estes valores apenas ao passo que lê a RPC de metadados, sem secrets, sessão
   de utilizador ou credenciais administrativas.
2. Depois de o workflow estar na branch predefinida, um mantenedor com permissão
   de escrita pode abrir **Actions → Production schema readiness → Run workflow**,
   selecionar `main` e pedir a verificação antes do merge ou da promoção.
   Alternativamente, executar
   `gh workflow run production-schema-readiness.yml --ref main`.
   [Disparo manual no GitHub Actions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
3. Consultar o resultado em Actions. O job usa o SHA da `main` no momento do
   disparo. Se for selecionada outra ref, o job é ignorado. O disparo é manual
   também durante a revisão de PRs de forks e executa apenas o código da `main`
   quando esta é selecionada. Configuração ausente, parcial ou inválida, RPC
   indisponível ou contrato incompatível fazem falhar a execução.

Um resultado verde confirma que os metadados atuais de produção correspondem ao
contrato esperado pela `main` registada na execução. Em PRs que mudem o contrato,
preparar e testar migrations com dados sintéticos. Quando for altura de confirmar
o rollout, executar o script com o código revisto do candidato e a configuração
pública do destino. Sem `--strict-production`, o script continua a aceitar o modo
local quando as duas variáveis estão ausentes.

```bash
node --env-file=.env.production.local --import tsx scripts/check-release.ts --strict-production
```

`Production schema readiness` é informativo. Mantê-lo fora dos checks obrigatórios
do GitHub e dos Deployment Checks da Vercel para permitir preparar migrations
futuras. O preflight bloqueia o build de produção com conta se o contrato do
candidato for incompatível. `Production deployment smoke` verifica a revisão
publicada depois do deployment.

`GET /api/health` devolve apenas estado, modo de conta e SHA, sem carteiras ou
credenciais, e usa `no-store`. Em falha devolve 503 genérico. A consulta à RPC só lê
metadados constantes. Para executar o smoke localmente após `npm run build` e
`npm start`, usar `SMOKE_URL=http://127.0.0.1:3000 node scripts/deployment-smoke.mjs`.
Para testar a validação de revisão, definir também `SMOKE_REVISION` com o SHA completo.
Os testes HTTP simulados não comprovam um deployment real nem Auth/SMTP/RLS reais.
Esta alteração não aplicou migrations reais nem publicou uma nova versão.
