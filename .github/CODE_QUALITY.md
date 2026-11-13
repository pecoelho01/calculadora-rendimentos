# Qualidade e revisão automática de Pull Requests

## Prettier e ESLint

O job existente `Quality, tests and build` verifica a formatação com a versão
local de Prettier, `.prettierrc.json` e `.prettierignore`. O script
`scripts/check-format.mjs` passa caminhos explícitos a `npm run format:check`,
sem escrever ficheiros. Em PRs usa a diferença entre os SHAs base e head; em
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
4. Integrar o workflow e o script na `main`. O workflow só executa o script da
   revisão confiável da base `main`; a primeira versão deste PR não consegue
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

O workflow separado usa `pull_request_target`, checkout do SHA da base `main` e
Actions fixadas por SHA. Não instala dependências, não usa caches/artefactos do PR,
não faz checkout do head e não executa código do PR. As únicas permissões são
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

Os testes `tests/ai-review.test.mjs` usam HTTP simulado e verificam os limites,
modelo/preço fixos, skips, falhas, atualização do comentário, neutralização da
resposta e commits ultrapassados. Não consomem quota nem usam credenciais reais.
Para verificar o script incremental, usar SHAs completos existentes no clone:

```bash
FORMAT_BASE=<sha-base> FORMAT_HEAD=<sha-head> node scripts/check-format.mjs
```
