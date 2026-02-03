# 📈 Calculadora de Rendimentos

Aplicação web em **Streamlit** que calcula ganhos e ROI de ativos usando preços em tempo real do **Yahoo Finance** (`yfinance`). Permite inserir vários ativos manualmente ou importar uma folha CSV.

### 🔗 App online
**[https://calculadora-rendimentos.streamlit.app/](https://calculadora-rendimentos.streamlit.app/)**

---

## 🔍 Como funciona
- **Modo manual**: escolha o número de ordens, preencha Ticker, Quantidade, Preço de compra e Data. Há uma lista rápida de ETFs/índices e a opção “Outro ativo (digite...)”.
- **Modo CSV**: faça download do modelo (`modelo_site_ativos.csv`), preencha as colunas `date`, `ticker`, `pricebuy`, `shares` e faça upload. Valores com vírgula são normalizados para ponto.
- **Preços em tempo real**: `logic.process_ticket` obtém `fast_info['last_price']` de cada ticker no Yahoo Finance e calcula ganho absoluto e ROI (%).
- **Resultados**: tabela resumida no modo manual; no modo CSV inclui também gráfico de barras comparando ROI por ativo/data.

## 🚀 Executar localmente
```bash
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos
pip install -r requirements.txt
streamlit run app.py
```

## 📂 Estrutura
- `app.py`: interface Streamlit com modos Manual e CSV.
- `logic.py`: funções de cálculo (`process_ticket`) e utilitário para download/upload do modelo CSV (`csv_download_import`).
- `modelo_site_ativos.csv`: modelo de cabeçalho para importação (colunas: `date,ticker,pricebuy,shares`).
- `requirements.txt`: dependências da aplicação.
- `components.py`: reservado (vazio atualmente).

## 🧰 Dependências
- streamlit
- yfinance
- pandas

## ⚠️ Notas e limitações
- Necessita de ligação à internet para obter preços do Yahoo Finance.
- Os tickers devem existir no Yahoo; em caso contrário a app mostra erro por ordem.
- A data serve apenas para referência visual; não altera os cálculos.
- Preço atual usa `fast_info['last_price']`, podendo variar intradiariamente.
