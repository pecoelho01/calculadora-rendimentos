# Contrato da conta e migração (v1)

Definido antes da implementação. O formato `Portfolio` e o armazenamento local v1 mantêm-se. A conta é um domínio de persistência separado; nunca faz sincronização implícita com o navegador.

- `GET /api/account`: sessão Bearer verificada com Supabase Auth `getUser`; identidade nunca aceite no corpo. Devolve `{version:1,portfolios:[{portfolio,revision}]}`. Uma conta nova pode ter zero carteiras.
- `POST /api/account`: `{changes:[{id,portfolio,expectedRevision}],migration?}`. `portfolio:null` elimina; revisão `null` apenas cria; revisão inteira positiva atualiza/elimina exclusivamente a versão lida. Apenas diferenças são enviadas. Um conflito aborta todas as alterações com HTTP 409. A resposta é o snapshot confirmado da base de dados.
- Limites: 30 carteiras, 3 MB de dados por conta; limites financeiros/validação partilhados. IDs não vazios até 200 caracteres. Ordens originais em JSONB, sem cálculos derivados; a posição no array desempata datas iguais.
- A RPC serializa mutações por utilizador e aplica o lote numa única transação; a revisão é monotónica por ID, incluindo recriação após remoção. Não há repetição automática de uma escrita com uma revisão mais recente.
- Migração explícita: `changes:[]`, `migration:{key,portfolios}`. `key` é SHA256 hexadecimal do `encodeStorage` das carteiras validadas. A API recalcula a chave; a base de dados associa recibo e conteúdo canónico à identidade autenticada. A terceira migration deduplica também pelo hash do conteúdo calculado no SQL, normalizando a escala numérica e preservando a ordem dos arrays. Repetir o mesmo conteúdo, mesmo com outra chave, devolve sucesso sem inserir carteiras; a nova chave fica associada ao mesmo recibo de conteúdo. Reutilizar a chave com conteúdo diferente falha. Os novos IDs importados derivam do hash de conteúdo da base de dados, num espaço separado; os IDs e recibos anteriores são preservados; nunca é permitido substituir uma carteira existente. Ordens e ordem de registo são preservadas. O recibo e todas as inserções pertencem à mesma transação. O localStorage não é alterado.
- A Data API não pode contornar a integridade: RPC valida estrutura, limites, IDs, números, datas UTC, tickers, precisão e posição cronológica com ordinalidade; escritas diretas revogadas. RLS `auth.uid() = user_id` protege leituras. RPC `SECURITY DEFINER` tem `search_path` fixo, não recebe `user_id` e limita sempre os acessos à identidade da sessão.
- Sem cache de dados privados, sem service-role, sem sessão/carteiras em memória global. Respostas privadas `Cache-Control: no-store`. Erros públicos sanitizados (400/401/409/413/503), sem logs de transações/tokens.
- A UI só considera guardado após confirmação. Mudança de modo/utilizador invalida pedidos pendentes, limpa os dados anteriores e não os grava noutro destino.

## Configuração externa

Aplicar as migrations SQL no projeto Supabase, configurar Auth (email/password, confirmação de email e recuperação), URL do site e redirects permitidos. Definir URL e publishable key nos ambientes Next/Vercel. A implementação e os testes com mocks não comprovam uma integração Supabase real. O [registo de configuração](SETUP.md) distingue a configuração aplicada, a validação real de Auth/SMTP e o deploy ainda pendente.

Os conflitos de negócio usam SQLSTATE `PT409`, traduzido pelo PostgREST em HTTP 409. Não usar `40001`: esse código indica uma falha transitória de serialização e provoca repetições automáticas no PostgREST, podendo impedir a resposta de conflito. A segunda migration corrige os dois conflitos em `account_apply`, sem alterar dados nem revisões. A API também reconhece `40001` para compatibilidade.

## Verificação SQL local sem credenciais

Além de `npm test` (contratos/API com backend injetado), é possível executar a migration num PostgreSQL WASM local através de PGlite, instalado fora das dependências do projeto:

```bash
npm install --prefix /tmp/rendimentos-sql-check @electric-sql/pglite
node supabase/tests/check-migration.mjs /tmp/rendimentos-sql-check/node_modules/@electric-sql/pglite/dist/index.js
```

O harness simula apenas o esquema `auth`, dois utilizadores e os papéis Supabase; executa as funções, grants e políticas SQL reais. Verifica CAS, rollback de lote e recibos, limites, isolamento/RLS, proibição de escrita direta, ordem de transações, vendas excessivas, migração repetida e revisão após apagar/recriar. Inclui limites Unicode/UTF-16, valores não representáveis em JavaScript e arredondamento das quantidades grandes conforme `shareUnits`. Não testa o serviço Supabase Auth real, a Data API HTTP, email/SMTP ou Vercel.

## Correção de idempotência e verificação de tamanho

Aplicar `202610300003_account_import_idempotency.sql` após as duas migrations anteriores. Não altera carteiras, revisões ou IDs existentes. A RPC valida o conteúdo antes de consultar recibos; o lock por utilizador mantém a verificação e a gravação atómicas. A chave SHA256 `encodeStorage` continua a ser verificada pela API; a garantia contra duplicação na Data API passa a depender do conteúdo calculado pela própria base de dados.

Recibos históricos criados pelo cliente normal são compatíveis com a normalização numérica. Um recibo antigo criado diretamente por RPC com escala numérica não canónica é reconhecido pela sua chave e hash original e atualizado ao ser repetido. Como os recibos antigos guardam apenas um hash, não é possível reconstruir retroativamente variantes equivalentes desse conteúdo se a chamada histórica direta usou formatos não canónicos e perdeu a chave original.

O achado de tamanho baseado apenas nos separadores do array não foi reproduzido: o JSONB acrescenta espaços em cada objeto que superam esses separadores. Num teste PGlite com 30 carteiras e 7 363 ordens, 3 000 000 bytes medidos no SQL produziram 2 896 769 bytes no array JSON compacto e passaram `validateAccountSnapshot`. Uma alteração para 3 000 001 bytes foi rejeitada e revertida, mantendo a leitura válida. O limite não foi alterado; esta verificação local não substitui um teste do serviço Supabase real.
