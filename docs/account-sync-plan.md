# Contas e sincronização — plano de implementação

Estado: requisito aprovado; configuração da integração remota pendente de acesso à equipa Vercel. A aplicação atual continua a usar armazenamento local até à conclusão desta etapa.

## Decisão

Usar Supabase Auth e Postgres através da integração Supabase já instalada na equipa Vercel, desde que o projeto e respetivo acesso sejam confirmados. Evita introduzir um segundo fornecedor de autenticação e concentra o isolamento dos dados em políticas RLS no Postgres.

A implementação deve começar após confirmar o projeto Supabase e a configuração real. A autorização da equipa não publica o site, não muda DNS e não autoriza planos pagos.

## Experiência

- Criar conta, iniciar sessão, terminar sessão, confirmar email e recuperar acesso.
- Carregar as carteiras da conta após validar a sessão no servidor; não mostrar dados de outra sessão durante transições.
- A fonte principal passa a ser o Postgres. Sem ligação, não apresentar uma alteração local como guardada na conta.
- Mostrar estado de gravação, erro e conflito. Atualizar os dados ao regressar ao separador e permitir atualização manual.
- Oferecer a importação explícita das carteiras da versão local. Nunca enviar esses dados para uma conta automaticamente nem apagar os originais.

## Contrato de dados

Uma linha de workspace por utilizador: `user_id`, `schema_version`, `revision`, `portfolios` JSONB e `updated_at`.

- O identificador do utilizador vem apenas da sessão validada, nunca do corpo enviado pelo cliente.
- O snapshot mantém o formato financeiro existente para evitar alterações às fórmulas e ao contrato CSV.
- O servidor valida todo o snapshot e os limites antes de qualquer escrita.
- A tabela tem RLS, com acesso restrito a `auth.uid() = user_id` para leitura e escrita.
- A aplicação usa a chave pública com a sessão do utilizador; não usa service-role para ler ou gravar carteiras.
- Uma função transacional compara `baseRevision` e incrementa a revisão apenas numa escrita bem-sucedida. Uma revisão antiga provoca conflito, sem sobrescrever dados.
- A inicialização da primeira linha também deve ser atómica, para dois dispositivos que entrem ao mesmo tempo.

## API e sincronização

`GET /api/portfolios`: sessão obrigatória; devolve snapshot e revisão, sem cache partilhada.

`PUT /api/portfolios`: sessão obrigatória, origem verificada, limite de payload e validação completa. Recebe snapshot e `baseRevision`; devolve a nova revisão. Em conflito, responde `409` e preserva o snapshot remoto. O cliente mantém a edição pendente disponível para exportar e permite carregar a versão remota antes de repetir.

Não prometer sincronização instantânea sem subscrições implementadas. A primeira versão pode atualizar após gravação, ao voltar ao separador e por ação explícita.

## Migração dos dados locais

- Detetar a chave `rendimentos.portfolios.v1` e validar o formato antes de mostrar a opção.
- Pedir uma ação explícita para importar para a conta atual.
- Acrescentar como novas carteiras com novos identificadores e validar o limite total.
- Não substituir carteiras remotas nem apagar o armazenamento local.
- Preservar exportação/restauro JSON e CSV. Restaurar um snapshot completo exige confirmação e controlo de revisão.

## Validação antes de concluir

- Registo, login, senha errada, logout, email/recuperação e sessão expirada com o fornecedor real quando disponível.
- Dois utilizadores: A não lê nem altera dados de B, incluindo chamadas diretas à base/API.
- Dois dispositivos na mesma conta: uma gravação confirmada é visível no outro; duas gravações sobre a mesma revisão não se sobrepõem.
- Falha de rede não mostra sucesso nem perde a edição pendente.
- Importação local explícita preserva os originais; mudança de conta limpa o estado em memória.
- Testes de isolamento e escrita atómica contra Postgres real; mocks de UI identificados separadamente.
- Executar testes financeiros existentes, TypeScript, lint, build e Playwright.

## Configuração de produção

Confirmar projeto Supabase, migrações, políticas RLS, URL do site, redirects de autenticação e configuração de entrega de email. Ligar as variáveis públicas ao projeto Vercel pretendido. Não guardar segredos no repositório nem usar credenciais administrativas no browser. O deploy e a mudança de domínio são passos separados.
