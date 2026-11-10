# Contrato da conta e migração (v1)

Definido antes da implementação. O formato `Portfolio` e o armazenamento local v1 mantêm-se. A conta é um domínio de persistência separado; nunca faz sincronização implícita com o navegador.

- RPCs atuais (migration 007): `public.get_account_portfolios()` para leitura e `public.apply_account_changes(p_changes jsonb, p_migration jsonb default null)` para escrita.
- `GET /api/account`: sessão Bearer verificada com Supabase Auth `getUser`; identidade nunca aceite no corpo. Devolve `{version:1,portfolios:[{portfolio,revision}]}`. Uma conta nova pode ter zero carteiras.
- `POST /api/account`: `{changes:[{id,portfolio,expectedRevision}],migration?}`. `portfolio:null` elimina; revisão `null` apenas cria; revisão inteira positiva atualiza/elimina exclusivamente a versão lida. Apenas diferenças são enviadas. Um conflito aborta todas as alterações com HTTP 409. A resposta é o snapshot confirmado da base de dados.
- Limites: 30 carteiras ativas, 3 MB de dados ativos por conta; após a migration 004, máximo de 1 000 IDs de carteira (incluindo apagadas) e 1 000 recibos/chaves de importação por conta; limites financeiros/validação partilhados. IDs não vazios até 200 caracteres. Ordens originais em JSONB, sem cálculos derivados; a posição no array desempata datas iguais.
- A RPC serializa mutações por utilizador e aplica o lote numa única transação; a revisão é monotónica por ID, incluindo recriação após remoção. Não há repetição automática de uma escrita com uma revisão mais recente.
- Migração explícita: `changes:[]`, `migration:{key,portfolios}`. `key` é SHA256 hexadecimal do `encodeStorage` das carteiras validadas. A API recalcula a chave; a base de dados associa recibo e conteúdo canónico à identidade autenticada. A terceira migration deduplica também pelo hash do conteúdo calculado no SQL, normalizando a escala numérica e preservando a ordem dos arrays. Repetir o mesmo conteúdo, mesmo com outra chave, não insere carteiras; uma chave nova fica associada ao mesmo recibo de conteúdo enquanto houver capacidade de recibos. A chave existente continua repetível no limite. Reutilizar a chave com conteúdo diferente falha. Os novos IDs importados derivam do hash de conteúdo da base de dados, num espaço separado; os IDs e recibos anteriores são preservados; nunca é permitido substituir uma carteira existente. Ordens e ordem de registo são preservadas. O recibo e todas as inserções pertencem à mesma transação. O localStorage não é alterado.
- A Data API não pode contornar a integridade: RPC valida estrutura, limites, IDs, números, datas UTC, tickers, precisão e posição cronológica com ordinalidade; escritas diretas revogadas. RLS `auth.uid() = user_id` protege leituras. RPC `SECURITY DEFINER` tem `search_path` fixo, não recebe `user_id` e limita sempre os acessos à identidade da sessão.
- Sem cache de dados privados, sem service-role, sem sessão/carteiras em memória global. Respostas privadas `Cache-Control: no-store`. Erros públicos sanitizados (400/401/409/413/429/503), sem logs de transações/tokens.
- A UI só considera guardado após confirmação. Mudança de modo/utilizador invalida pedidos pendentes, limpa os dados anteriores e não os grava noutro destino.

## Configuração externa

Aplicar as migrations SQL no projeto Supabase, configurar Auth (email/password, confirmação de email e recuperação), URL do site e redirects permitidos. Definir URL e publishable key nos ambientes Next/Vercel. A implementação e os testes com mocks não comprovam uma integração Supabase real. O [registo de configuração](SETUP.md) distingue a configuração aplicada, a validação real de Auth/SMTP e o deploy ainda pendente.

Os conflitos de negócio usam SQLSTATE `PT409`, traduzido pelo PostgREST em HTTP 409. Não usar `40001`: esse código indica uma falha transitória de serialização e provoca repetições automáticas no PostgREST, podendo impedir a resposta de conflito. A segunda migration corrige os dois conflitos em `account_apply`, sem alterar dados nem revisões. A API também reconhece `40001` para compatibilidade.

## Verificação SQL local sem credenciais

Além de `npm test` (contratos/API com backend injetado), é possível executar a migration num PostgreSQL WASM local através de PGlite, fixado em `0.5.15` nas dependências de desenvolvimento e no lockfile:

```bash
npm ci --ignore-scripts
npm run test:sql
```

O harness simula apenas o esquema `auth`, utilizadores fictícios e os papéis Supabase; executa as funções, grants e políticas SQL reais. Verifica CAS, rollback de lote e recibos, limites, isolamento/RLS, proibição de escrita direta, ordem de transações, vendas excessivas, migração repetida e revisão após apagar/recriar. Inclui limites Unicode/UTF-16, valores não representáveis em JavaScript e arredondamento das quantidades grandes conforme `shareUnits`. No limite de tamanho, também executa o handler real de `/api/account`: POST seguido de GET no máximo SQL, rejeição de uma escrita um byte acima e GET posterior inalterado. As validações TypeScript e as funções PostgreSQL são reais; Auth e o transporte RPC são injetados. Não testa o serviço Supabase Auth real, a Data API HTTP, email/SMTP ou Vercel.

## Correção de idempotência e verificação de tamanho

Aplicar `202610300003_account_import_idempotency.sql` após as duas migrations anteriores. Não altera carteiras, revisões ou IDs existentes. A RPC valida o conteúdo antes de consultar recibos; o lock por utilizador mantém a verificação e a gravação atómicas. A chave SHA256 `encodeStorage` continua a ser verificada pela API; a garantia contra duplicação na Data API passa a depender do conteúdo calculado pela própria base de dados.

Recibos históricos criados pelo cliente normal são compatíveis com a normalização numérica. Um recibo antigo criado diretamente por RPC com escala numérica não canónica é reconhecido pela sua chave e hash original e atualizado ao ser repetido. Como os recibos antigos guardam apenas um hash, não é possível reconstruir retroativamente variantes equivalentes desse conteúdo se a chamada histórica direta usou formatos não canónicos e perdeu a chave original.

O achado de tamanho baseado apenas nos separadores do array não foi reproduzido: o JSONB acrescenta espaços em cada objeto que superam esses separadores. Num teste PGlite com 30 carteiras e 7 363 ordens, 3 000 000 bytes medidos no SQL produziram 2 896 769 bytes no array JSON compacto e passaram `validateAccountSnapshot`. Uma alteração para 3 000 001 bytes foi rejeitada e revertida, mantendo a leitura válida. O limite não foi alterado; esta verificação local não substitui um teste do serviço Supabase real.

## Limites de persistência e de escrita (migration 004)

Aplicar `202610310004_account_resource_limits.sql` depois da 003, antes de disponibilizar contas ao público. Foi aplicada e registada no projeto `calculadora-rendimentos` em 1 de novembro de 2026, conforme [SETUP.md](SETUP.md). Outros projetos precisam de aplicação própria. Não remove nem reescreve carteiras, tombstones, revisões ou recibos existentes.

- A conta pode guardar até 1 000 IDs de carteira no total, contando carteiras ativas e tombstones. Apagar uma carteira mantém o ID/revisão e não liberta capacidade. Recriar o mesmo ID mantém a revisão monotónica e não ocupa outro registo. Continuam a aplicar-se os limites de 30 carteiras ativas e 3 MB ativos.
- Cada chave de migração ocupa um recibo, mesmo quando o conteúdo já foi importado. O máximo é 1 000 por conta. Repetir uma chave existente com o mesmo conteúdo continua idempotente; uma chave nova acima do limite é rejeitada antes de inserir o recibo. A reutilização de uma chave com conteúdo diferente continua inválida.
- Contas históricas com mais de 1 000 IDs ou recibos mantêm os dados e podem ler, atualizar/eliminar/recriar IDs existentes e repetir recibos existentes. Apenas o crescimento acima destes limites é bloqueado. Não existe limpeza automática de histórico que permita ressuscitar uma importação ou aceitar uma escrita antiga.
- `account_apply` permite até 60 chamadas confirmadas por janela de 60 segundos por utilizador, incluindo repetições idempotentes e lotes vazios. Usa o mesmo lock transacional da escrita e uma única linha privada por utilizador; uma nova janela começa na primeira chamada após decorrerem 60 segundos. O excesso usa SQLSTATE `PT429`, traduzido em HTTP 429, com `Retry-After: 60` na API Next.js. Não há repetição automática de escritas pela UI.
- O contador é transacional: chamadas inválidas, conflitos e falhas de capacidade fazem rollback também do contador. Este limite não conta pedidos rejeitados nem limita leituras, registos, login, SMTP ou o custo de processamento de pedidos inválidos. São necessários limites operacionais/antiabuso para essas superfícies; o contador SQL não substitui as definições Auth nem proteção de infraestrutura.
- O limite e as quotas são aplicados pela RPC, incluindo chamadas diretas à Data API. A tabela e a função auxiliar privadas não têm acesso direto para `anon` ou `authenticated`; a linha do contador é removida por cascata ao remover a conta Auth.

O harness PGlite verifica fronteiras de recibos e IDs incluindo tombstones, rejeição de crescimento por RPC direta, preservação de uma conta acima das quotas antes do upgrade, CAS após recriação, repetição após editar/apagar, rollback de lotes e contadores, isolamento por utilizador, limite 60/61 e renovação da janela sem esperar pelo relógio. A passagem do tempo é simulada apenas nas fixtures privilegiadas da base de dados local. Uma ligação PGlite não comprova concorrência real entre ligações, Auth/PostgREST HTTP nem aplicação da migration no Supabase.

## Esquema estrito de propriedades (migration 005)

Aplicar `202611020005_account_strict_properties.sql` depois da 004. A RPC rejeita propriedades desconhecidas, mesmo com valor `null`, com SQLSTATE `22023`: uma carteira admite apenas `id`, `name`, `currency` e `orders`; cada transação admite apenas `id`, `date`, `ticker`, `name`, `type`, `pricebuy` e `shares`. Mantêm-se as validações de tipos, valores, datas, quantidades e vendas. A validação ocorre antes de persistir, calcular hashes ou consultar recibos de importação, incluindo repetições com chave conhecida. Um lote inválido reverte também as alterações anteriores e o contador de escrita.

O caminho HTTP continua a normalizar os objetos para Portfolio v1 antes de chamar a RPC. O esquema estrito na base de dados impede que chamadas diretas persistam campos que a API removeria na leitura, alterando o hash sem alterar a carteira visível. Importações válidas continuam idempotentes com a mesma chave ou uma chave nova para o mesmo conteúdo.

A migration não altera carteiras, IDs, revisões, tombstones, recibos ou contadores já existentes. Registos históricos com campos adicionais continuam legíveis; podem ser atualizados com o esquema limpo e a revisão atual, ou eliminados. Repetir uma importação histórica que contenha campos adicionais passa a ser rejeitado. Os hashes antigos não permitem reconstruir o conteúdo original: não se garante deduplicação retroativa entre essas importações e versões limpas, nem se reescrevem recibos silenciosamente. Rever esses casos antes de repetir a importação.

A 005 foi aplicada e registada no projeto configurado em 2 de novembro de 2026. Foram verificados o corpo da função, o SQL registado, as permissões e a preservação dos dados existentes, conforme [SETUP.md](SETUP.md). Outros projetos exigem aplicação própria.

## Sessão ativa e logout (migration 006)

Aplicar `202611030006_account_active_sessions.sql` depois da 005. As políticas de leitura das duas tabelas e as RPCs públicas exigem que a claim `session_id` seja uma string UUID e corresponda a uma linha de `auth.sessions` com o mesmo `user_id` de `auth.uid()`. Sessão ausente, inválida, alheia ou removida pelo logout resulta em zero linhas na leitura direta e SQLSTATE `42501` nas RPCs (HTTP 401 pela API Next.js). Um logout com scope `local` não invalida as outras sessões do mesmo utilizador.

O helper `private.account_session_active()` é `STABLE SECURITY DEFINER` com `search_path` vazio. `authenticated` pode executá-lo nas políticas; não recebe acesso às sessões Auth nem execução da implementação privada de escrita. A função `account_apply(jsonb,jsonb)` existente é movida para `private` e tem execução revogada aos clientes. O wrapper público verifica a sessão antes de a invocar; os cálculos, validações, CAS, quotas e recibos permanecem na implementação original. `account_snapshot` tem a mesma verificação porque as RPCs `SECURITY DEFINER` não dependem da RLS das tabelas.

A migration não reescreve dados nem termina sessões. Tokens Auth anteriores com uma sessão válida continuam funcionais. A exigência de sessão aplica-se aos dados da aplicação; não revoga criptograficamente o JWT nem protege outras superfícies Supabase. A verificação usa a visibilidade transacional: pedidos já iniciados antes do logout podem concluir. Não equivale à expiração proativa por inatividade ou duração máxima de sessão.

O harness local simula `auth.sessions` e claims verificadas; remove apenas uma sessão para testar logout com o mesmo JWT, mantém outra sessão funcional e verifica claims ausentes/malformadas/alheias, leitura direta, ambas as RPCs, execução privada revogada, preservação dos dados no upgrade e ausência de efeitos/contagem de quota em escritas rejeitadas. Não comprova a remoção de sessões pelo Auth real nem o transporte PostgREST. A 006 ainda não foi aplicada no Supabase real nesta alteração.

## Nomes legíveis das funções (migration 007)

Aplicar `202611100007_readable_account_function_names.sql` depois da 006, de forma coordenada com a atualização da API. As secções anteriores e as migrations 001–006 conservam os nomes históricos.

| Nome anterior | Nome após a 007 |
| --- | --- |
| `public.account_snapshot()` | `public.get_account_portfolios()` |
| `public.account_apply(jsonb,jsonb)` | `public.apply_account_changes(jsonb,jsonb)` |
| `private.account_apply(jsonb,jsonb)` | `private.apply_account_changes(jsonb,jsonb)` |
| `private.account_session_active()` | `private.is_account_session_active()` |

A migration renomeia as funções existentes, preservando OIDs, proprietários, permissões e referências das políticas RLS. Atualiza também as chamadas textuais nos corpos PL/pgSQL; não duplica nem altera a implementação transacional. Mantém parâmetros, valor predefinido de `p_migration`, respostas, códigos SQLSTATE, `SECURITY DEFINER`, `search_path` vazio e volatilidade do helper. Carteiras, revisões, tombstones, recibos, contadores e sessões não são reescritos. O commit notifica o PostgREST para atualizar a cache do esquema.

Os nomes antigos deixam de existir, sem aliases. Consumidores RPC diretos e versões anteriores do servidor precisam de atualização: coordenar a aplicação da 007 e a entrada da API nova, evitando pedidos durante a transição. A aplicação nova requer a 007; a versão antiga requer o esquema anterior. Um rollback só da aplicação é incompatível com a base de dados já renomeada. Os endpoints HTTP `/api/account` e os respetivos contratos mantêm-se.

A verificação local compara dados, snapshots, OIDs, ACLs, proprietários, argumentos, atributos e políticas antes/depois do upgrade; toda a suite SQL passa a usar os novos nomes. A 007 está preparada no repositório, sem aplicação ou validação no Supabase real.
