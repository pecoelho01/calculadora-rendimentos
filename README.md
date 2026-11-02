# Rendimentos

Gestão de carteiras em **Next.js + React + TypeScript**, preparada para **Vercel**. Interface em português inspirada na organização de portfólios do Yahoo Finance, com dados de mercado obtidos no servidor.

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

Não são necessárias chaves de API nem variáveis de ambiente nesta versão.

## Funcionalidades

- Várias carteiras, com moeda EUR, USD ou GBP por carteira.
- Compras e vendas manuais, histórico de transações e remoção com validação da posição disponível.
- Custo FIFO por lotes, ganhos realizados/não realizados, valor das posições, ROI sobre todas as compras e rentabilidade das posições abertas.
- Preços e histórico Yahoo Finance no servidor, com cache de cinco minutos e indicação de timestamp/indisponibilidade.
- Gráfico interativo com toggle «Rentabilidade total» / «Posições abertas» (predefinição), percentagem atual, consulta por rato, toque ou teclado (setas, Home e End) e comparação com o S&P 500. O histórico semanal pode diferir da cotação atual.
- Tabela de posições abertas e fechadas, pesquisa e alocação por valor de mercado.
- Gráfico circular de distribuição dos ETFs exclusivamente por continente, ponderado pelo valor atual, com cobertura, fonte e data da composição. Composição completa da iShares e alternativa justETF, carregadas em separado dos preços; ativos sem dados permanecem «Sem classificação».
- Importação/exportação de CSV compatível com a aplicação anterior.
- Persistência local no navegador e cópia de segurança/restauro de todas as carteiras em JSON.
- Relatório por impressão: «Relatório PDF» → «Guardar como PDF» no navegador.
- Layout responsivo e notas com as fórmulas e limitações.
- Botão de sol/lua para alternar entre tema claro e escuro, com preferência guardada neste navegador. Até à primeira escolha, acompanha o tema do sistema. A impressão mantém o tema claro.
- Sidebar recolhível e ajustável no desktop por arrasto ou pelas setas, Home e End ao focar a borda direita; no telemóvel ocupa a largura disponível.
- Renomeação de carteiras pelo botão direito, Shift+F10 ou botão de edição, preservando transações e moeda. A largura e abertura da sidebar mantêm-se durante a sessão da página.

A aplicação inicia vazia. «Explorar uma carteira de exemplo» cria uma carteira USD com transações fictícias, mas procura preços reais; não apresenta cotações simuladas.

## Dados e privacidade

As carteiras são guardadas em `localStorage`, sem conta ou sincronização. Limpar os dados do navegador remove-as; exportar uma cópia JSON regularmente. A importação CSV acrescenta transações à carteira selecionada; importar o mesmo ficheiro duas vezes duplica as transações. O restauro JSON substitui todas as carteiras após confirmação.

Os tickers e a primeira data da carteira são enviados ao endpoint de mercado e ao Yahoo Finance. Para a composição geográfica, o servidor pesquisa também o símbolo público do ETF no justETF e consulta catálogos e ficheiros públicos da iShares; nenhuma quantidade, preço de compra ou carteira é enviada a essas fontes. Quantidades, preços de compra e nomes das carteiras ficam no navegador. A cache do servidor contém apenas dados públicos de mercado. O armazenamento local não é cifrado e é partilhado pelos separadores da mesma origem; uma gravação deteta alterações feitas noutro separador, carrega a versão mais recente e pede para repetir a operação.

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

O toggle muda a série, a percentagem em destaque e os valores consultados no gráfico. Os períodos 3M, 6M, 1A e YTD recalculam a rentabilidade do intervalo; «Máximo» mantém o cálculo desde a primeira compra. YTD começa em 1 de janeiro do ano atual. Os meses usam datas UTC e o último dia válido do mês de destino. «Posições abertas» considera as posições que estavam abertas em cada data, incluindo ativos que tenham sido vendidos posteriormente. Sem posições abertas ou com custo aberto zero, esta percentagem é indisponível, não zero. Uma cotação válida a zero, com custo positivo, representa −100%. Vendas podem alterar a rentabilidade das posições abertas mesmo sem alteração dos preços de mercado.

A adoção de FIFO substitui o custo médio móvel das versões anteriores e recalcula ganhos realizados/não realizados e custo das posições. O ganho total e o ROI sobre todas as compras mantêm-se para as mesmas ordens e cotações. Não há migração do JSON/localStorage ou do CSV: estes formatos guardam as transações originais, não os resultados derivados.

Em «Máximo», no histórico, `ROI = (valor aberto + receitas das vendas − compras acumuladas) ÷ compras acumuladas × 100` (equivalente à fórmula do ganho). Para cada período, a série e a percentagem em destaque usam a mesma lógica partilhada. O gráfico amostra o último dia de negociação de cada semana disponível no benchmark. As datas de mercado são normalizadas no fuso da respetiva bolsa. Nunca seleciona preços futuros; sem preços anteriores, deixa uma lacuna. Em «Máximo», o S&P 500 usa o primeiro fecho disponível desde a primeira transação, em USD.

Nos outros períodos, a base das posições existentes é o valor no dia anterior ao início, usando apenas preços já disponíveis nessa data. Ordens na data inicial pertencem ao período. Se a carteira começar depois do início solicitado, o intervalo efetivo começa na primeira transação. O benchmark usa o último fecho disponível antes desse início efetivo; sem esse preço, fica indisponível, sem procurar uma observação futura.

`Retorno total do período = (valor final + vendas do intervalo − compras do intervalo − valor inicial) ÷ (valor inicial + compras do intervalo) × 100`.

Para posições abertas, os lotes FIFO ainda detidos são avaliados desde o preço inicial (lotes anteriores ao intervalo) ou desde o seu preço de aquisição (novas compras). O retorno é o ganho dessas unidades dividido pela respetiva base. Lotes vendidos são excluídos dessa métrica; vendas podem mudar a composição e a percentagem.

Sem capital inicial nem compras no intervalo, o retorno do período é indisponível. Se faltar um preço inicial necessário, a métrica fica indisponível: nunca se usa custo de compra ou um preço futuro como substituto. No modo aberto só é exigido o preço inicial dos lotes antigos ainda detidos. Um preço zero é válido; uma base nula ou zero não permite calcular a percentagem.

A série, o hover e o valor em destaque usam a mesma base do período. O ponto final «Atual» usa a cotação atual; os outros pontos usam fechos históricos semanais. Este retorno é simples: as compras entram integralmente na base, independentemente da sua data. Não é TWR nem XIRR e o índice não simula os fluxos da carteira.

Esta versão não faz conversão cambial. Todos os preços de transação de uma carteira devem ser introduzidos na moeda escolhida. Uma cotação aberta noutra moeda ou ausente impede valor, ganho não realizado e ROI globais; os custos e ganhos já realizados continuam disponíveis. Carteiras totalmente fechadas dispensam cotações. Zero é um preço válido, distinto de indisponibilidade.

Sem comissões, impostos, dividendos ou ajustes automáticos das quantidades por splits. O histórico Yahoo pode ser ajustado por splits; adaptar também as transações nesses casos. O ROI não é anualizado, TWR ou XIRR. O benchmark não replica os fluxos da carteira.

`yahoo-finance2` é uma integração não oficial e pode sofrer bloqueios, rate limits e atrasos. Falhas não são substituídas por preços fictícios. O cache de cinco minutos pode fazer com que «Atualizar preços» devolva o mesmo valor nesse intervalo.

## Distribuição geográfica

O gráfico soma `valor atual da posição × peso do país no ETF` e agrupa esses valores por continente, usando apenas posições abertas e as mesmas cotações e regras de moeda do dashboard. A interface e a impressão mostram apenas continentes e «Sem classificação», sem lista ou seletor de países. O agrupamento é local e não acrescenta pedidos externos. Sem uma cotação necessária, não apresenta percentagens parciais como se fossem a carteira completa. Um preço zero continua válido.

As cotações e o histórico usam `/api/market`; a composição usa `/api/geography`, que recebe apenas tickers. Os pedidos são independentes: métricas e posições não esperam pelos ficheiros geográficos. A geografia só é pedida na visão geral, para posições abertas; posições fechadas e benchmark não entram nesse pedido. Durante a obtenção inicial, o gráfico mostra carregamento em vez de uma falsa cobertura de 0%.

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
4. Não são necessárias variáveis de ambiente nem base de dados. O endpoint `/api/market` usa Node.js no servidor; não configurar como exportação estática.
5. Publicar primeiro um preview, verificar transações, importação e cotações reais nesse ambiente; depois promover para produção e associar o domínio em **Settings → Domains**.

O Next.js tem suporte nativo na [Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs). Não é preciso `vercel.json` para os defaults desta aplicação. Os testes devem passar antes de publicar; a integração Git faz deploy em cada push, pelo que convém configurar checks obrigatórios.

O código está preparado para deploy; não liga automaticamente uma conta Vercel, não publica nem altera o domínio existente. A versão Streamlit não é desligada por esta migração. Dados locais não são transferidos entre domínios; usar exportação/restauro JSON para mudar de origem.

## Estrutura

```text
src/app/                     # App Router, layout e estilos
src/app/api/market/route.ts   # Endpoint de mercado com validação e limites
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
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

O Playwright inicia `next start` depois do build e testa desktop/móvel, persistência, CSV, carteiras, falhas de dados e relatório. Os dados de mercado dos testes de UI são controlados para resultados determinísticos; não validam a disponibilidade real do Yahoo nem o comportamento de uma conta Vercel.
