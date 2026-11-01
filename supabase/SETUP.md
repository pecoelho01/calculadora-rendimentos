# Configuração externa — 30 de outubro de 2026

## Correções de segurança — migration aplicada, deploy pendente

A revisão do HEAD `569481d766fda927484ad50470e8cecc3c35c638` identificou aceitação de sessões implícitas por URL, concorrência de pedidos Auth e crescimento ilimitado de recibos/tombstones. A correção local passa a usar troca explícita PKCE vinculada ao navegador, rejeita/limpa ligações com tokens e serializa mutações Auth entre separadores com Web Locks. A confirmação e a recuperação exigem agora o navegador e a origem onde o pedido começou; ligações implícitas antigas têm de ser renovadas. Os redirects exatos existentes (`/` e `/?recovery=1`) mantêm-se, sem necessidade de wildcards.

**A migration `202610310004_account_resource_limits.sql` foi aplicada e registada no Supabase real em 1 de novembro de 2026**, após confirmar o histórico 001/002/003. Preserva revisões, recibos e dados existentes; acrescenta quotas de metadados e limite transacional de escritas confirmadas, conforme [CONTRACT.md](CONTRACT.md). O deploy da aplicação e a validação integrada continuam pendentes.

Durante a implementação local não foram alteradas configurações externas, criadas contas de teste, enviados emails nem feito deploy. A aplicação posterior da migration 004 está registada no final deste ficheiro. Os testes locais com mocks/PGlite não comprovam o fluxo integrado Vercel/Auth/SMTP. Antes de aceitar dados reais, validar no ambiente pretendido o registo/confirmar email/login/recuperação/alteração da palavra-passe/logout, renovação/expiração de sessão e isolamento entre utilizadores. Confirmar também os redirects exatos, política de palavras-passe/reautenticação, duração dos JWTs, respostas de enumeração da API Auth direta e limites de registos, login, recuperação e SMTP. Preview deve continuar separado da base de produção e sem conta enquanto não tiver configuração própria.

Os registos abaixo são históricos; não representam uma revalidação destas configurações na versão corrigida.

Validação da primeira correção de segurança, anterior aos ajustes finais do Copilot, em Node.js 24.22.2: `npm ci` e arranque de `npm run dev` concluídos; entrada HTTP 200 e API sem sessão HTTP 401 verificadas. Passaram 37 testes unitários, typecheck, lint, build e o harness SQL/PGlite com as quatro migrations (quotas, upgrade, rollback, isolamento, 60/61 escritas e API no limite de 3 MB). A suite Playwright completa com Auth/API/mercado simulados passou com 105 testes e 3 ignorados (dois exigem build sem configuração e um é exclusivo de desktop). Inclui confirmação/recuperação PKCE com verificação do challenge no mock, ligações não solicitadas com/sem sessão anterior, verifier ausente/incorreto, callbacks repetidos, pedidos retidos, concorrência entre separadores e vínculo do formulário de recuperação à sessão que completou a troca. Os headers foram verificados por HTTP. A revisão independente de Auth encontrou uma race adicional entre a troca PKCE e a leitura da sessão, corrigida com comparação do token da sessão e coberta por teste; a revisão SQL não encontrou bloqueios adicionais. `npm audit --omit=dev` não reportou advisories; permanecem 16 entradas moderadas na cadeia de desenvolvimento ESLint/minimatch, sem alteração de dependências nesta correção.

## Recursos configurados

- Supabase: projeto `calculadora-rendimentos` (`bfwetxarkuukaokfllud`), organização Vercel Marketplace `pecoelho01's projects`, região `eu-north-1`.
- Antes das alterações: projeto saudável, sem tabelas da aplicação, funções `account_*`, migrations ou utilizadores Auth. O projeto MetroLiveTime não foi alterado.
- Migrations aplicadas e registadas: `202610300001`, `202610300002`, `202610300003` (31 de outubro) e `202610310004` (1 de novembro). Tabelas com RLS, leitura limitada ao proprietário, escritas diretas revogadas e RPCs disponíveis apenas a `authenticated`; o contador privado da 004 não tem acesso direto pelos papéis cliente.
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

## Correção do botão na conta vazia — 31 de outubro de 2026

Sem carteira selecionada, a ação do estado vazio mostra «Criar carteira» e abre o respetivo diálogo; só passa a «Adicionar transação» depois da criação. O aviso de conta vazia adapta o texto e o botão a ecrãs pequenos, sem sobreposição.

Validação local com Node.js 24: 33 testes unitários, typecheck, lint e build passaram. Playwright com Auth/API/mercado mockados: 69 aprovados e 3 ignorados. Os testes verificam a criação pelo botão do estado vazio, a gravação da primeira transação e o percurso após eliminar a última carteira/recarregar, em desktop e telemóvel; capturas e ausência de sobreposição foram verificadas. O build final foi reposto com `.env.local`; esta alteração de UI não foi testada com Auth real nem num deploy Vercel.

## Integração com o tema claro/escuro — 31 de outubro de 2026

A branch de destino foi integrada preservando o seletor de tema e a distinção «Dados na conta»/«Dados locais» no cabeçalho. O ecrã de entrada e os controlos da conta usam as cores do tema; o seletor também está disponível antes do login. Os testes de tema e o teste de ganhos provenientes da branch base foram adaptados à escolha explícita do modo local.

Validação Node.js 24: `npm ci`, `npm run dev`, 37 testes unitários, typecheck, lint e build passaram. Playwright com configuração Supabase fictícia: 81 aprovados e 3 ignorados; os dois casos de integração de tema foram repetidos após acrescentar a captura e a verificação de largura da entrada. Verificados entrada, login, modo local, logout, preferências de tema, impressão clara e capturas de computador/telemóvel. Auth/API/mercado são mocks; esta revisão de UI não foi testada com Auth real nem num deploy Vercel. O build final foi reposto com `.env.local`.

## Aplicação da migration 004 no Supabase real — 1 de novembro de 2026

A pedido do utilizador, `202610310004_account_resource_limits.sql` foi aplicada pela Management API no projeto `calculadora-rendimentos` (`bfwetxarkuukaokfllud`), confirmado como saudável. O histórico continha 001/002/003; a versão 004 e os seus objetos novos estavam ausentes. Foi usado um access token pessoal recebido por cartão privado, sem o emitir em outputs ou guardar no repositório; o ficheiro privado temporário foi removido após o uso.

O DDL e o registo da versão `202610310004`, nome `account_resource_limits`, foram executados numa única transação, com timeout de lock de 5 segundos e de instrução de 30 segundos. Um lock de leitura nas tabelas da aplicação protegeu a comparação dos totais e hashes agregados antes/depois. A comparação confirmou carteiras e recibos inalterados antes do commit; não foram criados utilizadores nem executadas gravações de carteiras para testar a aplicação.

Verificações após commit:

- SQL registado com SHA256 `5d09fa3deb8b8f6ae5c7511117a06efd62cb16186b31efc8bfb25056524a7ad9`, igual ao ficheiro local.
- Corpos de `public.account_apply` e `private.account_check_write_rate` iguais aos do repositório, ambos com `search_path` fixo.
- `account_apply` mantém `SECURITY DEFINER` e execução por `authenticated`, sem execução por `anon` ou `PUBLIC`.
- Helper privado sem execução por `authenticated`, `anon` ou `PUBLIC`.
- Contador privado com RLS, chave primária, FK para `auth.users` com cascade e sem permissões diretas de SELECT/INSERT/UPDATE/DELETE para os papéis cliente.

Esta aplicação confirma o esquema e as permissões no serviço real. Os testes funcionais de quotas/60 escritas, rollback e isolamento continuam a ser os testes locais PGlite já documentados; não foram repetidos com sessões reais. Não houve alteração de Auth/SMTP, commit, push, merge ou deploy. A UI corrigida e o percurso integrado Vercel/Auth/SMTP continuam pendentes de validação externa.


## Correções dos comentários Copilot — 1 de novembro de 2026

Os dois comentários novos sobre o HEAD `0d4365e` foram corrigidos. A limpeza dos parâmetros Auth na URL é executada mesmo sem configuração Supabase ou quando a URL configurada é rejeitada, preservando parâmetros não relacionados e o modo local, sem pedidos Auth. O resultado continua coalescido entre efeitos React para não perder o erro nem consumir códigos duas vezes.

A recuperação guarda agora o par `user.id`/`session_id` até terminar ou ser abandonada. Uma renovação de token da mesma sessão conserva o formulário e os dados introduzidos; mudar de sessão, perder um identificador válido ou sair invalida o vínculo. A sessão e a ref são verificadas novamente, depois de `getSession()`, dentro do Web Lock e antes de `updateUser`. A comparação exata entre o evento de recuperação e a sessão devolvida pela troca PKCE mantém-se. A extração do identificador no JWT é apenas contexto da interface; o Supabase continua a autenticar e autorizar os pedidos.

Validação Node.js 24.22.2: `npm ci`, arranque de desenvolvimento (entrada 200/API sem sessão 401), 40 testes unitários, typecheck, lint e builds passaram. E2E com configuração fictícia: 113 aprovados e 11 ignorados (10 exigem build sem configuração válida; um é exclusivo de desktop). Os 10 casos de configuração foram executados separadamente e passaram com variáveis vazias e novamente com uma URL HTTP remota rejeitada, em computador e telemóvel. Os novos testes verificam refresh na mesma sessão, nova sessão do mesmo utilizador, SID inválido, submissão antes de chegar o evento de mudança e remoção de tokens/código/erro da URL sem pedidos Auth. A revisão independente do diff não encontrou bloqueios adicionais.

Não foram alteradas migrations, dependências ou configurações externas. A migration 004 aplicada mantém o mesmo checksum. Não se repetiu o harness SQL nesta correção de Auth (foi executado na análise imediatamente anterior, no mesmo SQL); a validação integrada Vercel/Auth/SMTP continua pendente. O build final foi reposto com `.env.local`.
