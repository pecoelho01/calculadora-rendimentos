# Configuração externa — 30 de outubro de 2026

## Recursos configurados

- Supabase: projeto `calculadora-rendimentos` (`bfwetxarkuukaokfllud`), organização Vercel Marketplace `pecoelho01's projects`, região `eu-north-1`.
- Antes das alterações: projeto saudável, sem tabelas da aplicação, funções `account_*`, migrations ou utilizadores Auth. O projeto MetroLiveTime não foi alterado.
- Migrations aplicadas e registadas com as versões locais `202610300001` e `202610300002`; `202610300003` aplicada e verificada em 31 de outubro, conforme o registo final abaixo. Tabelas com RLS, leitura limitada ao proprietário, escritas diretas revogadas e RPCs disponíveis apenas a `authenticated`.
- Auth: email/password e registo ativos, confirmação de email obrigatória, início de sessão sem confirmação desativado e palavra-passe mínima de 8 caracteres.
- Site URL: `https://calculadora-rendimentos.vercel.app`.
- Redirects exatos: `https://calculadora-rendimentos.vercel.app/`, `https://calculadora-rendimentos.vercel.app/?recovery=1`, `http://localhost:3000/` e `http://localhost:3000/?recovery=1`.
- `.env.local` ignorado pelo Git: apenas URL e publishable key públicas do Supabase.
- Vercel: projeto `calculadora-rendimentos` (`prj_jE9IBVL0DJRPQFalxxMn1oGb33Ja`), equipa `pecoelho01s-projects`. As duas variáveis públicas foram definidas em `production` e `development`. `preview` fica sem configuração de conta até existir uma base separada e redirects próprios.
- Chaves JWT legadas `anon`/`service_role` desativadas. A aplicação usa a publishable key e o JWT do utilizador. Uma resposta da Management API devolveu a chave administrativa legada apesar de `reveal=false` e apareceu na saída da ferramenta; a desativação invalidou essas chaves. Não foram colocadas credenciais administrativas na aplicação ou na Vercel.
- Nenhum commit, push, PR ou deploy foi efetuado. As variáveis só entram no cliente Vercel num próximo build autorizado.

## Validação com Supabase real

Executada a partir da API Next.js local com Node.js 24.22.2 e o projeto Supabase acima, sem mocks de Auth/Data API:

- Início de sessão por palavra-passe com dois utilizadores fictícios e verificação de identidade por `getUser`.
- Snapshot privado por `/api/account`, `Cache-Control: private, no-store` e rejeição de Bearer inválido.
- Gravação de carteira com compra e venda fictícias; isolamento pela API e por consultas diretas à Data API com o JWT do segundo utilizador.
- Escritas diretas à tabela e RPC anónima bloqueadas.
- Atualização por revisão, rejeição de revisão antiga com HTTP 409 e rollback de um lote com uma alteração válida anterior ao conflito.
- Importação local repetida sem duplicação e recibos privados sob RLS.
- Ligação de recuperação gerada administrativamente, troca do token, alteração de palavra-passe e início de sessão com a nova palavra-passe. Não houve envio de email nesse teste.

Os testes usaram acesso administrativo apenas para criar/confirmar utilizadores fictícios, gerar a ligação de recuperação e remover esses mesmos utilizadores. Os pedidos da aplicação usaram exclusivamente a chave pública e JWTs dos utilizadores. No fim, a limpeza confirmou zero utilizadores, carteiras e recibos.

O primeiro teste real detetou que conflitos com SQLSTATE `40001` eram repetidos pelo PostgREST até ao timeout da API. A migration `202610300002_account_conflicts.sql` passou a usar `PT409`; o teste real de conflito e atomicidade passou após a correção. O harness PGlite executa agora todas as migrations por ordem.

Registo histórico da fase de correção dos conflitos, anterior ao novo ecrã de entrada e à ampliação dos testes: `npm test` (31 testes), `npm run typecheck`, `npm run lint` e o harness SQL/PGlite passaram. Após instalar Chromium com `npx playwright install chromium`, o build com URL/chave fictícias e `TEST_ACCOUNT_AUTH=1 npm run test:e2e` passou com 57 testes e 1 skip (dimensionamento desktop da sidebar, omitido no telemóvel). Estes testes de browser usam Auth e mercado mockados. Os resultados desta fase (57 aprovados e 1 ignorado) foram sucedidos pelos 65 aprovados e 3 ignorados registados na secção «Ecrã de entrada e validação final»; não representam a suite atual.

O build final foi reposto com a configuração Supabase real de `.env.local` e passou. Confirmou-se nos bundles do cliente a presença da URL real e a ausência da URL fictícia usada pelo Playwright.

## SMTP configurado e entrega validada

Em 30 de outubro de 2026, após verificar que não existia SMTP personalizado nem integração de email na equipa Vercel, o utilizador escolheu criar um Gmail dedicado, sem contratar um serviço ou comprar domínio.

- Remetente e utilizador SMTP: `calculadoraderendimentos@gmail.com`, nome «Calculadora de Rendimentos».
- Servidor: `smtp.gmail.com`, porta `465` com TLS. Autenticação SMTP real aceite antes da configuração.
- Palavra-passe de aplicação Google recebida por cartão privado e configurada no Supabase; não foi guardada no repositório nem nas variáveis públicas da aplicação.
- Limite inicial Supabase: 30 emails/hora. Os limites próprios do Gmail também se aplicam; esta configuração destina-se a testes e utilização inicial reduzida. Consultar os [limites Gmail](https://support.google.com/mail/answer/22839) e a [gestão de palavras-passe de aplicação](https://support.google.com/accounts/answer/185833).
- Assuntos e templates de confirmação/recuperação em português, usando `{{ .ConfirmationURL }}`. Confirmação obrigatória, Site URL e redirects preservados e verificados após o PATCH.

Validação real, sem gerar links administrativamente:

1. Confirmada a ausência de utilizador no endereço de teste autorizado (endereço pessoal omitido deste registo).
2. Registo via Auth API com chave pública e palavra-passe aleatória: HTTP 200, utilizador inicialmente não confirmado e sem sessão.
3. Email de confirmação recebido pelo utilizador. A ligação recebida foi fornecida por cartão privado após a abertura; o redirect de produção e a identidade confirmada foram validados com Auth `/user`.
4. Pedido de recuperação via Auth API: HTTP 200. A ligação recebida por email foi fornecida por cartão privado; confirmou-se o redirect `/?recovery=1` e a identidade da conta de teste.
5. Alteração de palavra-passe pela sessão de recuperação: HTTP 200. Início de sessão com a nova palavra-passe aleatória bem-sucedido.
6. Removida exclusivamente a conta criada neste teste, identificada por ID, email e data de criação. Confirmados zero utilizadores, carteiras e recibos associados a esse ID. O ficheiro temporário de controlo do teste foi removido.

As ligações, sessões e credenciais não foram emitidas nos logs. Estes testes comprovam a entrega e os fluxos reais de Auth para o destinatário autorizado; não comprovam a entrega a todos os fornecedores de email nem a interface de recuperação num deploy novo.

## Pendente de deploy

Não foi validado um deploy Vercel com esta implementação; nenhum foi publicado nesta configuração. A UI da conta tem testes Playwright com Auth mockado, distintos dos testes reais de API/Supabase e de email descritos acima. Nesta fase SMTP foram alteradas apenas configurações externas e documentação; `git diff --check` passou, sem repetir os testes de código anteriores.

## Ecrã de entrada e validação final

A entrada passa a apresentar login, registo e continuação sem sessão. A aplicação aguarda a recuperação Auth antes de montar qualquer dashboard; uma sessão válida abre a conta. Sem sessão, a escolha local é explícita e pode manter-se na mesma aba através de uma preferência em `sessionStorage`. Sair da conta regressa à escolha e limpa essa preferência. O armazenamento das carteiras mantém o formato existente.

Validação local em Node.js 24: `npm ci`, `npm run dev`, 31 testes unitários, typecheck e lint passaram. Playwright com configuração fictícia: 65 testes passaram e 3 foram ignorados (dois casos exigem build sem configuração e um é exclusivo de desktop). Build sem Supabase: 35 testes locais passaram e um foi ignorado por ser exclusivo de desktop. Os dois casos sem configuração também passaram com a flag explícita `TEST_NO_ACCOUNT_CONFIG=1`. Auth/API/mercado destes testes de navegador são mocks; a confirmação de SMTP real acima continua a ser uma verificação separada. O build final foi reposto com `.env.local`; não foi publicado um deploy.

## Revisão do PR — validação atual

Após as correções de transporte Supabase e eliminação da última carteira, a validação local em Node.js 24 passou com `npm ci`, `npm run dev`, `npm test` (33 aprovados), `npm run typecheck`, `npm run lint` e `npm run build`. Com URL/chave públicas fictícias e `TEST_ACCOUNT_AUTH=1 npm run test:e2e`, passaram 69 testes e foram ignorados 3 (dois exigem build sem configuração e um é exclusivo de desktop). Esta é a contagem atual; os resultados de 57/1 e 65/3 acima são registos das fases anteriores.

Os novos testes verificam, em computador e telemóvel, que eliminar a última carteira da conta aguarda confirmação do servidor, mantém a conta vazia após recarregar e permite criar outra carteira sem copiar dados locais. No modo local, eliminar a última carteira mantém uma carteira vazia persistida no navegador. Auth/API/mercado são mockados; não foram repetidos os testes de Supabase real, SMTP ou SQL/PGlite nesta revisão. O build final foi reposto com `.env.local`; não foi feito deploy manual.

## Revisão da idempotência — 31 de outubro de 2026

A migration `202610300003_account_import_idempotency.sql` acrescenta deduplicação por conteúdo calculado no SQL, independente da chave do cliente. Foi validada localmente no harness SQL/PGlite: upgrade de recibo anterior, chaves diferentes com o mesmo conteúdo, reutilização de chave com conteúdo diferente, números com escalas diferentes, propriedade JSON reordenada, repetição após editar/apagar a carteira, isolamento por utilizador e rollback por capacidade. O harness também verifica o limite de 3 MB e a rejeição atómica de um byte adicional, conforme o contrato.

Node.js 24: `npm ci`, `npm run dev`, 33 testes unitários, typecheck, lint e build passaram. Playwright com configuração Supabase fictícia: 69 aprovados e 3 ignorados. Os testes de navegador usam mocks; o harness executa SQL real num PostgreSQL WASM local. O build final foi reposto com `.env.local`. À data desta validação local, a terceira migration ainda não tinha sido aplicada no Supabase real e não foi feito deploy manual. A aplicação posterior está registada na secção seguinte. O comentário sobre o botão de transação na conta vazia não faz parte desta correção.

## Aplicação da migration 003 no Supabase real — 31 de outubro de 2026

A pedido do utilizador, `202610300003_account_import_idempotency.sql` foi aplicada no projeto `calculadora-rendimentos` (`bfwetxarkuukaokfllud`) através do SQL Editor autenticado, depois de confirmar o histórico 001/002 e a ausência da função nova. O DDL e o registo da versão `202610300003`, nome `account_import_idempotency`, foram executados na mesma transação. O checksum do corpo SQL registado corresponde ao ficheiro do PR.

Validação real em PostgreSQL/Supabase: uma transação com utilizador e carteira fictícios confirmou que o mesmo conteúdo com chaves diferentes e escala numérica diferente produz apenas uma carteira; reutilizar a chave com conteúdo diferente foi rejeitado. A transação de teste foi revertida. As contagens de carteiras/recibos e o checksum agregado das carteiras permaneceram iguais aos anteriores ao teste.

Confirmados o índice por conteúdo, a normalização numérica, a execução de `account_apply` apenas para `authenticated` e a função auxiliar sem execução direta para esse papel. A verificação não usou tokens nem enviou emails. Não foi feito deploy da aplicação. A indicação de migration pendente na secção anterior é histórica; a versão 003 está agora aplicada e registada no serviço real.
