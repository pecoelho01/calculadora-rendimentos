# Rendimentos

Gestão de carteiras em **Next.js + React + TypeScript**, preparada para **Vercel**. Interface em português com linguagem visual inspirada no MetroLiveTime: tons neutros, contornos finos, tipografia monoespaçada nos títulos e valores, e destaque para o valor da carteira. Dados de mercado obtidos no servidor.

## Executar

Usar **Node.js 24 LTS** e npm. O ficheiro `.nvmrc` seleciona essa versão.

```bash
npm ci
npm run dev
```

Abrir http://localhost:3000. Para produção local:

```bash
npm run build
npm start
```

O modo local não requer chaves nem variáveis de ambiente. A conta opcional usa Supabase Auth e Postgres; consultar a configuração abaixo.

## Funcionalidades

- Várias carteiras, com moeda EUR, USD ou GBP por carteira.
- Compras e vendas manuais, histórico de transações e remoção com validação da posição disponível.
- Custo FIFO por lotes, ganhos realizados/não realizados, valor das posições, ROI sobre todas as compras e rentabilidade das posições abertas.
- Preços e histórico Yahoo Finance no servidor, com cache de cinco minutos e indicação de timestamp/indisponibilidade.
- Gráfico interativo com toggle «Rentabilidade total» / «Posições abertas» (predefinição), percentagem atual, consulta por rato, toque ou teclado (setas, Home e End). O histórico pode diferir da cotação atual.
- Tabela de posições abertas e fechadas, pesquisa e alocação por valor de mercado.
- Gráfico circular de distribuição dos ETFs exclusivamente por continente, ponderado pelo valor atual, com cobertura, fonte e data da composição. Composição completa da iShares e alternativa justETF, carregadas em separado dos preços; ativos sem dados permanecem «Sem classificação».
- Importação/exportação de CSV compatível com a aplicação anterior.
- Persistência local no navegador ou, opcionalmente, na conta Supabase, com cópia de segurança/restauro em JSON.
- Registo, início/fim de sessão e recuperação de acesso por email. Cópia explícita das carteiras locais para a conta, sem substituição das remotas.
- Posições com filtros de abertas (predefinição), fechadas e todas; pesquisa combinada e ordenação por valor atual, rentabilidade ou ativo. Detalhes por posição com ganho realizado e data da cotação, e cartões em telemóvel. Nas posições fechadas, o resultado em destaque é o ganho realizado.
- Transações com filtros de todas, compras e vendas; ordenação por data (mais recentes primeiro), ativo ou total. Quantidade e preço agrupados, ganhos identificados por operação e detalhes com remoção. Cartões responsivos e datas em português.
- Relatório por impressão: «Relatório PDF» → «Guardar como PDF» no navegador. As listas de posições e transações respeitam os filtros e as pesquisas atuais, identificam-nos no relatório e incluem os detalhes mesmo quando recolhidos no ecrã. As ações de remoção ficam ocultas na impressão.
- Layout responsivo e notas com as fórmulas e limitações.
- Botão de sol/lua para alternar entre tema claro e escuro, com preferência guardada neste navegador. Até à primeira escolha, acompanha o tema do sistema. A impressão mantém o tema claro.
- Sidebar recolhível e ajustável no desktop por arrasto ou pelas setas, Home e End ao focar a borda direita. No telemóvel, uma barra inferior fixa dá acesso à visão geral, posições e transações; o menu lateral mantém carteiras, notas e conta. A barra respeita a área segura do dispositivo e fica oculta na impressão.
- Renomeação de carteiras pelo botão direito, Shift+F10 ou botão de edição, preservando transações e moeda. A largura e abertura da sidebar mantêm-se durante a sessão da página.

Ao abrir a aplicação sem sessão, escolhe «Iniciar sessão», «Criar conta» ou «Continuar sem sessão». O dashboard só abre depois dessa escolha ou da recuperação de uma sessão válida. A escolha local mantém-se ao recarregar a mesma aba (se o navegador permitir `sessionStorage`); uma nova aba apresenta novamente a entrada. Uma sessão de conta válida abre automaticamente a conta ao recarregar. Terminar sessão regressa ao ecrã de escolha. No modo local sem sessão, a sidebar permite iniciar sessão ou criar conta. Com sessão iniciada, «Definições da conta» abre a página `/conta`, onde podes consultar o email, alternar entre modo local e conta e terminar sessão. A sidebar também permite «Sair da conta» diretamente, mesmo com o modo local ativo.

A aplicação inicia vazia. «Explorar uma carteira de exemplo» cria uma carteira USD com transações fictícias, mas procura preços reais; não apresenta cotações simuladas.

## Dados e privacidade

Podes continuar sem sessão: as carteiras desse modo são guardadas em `localStorage`. Limpar os dados do navegador remove-as; exportar uma cópia JSON regularmente. Na conta, a base de dados Supabase é a fonte de verdade e permite abrir as carteiras noutros dispositivos. Os modos local e conta são separados, incluindo ao sair ou trocar de utilizador; não há sincronização implícita nem fallback de uma gravação remota falhada para o navegador.

A importação CSV acrescenta transações à carteira selecionada; importar o mesmo ficheiro duas vezes duplica as transações. O restauro JSON substitui as carteiras do modo ativo após confirmação. Na conta, o lote inteiro é atómico: se houver conflito numa revisão, nenhuma alteração é aplicada. O aviso pede para recarregar os dados antes de repetir; uma falha de rede pode ter ocorrido depois do commit, pelo que deves recarregar e verificar antes de repetir uma importação CSV.

«Copiar carteiras locais para a conta» pede confirmação, valida os dados e acrescenta cópias sem substituir carteiras remotas. Um recibo por utilizador e SHA256 do snapshot impede duplicar uma cópia idêntica, mesmo após perda da resposta ou noutro dispositivo. Os dados locais são sempre mantidos. Alterar as carteiras locais produz outro snapshot: confirmar uma nova cópia importa novamente o conjunto completo. Não é uma sincronização incremental.

Os tickers e a primeira data da carteira são enviados ao endpoint de mercado e ao Yahoo Finance. Para a composição geográfica, o servidor pesquisa também o símbolo público do ETF no justETF e consulta catálogos e ficheiros públicos da iShares; nenhuma quantidade, preço de compra ou carteira é enviada a essas fontes. Quantidades, preços de compra e nomes das carteiras ficam no navegador no modo local; no modo conta são enviados apenas à API privada da aplicação e ao projeto Supabase configurado, com autenticação. A cache do servidor contém apenas dados públicos de mercado. O armazenamento local não é cifrado e é partilhado pelos separadores da mesma origem; uma gravação deteta alterações feitas noutro separador, carrega a versão mais recente e pede para repetir a operação.

## CSV

| Coluna | Obrigatória | Descrição |
|---|---|---|
| `date` | Sim | Data ISO `YYYY-MM-DD`, entre 2000-01-01 e hoje |
| `ticker` | Sim | Símbolo Yahoo Finance, por exemplo `SXR8.DE` ou `AAPL` |
| `name` | Não | Nome do ativo |
| `pricebuy` | Sim | Preço por unidade estritamente positivo (por exemplo, `0,00001`) na moeda da carteira; nas vendas, preço de venda |
| `shares` | Sim | Quantidade positiva, até 8 casas decimais |
| `type` | Não | `buy` ou `sell`; vazio/omitido assume `buy` |

```csv
date,ticker,name,pricebuy,shares,type
2024-01-10,SXR8.DE,iShares Core S&P 500,60,5,buy
2024-11-01,SXR8.DE,iShares Core S&P 500,75,2,sell
```

Aceita separador de colunas vírgula ou ponto e vírgula, UTF-8 com BOM, aspas escapadas, nomes com vírgulas e decimais com ponto ou vírgula. Em ficheiros separados por vírgulas, colocar decimais com vírgula entre aspas (`"60,50"`). Os exemplos antigos com linhas/colunas vazias iniciais continuam aceites.

- [Modelo](public/modelo_site_ativos.csv) e [exemplo anterior](public/sample_combo.csv).
- Os ficheiros na raiz são mantidos por compatibilidade; atualizar também as cópias em `public/`.
- Importação atómica: se uma transação for inválida ou criar uma venda excessiva na carteira resultante, nenhuma é adicionada.
- Ordens são ordenadas por data; no mesmo dia, mantém-se a ordem de registo/linhas.
- Limites: 30 carteiras, 20 tickers e 5000 transações por carteira; CSV até 2 MB e backups JSON até 10 MB.
- O exemplo anterior mistura USD e EUR. Pode ser importado, mas as cotações incompatíveis impedem os totais. Separar os ativos por carteiras da respetiva moeda.

## Cálculos e limites financeiros

Cada compra cria um lote FIFO. As vendas consomem primeiro as unidades dos lotes mais antigos e realizam `receita da venda − custo FIFO das unidades vendidas`. O custo médio FIFO apresentado é o custo dos lotes restantes dividido pelas unidades abertas. Vendas superiores à posição são rejeitadas; no mesmo dia preserva-se a ordem de registo. Após fecho total, uma nova compra inicia novos lotes.

`Ganho total = ganho realizado + ganho não realizado`.

`Rentabilidade total (ROI) = ganho total ÷ total de todas as compras × 100`.

`Rentabilidade das posições abertas = ganho não realizado ÷ custo FIFO dos lotes abertos × 100`.

As posições apresentam também a percentagem não realizada sobre o custo FIFO aberto e a percentagem realizada sobre o custo FIFO vendido. Nas transações, cada compra mostra o ganho total desse lote: o realizado nas unidades vendidas mais o não realizado das unidades restantes, com percentagem sobre o custo original da compra. Um lote totalmente vendido mantém o seu ganho realizado e aparece como «Lote fechado». Cada venda mostra `receita − custo FIFO consumido` e a percentagem sobre esse custo, mesmo sem cotação atual. Os ganhos das vendas já estão incluídos nos ganhos das compras: são duas vistas do mesmo resultado, que não devem ser somadas. A soma dos ganhos de todas as compras corresponde ao ganho total da carteira. Sem cotação compatível, o ganho de uma compra com unidades abertas fica indisponível; compras totalmente vendidas não exigem cotação. Os preços das transações devem ser superiores a zero; uma cotação de mercado igual a zero continua válida. Nenhum destes ganhos inclui comissões ou impostos.

O toggle muda a série, a percentagem em destaque e os valores consultados no gráfico. Os períodos 1D, 5D, 1M, 6M, YTD e 1A recalculam a rentabilidade do intervalo; «Máximo» mantém o cálculo desde a primeira compra. 1D abrange o dia UTC atual face ao último fecho anterior; 5D abrange cinco dias de calendário, incluindo o atual. Em 1D, usamos observações Yahoo de cinco minutos da sessão regular, com timestamps e horas em UTC. O destaque corresponde à última observação da série, que pode ter atraso face à cotação atual do dashboard. Sem dados intradiários do dia, mostramos indisponibilidade, incluindo em fins de semana; não substituímos a série por fechos diários ou por uma reta desde a meia-noite. Como as transações não têm hora, todas as transações do dia aplicam-se a todas as observações desse dia, pela ordem de registo; a série não identifica o momento exato das execuções. YTD começa em 1 de janeiro do ano atual. Os meses usam datas UTC e o último dia válido do mês de destino. «Posições abertas» considera as posições que estavam abertas em cada data, incluindo ativos que tenham sido vendidos posteriormente. Sem posições abertas ou com custo aberto zero, esta percentagem é indisponível, não zero. Uma cotação válida a zero, com custo positivo, representa −100%. Vendas podem alterar a rentabilidade das posições abertas mesmo sem alteração dos preços de mercado.

A adoção de FIFO substitui o custo médio móvel das versões anteriores e recalcula ganhos realizados/não realizados e custo das posições. O ganho total e o ROI sobre todas as compras mantêm-se para as mesmas ordens e cotações. Não há migração do JSON/localStorage ou do CSV: estes formatos guardam as transações originais, não os resultados derivados.

Em «Máximo», no histórico, `ROI = (valor aberto + receitas das vendas − compras acumuladas) ÷ compras acumuladas × 100` (equivalente à fórmula do ganho). Para cada período, a série e a percentagem em destaque usam a mesma lógica partilhada. O gráfico usa observações intradiárias em 1D e fechos diários em 5D e 1M; nos restantes períodos, amostra o último dia de negociação de cada semana disponível nos históricos dos ativos da carteira. As datas diárias de mercado são normalizadas no fuso da respetiva bolsa. Em 1D, alinhamos os ativos pela última observação intradiária anterior ou igual ao instante avaliado, sem recorrer ao fecho diário ou à cotação atual para preencher dados em falta. Nunca seleciona preços futuros; sem preços anteriores, deixa uma lacuna. Falhas curtas, incluindo barras omitidas, usam a última cotação intradiária válida por até 15 minutos desde a observação original. Esses valores são identificados como estimados na seleção e no destaque. Observações nulas não renovam esse prazo. Após 15 minutos, ou sem qualquer preço válido anterior no dia, a série fica interrompida. Esta regra também se aplica quando as bolsas têm horários diferentes: não prolongamos automaticamente o preço após o fecho de uma delas. A grelha de cinco minutos entre a primeira e a última observação impede ligar falhas longas através de uma reta.

Nos outros períodos, a base das posições existentes é o valor no dia anterior ao início, usando apenas preços já disponíveis nessa data. Ordens na data inicial pertencem ao período. Se a carteira começar depois do início solicitado, o intervalo efetivo começa na primeira transação.

`Retorno total do período = (valor final + vendas do intervalo − compras do intervalo − valor inicial) ÷ (valor inicial + compras do intervalo) × 100`.

Para posições abertas, os lotes FIFO ainda detidos são avaliados desde o preço inicial (lotes anteriores ao intervalo) ou desde o seu preço de aquisição (novas compras). O retorno é o ganho dessas unidades dividido pela respetiva base. Lotes vendidos são excluídos dessa métrica; vendas podem mudar a composição e a percentagem.

Sem capital inicial nem compras no intervalo, o retorno do período é indisponível. Se faltar um preço inicial necessário, a métrica fica indisponível: nunca se usa custo de compra ou um preço futuro como substituto. No modo aberto só é exigido o preço inicial dos lotes antigos ainda detidos. Um preço zero é válido; uma base nula ou zero não permite calcular a percentagem.

A série, o hover e o valor em destaque usam a mesma base do período. O ponto final «Atual» usa a cotação atual; os outros pontos usam fechos históricos. Este retorno é simples: as compras entram integralmente na base, independentemente da sua data. Não é TWR nem XIRR.

Esta versão não faz conversão cambial. Todos os preços de transação de uma carteira devem ser introduzidos na moeda escolhida. Uma cotação aberta noutra moeda ou ausente impede valor, ganho não realizado e ROI globais; os custos e ganhos já realizados continuam disponíveis. Carteiras totalmente fechadas dispensam cotações. Zero é um preço válido, distinto de indisponibilidade.

Sem comissões, impostos, dividendos ou ajustes automáticos das quantidades por splits. O histórico Yahoo pode ser ajustado por splits; adaptar também as transações nesses casos. O ROI não é anualizado, TWR ou XIRR.

`yahoo-finance2` é uma integração não oficial e pode sofrer bloqueios, rate limits e atrasos. Falhas não são substituídas por preços fictícios. O cache de cinco minutos pode fazer com que «Atualizar preços» devolva o mesmo valor nesse intervalo.

## Distribuição geográfica

O gráfico soma `valor atual da posição × peso do país no ETF` e agrupa esses valores por continente, usando apenas posições abertas e as mesmas cotações e regras de moeda do dashboard. A interface e a impressão mostram apenas continentes e «Sem classificação», sem lista ou seletor de países. O agrupamento é local e não acrescenta pedidos externos. Sem uma cotação necessária, não apresenta percentagens parciais como se fossem a carteira completa. Um preço zero continua válido.

As cotações e o histórico usam `/api/market`; a composição usa `/api/geography`, que recebe apenas tickers. Os pedidos são independentes: métricas e posições não esperam pelos ficheiros geográficos. A geografia só é pedida na visão geral, para posições abertas; posições fechadas não entram nesse pedido. Durante a obtenção inicial, o gráfico mostra carregamento em vez de uma falsa cobertura de 0%.

Na sessão da página, composições públicas são reutilizadas por ticker durante 24 horas e indisponibilidades durante cinco minutos. Mudar de aba ou carteira e atualizar preços não repete consultas ainda válidas. Pedidos geográficos em curso podem terminar em segundo plano e alimentar essa cache, sem substituir dados de outra carteira. No servidor, consultas simultâneas do mesmo ticker ou catálogo partilham o mesmo trabalho. O navegador recebe apenas países agregados, fontes e datas; os ficheiros completos são processados no servidor.

A fonte preferencial é a composição completa da iShares, descarregada diretamente da gestora. Para ETFs europeus, o justETF identifica um único ISIN e confirma o ticker na bolsa; esse ISIN é associado ao produto no catálogo oficial da iShares. São reconhecidos os sufixos Yahoo `.DE` (Xetra), `.AS` (Amesterdão), `.L` (Londres), `.PA` (Paris), `.MI` (Milão) e `.SW` (Suíça). Para tickers americanos sem sufixo, a associação é feita diretamente pelo ticker exato no catálogo oficial americano. Não há procura por semelhança de nomes nem dedução pela moeda, bolsa ou domicílio do ETF.

Nos ficheiros iShares, os valores de mercado são reportados na moeda base do fundo. A aplicação verifica os pesos publicados contra o denominador comum (soma dos valores de todas as posições) antes de agregar os ativos por país. Esta verificação evita acumular o arredondamento dos pesos publicados a duas casas decimais e rejeita subconjuntos materialmente incompletos ou valores inconsistentes. A tolerância por posição é de 0,01 pontos percentuais. Não há conversão cambial de carteiras nem uso do preço de compra neste cálculo.

Apenas ações e obrigações com localização e continente reconhecidos são classificadas. O mapa local segue o Unicode CLDR 49, com América do Norte a incluir América Central e Caraíbas, América do Sul separada e Antártida própria. Mantém uma convenção única para localizações transcontinentais (por exemplo, Rússia na Europa e Turquia, Chipre e Cazaquistão na Ásia); os dados e a licença estão identificados em `THIRD_PARTY_NOTICES.md`. Caixa, derivados, fundos subjacentes não analisados e localizações ausentes permanecem sem classificação. Swaps, pesos negativos e exposições incompatíveis com um círculo limitado a 100% impedem o uso desse ficheiro. A localização publicada pela gestora representa a classificação do ativo, não os países onde a empresa obtém receitas. A data, a fonte e o número de posições do ficheiro são apresentados no gráfico e na impressão.

Se não houver composição direta utilizável, os ETFs europeus conservam a alternativa do justETF, com os países e «Outros países» publicados na tabela inicial. Essa alternativa não desagrega o grupo «Outros países»: sem continente identificável, esse peso passa a «Sem classificação» e reduz a cobertura continental. A cobertura exclui todas as parcelas sem classificação; as percentagens usam sempre o valor total da carteira. Ativos não cobertos, pesquisas ambíguas e falhas das fontes permanecem sem classificação. O suporte direto de outras gestoras e a análise recursiva de fundos dentro de fundos ainda não estão implementados.

Estas integrações públicas não oficiais não precisam de chave de API. Os catálogos e as composições válidas têm cache diário. Há uma cache pública adicional de cinco minutos para os resultados geográficos, incluindo indisponibilidade, para evitar repetir downloads que falharam. O resultado de mercado mantém cache de cinco minutos. Cada fonte tem timeout (dez segundos na composição, oito no catálogo) e limite de resposta; os ficheiros iShares são limitados a 8 MB durante a leitura. Uma consulta europeia usa até três pedidos justETF, um catálogo iShares partilhado e um ficheiro de posições; a americana usa o catálogo e o ficheiro. As fontes podem mudar ou bloquear pedidos. Uma falha geográfica não impede cotações Yahoo, nem altera CSV, backups ou persistência.

## Deploy na Vercel

1. Publicar a branch no fornecedor Git e importar o repositório em **Vercel → Add New → Project**.
2. Selecionar a conta/equipa e o projeto pretendidos. Framework: **Next.js**; Root Directory: raiz do repositório.
3. Usar **Node.js 24.x**, Install Command `npm ci` e Build Command `npm run build`. Manter Output Directory automático.
4. Para modo local não são necessárias variáveis nem base de dados. Para ativar contas, seguir a configuração Supabase abaixo e definir as duas variáveis públicas em cada ambiente Vercel antes do build. O endpoint `/api/market` usa Node.js no servidor; não configurar como exportação estática.
5. Publicar primeiro um preview, verificar transações, importação e cotações reais nesse ambiente; depois promover para produção e associar o domínio em **Settings → Domains**.

O Next.js tem suporte nativo na [Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs). Não é preciso `vercel.json` para os defaults desta aplicação. Os testes devem passar antes de publicar; a integração Git faz deploy em cada push, pelo que convém configurar checks obrigatórios.

O código está preparado para deploy; não liga automaticamente uma conta Vercel, não publica nem altera o domínio existente. Os ficheiros Streamlit passam da raiz para `legacy/streamlit/`. Antes do merge para `main`, confirmar a branch e o entrypoint do serviço Streamlit existente: se acompanhar `main` e procurar `app.py` na raiz, a atualização automática pode falhar. A continuidade desse serviço exige configuração externa própria; este PR não a altera. Dados locais não são transferidos entre domínios; usar exportação/restauro JSON para mudar de origem.

## Configurar a conta opcional (Supabase)

O [registo de configuração externa](supabase/SETUP.md) documenta o projeto configurado, as migrations aplicadas, os testes reais e o SMTP configurado com entrega de confirmação e recuperação validada. Não houve deploy desta configuração.

1. Criar um projeto Supabase. Em **Authentication → Providers**, ativar Email/password; manter confirmação de email e configurar a política de palavras-passe (a UI exige pelo menos 8 caracteres). Configurar SMTP para entrega fiável em produção, limites e proteção contra abuso no painel Auth.
2. Aplicar os ficheiros de `supabase/migrations/` pela ordem do nome, usando SQL Editor ou a CLI Supabase (`supabase db push` após ligar o projeto). Rever as tabelas, RLS e permissões após aplicar. O [contrato](supabase/CONTRACT.md) descreve snapshots, revisões, limites e recibos de migração. Não é necessário `service_role`.
3. Copiar `.env.example` para `.env.local`. Definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com a URL e a **publishable key** do projeto (Dashboard → Connect/API Keys). A URL deve usar HTTPS; HTTP só é aceite em loopback (`localhost`, `127.0.0.0/8` ou `[::1]`) para desenvolvimento local. URLs inválidas desativam o modo de conta antes de criar os clientes Supabase. A chave pública identifica o projeto; Auth e RLS autorizam os acessos. Nunca usar uma secret key ou `service_role` numa variável pública.
4. Em **Authentication → URL Configuration**, definir **Site URL** para o domínio de produção e permitir os redirects exatos `https://o-teu-dominio/` e `https://o-teu-dominio/?recovery=1`. Para desenvolvimento, acrescentar `http://localhost:3000/` e `http://localhost:3000/?recovery=1`. Permitir apenas origens de preview controladas, preferencialmente URLs exatos. Os emails de confirmação voltam a `/`; os de recuperação a `/?recovery=1`, onde se define a nova palavra-passe.
5. Na Vercel, definir ambas as variáveis em **Settings → Environment Variables** nos ambientes pretendidos e fazer um novo build. São incorporadas no cliente no build. Usar projetos Supabase separados para testes/preview e produção quando apropriado. Sem ambas as variáveis, só o modo local é apresentado.
6. Verificar com contas de teste distintas: confirmação de email, recuperação, gravação, revisões entre dispositivos, migração repetida e isolamento RLS pela Data API. Os testes com mocks não substituem estes passos. Nenhum projeto, credencial ou deploy é criado automaticamente por este código.

As ligações de confirmação e recuperação usam PKCE: devem ser abertas no mesmo navegador e origem onde foi iniciado o pedido. Abrir noutro dispositivo, limpar o armazenamento ou iniciar outro pedido pode invalidar o anterior; nesse caso, pedir uma nova ligação. Ligações antigas com access/refresh tokens no fragmento são rejeitadas e removidas da URL. O parâmetro `recovery=1` isolado não abre o formulário de palavra-passe. Uma sessão já guardada continua válida ao atualizar a aplicação.

Os parâmetros Auth são removidos da URL mesmo sem configuração Supabase válida, mantendo os parâmetros não relacionados e o acesso ao modo local. O formulário de recuperação fica vinculado ao utilizador e ao `session_id`: renovar o token da mesma sessão é permitido; uma sessão diferente, ausente ou inválida fecha o formulário. Antes de alterar a palavra-passe, a sessão é novamente verificada dentro do lock de mutação. A leitura do identificador no JWT serve apenas para continuidade da interface; a autenticação/autorização continua a ser feita pelo Supabase.

Na entrada dos callbacks (`/`), tokens na query são rejeitados pelo servidor antes de servir a página: resposta 303 sem cache para a mesma página, preservando parâmetros normais e removendo todos os parâmetros Auth, incluindo qualquer código misturado com tokens. Um fragmento de erro genérico substitui o fragmento original e é limpo pelo navegador; não autoriza recuperação nem cria uma sessão. A limpeza da query funciona também sem JavaScript. Códigos PKCE sem tokens continuam no fluxo normal, e tokens apenas no fragmento continuam a ser rejeitados pelo cliente. Este controlo não impede que o pedido inicial chegue à infraestrutura nem elimina logs anteriores; nunca colocar credenciais em URLs.

Os pedidos de registo/login/recuperação/alteração de palavra-passe/logout e a troca do código PKCE são exclusivos entre separadores, através de Web Locks. Durante um pedido, o formulário não pode ser fechado nem reutilizado. Se o navegador não disponibilizar esta API em contexto seguro, os pedidos de conta falham antes de enviar credenciais; o modo local mantém-se disponível.

A recuperação inicial e a renovação da sessão passam pelo mesmo lock, incluindo a persistência dos tokens. O cliente Auth só é criado depois de adquirir esse lock; subscrever eventos não inicia leituras ou renovações autónomas do SDK. A aplicação verifica a sessão a cada 30 segundos enquanto o separador está visível e ao recuperar o foco; se o lock estiver ocupado, adia a verificação. Sem Web Locks, também uma sessão já guardada fica impedida de enviar credenciais de renovação. Uma falha de recuperação é mostrada e permite iniciar sessão novamente ou continuar no modo local. Durante o arranque de um callback PKCE, a sessão antiga não é renovada antes da troca do código, para que um refresh inválido antigo não apague o verifier da ligação válida.

A migration `202610310004_account_resource_limits.sql` tem de ser aplicada antes de disponibilizar esta versão com contas. Além das 30 carteiras ativas e 3 MB, limita cada conta a 1 000 IDs de carteira ao longo da sua vida (incluindo apagadas), 1 000 recibos/chaves de importação e 60 chamadas de escrita confirmadas por janela de 60 segundos, incluindo repetições. O histórico existente é preservado; atingir a quota bloqueia crescimento, sem impedir leitura/alteração de IDs existentes. Os limites e a migração estão detalhados no [contrato](supabase/CONTRACT.md). Estes controlos não substituem limites Auth/infraestrutura para pedidos rejeitados, leituras ou abuso de registos/emails.

A migration `202611020005_account_strict_properties.sql` deve ser aplicada depois da 004 antes de disponibilizar esta versão com contas. Rejeita propriedades desconhecidas em carteiras e transações nas chamadas diretas à RPC, incluindo importações, antes de guardar ou calcular hashes. Não reescreve dados nem recibos existentes. A 005 foi aplicada e verificada no Supabase real em 2 de novembro de 2026; o [registo de aplicação](supabase/SETUP.md) contém a evidência e o [contrato](supabase/CONTRACT.md) documenta as limitações dos registos históricos.

O backend verifica o Bearer token com Auth `getUser`, deriva a identidade da sessão e usa o mesmo JWT para aceder à DB. As RPCs não recebem `user_id`; as tabelas têm RLS e as escritas diretas são revogadas. As respostas da API usam `Cache-Control: no-store`. Guardam-se as transações originais em JSONB, incluindo a ordem do array para desempatar datas iguais; fórmulas e dados de mercado não são persistidos na conta. Não há caches partilhadas de carteiras.

A sessão Auth é persistida pelo SDK Supabase no navegador; terminar sessão fecha imediatamente o espaço da conta e termina a sessão neste navegador. Uma falha é mostrada e permite repetir. O modo local não cifra dados; usar um dispositivo de confiança. Apagar a conta e exportações administrativas não têm interface nesta versão.

Access/refresh tokens ficam acessíveis a JavaScript da mesma origem. Logout revoga a renovação desta sessão; um access token já emitido pode continuar válido na Data API até expirar. Definir uma duração adequada no Auth e validar a política de reautenticação/alteração de palavra-passe antes de utilização real. A aplicação envia headers contra enquadramento, objetos incorporados, alteração da URL base e fuga de referrer. A CSP é parcial e não substitui a prevenção de XSS.

Referências oficiais: [Auth por palavra-passe](https://supabase.com/docs/guides/auth/passwords), [verificação getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [funções Postgres](https://supabase.com/docs/guides/database/functions).

## Estrutura

```text
src/app/                     # App Router, layout e estilos
src/app/api/market/route.ts   # Endpoint de mercado com validação e limites
src/app/api/account/route.ts  # API privada da conta, sessão e gravações atómicas
supabase/                    # Contrato, migrations SQL e políticas RLS
src/components/              # Dashboard, gráfico e diálogo
src/lib/portfolio.ts          # Cálculos puros e reconstrução histórica
src/lib/validation.ts         # Validação de ordens/carteiras
src/lib/csv.ts                # Importação/exportação CSV
src/lib/market.ts             # Adaptador Yahoo, exclusivamente no servidor
src/lib/storage.ts            # Formato local versionado e validação
public/                       # CSV para download
legacy/streamlit/             # Referência Python anterior, fora da aplicação ativa
tests/                        # Testes determinísticos e fluxos Playwright
```

## Validação

```bash
npm test
npm run test:sql
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

O Playwright inicia `next start` depois do build e testa desktop/móvel, persistência, CSV, carteiras, falhas de dados e relatório. Os dados de mercado dos testes de UI são controlados para resultados determinísticos; não validam a disponibilidade real do Yahoo nem o comportamento de uma conta Vercel.

Os testes de conta no Playwright exigem um build com configuração pública fictícia, sem credenciais reais:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://rendimentos-test.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=public-test-key npm run build
TEST_ACCOUNT_AUTH=1 npm run test:e2e
```

Estes testes interceptam Auth e `/api/account`; verificam UI, isolamento do estado e pedidos, sem comprovar a execução real do SQL/RLS ou entrega de emails. Um build sem configuração continua a suportar todos os fluxos locais.

Para verificar a entrada sem Supabase mesmo quando existe `.env.local`, usar um build com as variáveis públicas explicitamente vazias:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build
TEST_NO_ACCOUNT_CONFIG=1 npm run test:e2e -- tests/dashboard.spec.ts
```

Depois dos testes com configuração fictícia ou vazia, executar novamente `npm run build` para repor a configuração local real.

Para testar conjuntamente a API e as migrations num PostgreSQL local em memória, sem credenciais nem dados reais:

```bash
npm ci --ignore-scripts
npm run test:sql
```

O teste usa o handler real da API e SQL real para verificar escrita/leitura no limite de 3 MB, rejeição de um byte adicional e preservação dos dados após a rejeição. Auth e o transporte RPC são injetados; este teste não comprova o fluxo completo numa deployment Vercel.

O PGlite é uma dependência de desenvolvimento com versão exata e lockfile. O job `SQL migrations and isolation` executa a mesma verificação no CI, incluindo migrações, isolamento entre utilizadores, permissões, conflitos e rollback. O argumento opcional com o caminho para outro módulo PGlite continua disponível para verificações locais.

### Manutenção e checks obrigatórios

O Dependabot está configurado para atualizações semanais de npm e GitHub Actions dirigidas à branch predefinida (`main`), sem `target-branch` explícito. Atualizações npm minor/patch são agrupadas por dependências de produção e desenvolvimento; versões major ficam em PRs individuais. As Actions são agrupadas num único PR.

O GitHub só ativa esta configuração quando `.github/dependabot.yml` existe na branch predefinida (`main`). O PR de migração inclui este ficheiro; o serviço só fica ativo depois do merge. A presença apenas na branch T3 não ativa o serviço. O PR draft #25 (`ci/activate-dependabot`) fica redundante após esta migração e deve ser tratado separadamente, sem merge. As atualizações de segurança do Dependabot continuam associadas à branch predefinida.

Os workflows de CI e CodeQL cobrem PRs e pushes para `main` e `t3/migrar-nextjs-vercel-portfolio`. Na proteção de ambas as branches, exigir `Quality, tests and build`, `SQL migrations and isolation`, `Dependency audit`, `CodeQL JavaScript/TypeScript`, `CodeQL` e `SonarCloud Code Analysis`, associados às Apps que os publicam, com a branch atualizada antes do merge. Ativar também a exigência de atualização da branch e aplicar as regras aos administradores. Preservar quaisquer proteções adicionais existentes. A publicação deste PR em draft não autoriza merge, passagem a pronto ou deploy manual.
