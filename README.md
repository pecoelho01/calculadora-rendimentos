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
- Custo médio móvel, ganhos realizados/não realizados, valor das posições e ROI sobre todas as compras.
- Preços e histórico Yahoo Finance no servidor, com cache de cinco minutos e indicação de timestamp/indisponibilidade.
- Evolução semanal do ROI e comparação com o S&P 500, usando observações até à data de avaliação.
- Tabela de posições abertas e fechadas, pesquisa e alocação por valor de mercado.
- Importação/exportação de CSV compatível com a aplicação anterior.
- Persistência local no navegador e cópia de segurança/restauro de todas as carteiras em JSON.
- Relatório por impressão: «Relatório PDF» → «Guardar como PDF» no navegador.
- Layout responsivo e notas com as fórmulas e limitações.

A aplicação inicia vazia. «Explorar uma carteira de exemplo» cria uma carteira USD com transações fictícias, mas procura preços reais; não apresenta cotações simuladas.

## Dados e privacidade

As carteiras são guardadas em `localStorage`, sem conta ou sincronização. Limpar os dados do navegador remove-as; exportar uma cópia JSON regularmente. A importação CSV acrescenta transações à carteira selecionada; importar o mesmo ficheiro duas vezes duplica as transações. O restauro JSON substitui todas as carteiras após confirmação.

Os tickers e a primeira data da carteira são enviados ao endpoint de mercado e ao Yahoo Finance. Quantidades, preços de compra e nomes das carteiras ficam no navegador. A cache do servidor contém apenas dados públicos de mercado. O armazenamento local não é cifrado e é partilhado pelos separadores da mesma origem; uma gravação deteta alterações feitas noutro separador, carrega a versão mais recente e pede para repetir a operação.

## CSV

| Coluna | Obrigatória | Descrição |
|---|---|---|
| `date` | Sim | Data ISO `YYYY-MM-DD`, entre 2000-01-01 e hoje |
| `ticker` | Sim | Símbolo Yahoo Finance, por exemplo `SXR8.DE` ou `AAPL` |
| `name` | Não | Nome do ativo |
| `pricebuy` | Sim | Preço por unidade na moeda da carteira; nas vendas, preço de venda |
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

As compras atualizam o custo médio ponderado das unidades abertas; as vendas realizam `(preço de venda − custo médio) × quantidade`. Vendas superiores à posição são rejeitadas. Após fecho total, uma nova compra inicia um novo custo médio.

`Ganho total = ganho realizado + ganho não realizado`.

`ROI = ganho total ÷ total de todas as compras × 100`.

No histórico, `ROI = (valor aberto + receitas das vendas − compras acumuladas) ÷ compras acumuladas × 100` (equivalente à fórmula do ganho). O gráfico amostra o último dia de negociação de cada semana disponível no benchmark. As datas de mercado são normalizadas no fuso da respetiva bolsa. Nunca seleciona preços futuros; sem preços anteriores, deixa uma lacuna. O S&P 500 usa o primeiro fecho disponível desde a primeira transação, em USD; filtrar um período não altera a base das séries.

Esta versão não faz conversão cambial. Todos os preços de transação de uma carteira devem ser introduzidos na moeda escolhida. Uma cotação aberta noutra moeda ou ausente impede valor, ganho não realizado e ROI globais; os custos e ganhos já realizados continuam disponíveis. Carteiras totalmente fechadas dispensam cotações. Zero é um preço válido, distinto de indisponibilidade.

Sem comissões, impostos, dividendos ou ajustes automáticos das quantidades por splits. O histórico Yahoo pode ser ajustado por splits; adaptar também as transações nesses casos. O ROI não é anualizado, TWR ou XIRR. O benchmark não replica os fluxos da carteira.

`yahoo-finance2` é uma integração não oficial e pode sofrer bloqueios, rate limits e atrasos. Falhas não são substituídas por preços fictícios. O cache de cinco minutos pode fazer com que «Atualizar preços» devolva o mesmo valor nesse intervalo.

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
