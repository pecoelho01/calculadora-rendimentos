# 📈 Calculadora de Rendimentos / Asset Yield Calculator

> 🇵🇹 Português / 🇬🇧 English — scroll for both.  
> Live app: **[https://calculadora-rendimentos.streamlit.app/](https://calculadora-rendimentos.streamlit.app/)**

---

## 🇵🇹 Português
### O que faz
- Calcula **GANHO** e **ROI (%)** com preços em tempo real via Yahoo Finance (`yfinance`).
- Dois modos: **manual** (várias ordens de uma vez) e **CSV** (importação em lote).
- No CSV, botão **“Calcular portfólio”** consolida por ticker e mostra métricas totais (total investido, valor atual, ganho total, ROI total), além de gráficos.
- No manual, mostra tabela de cada ordem com preço atual e ROI individual e permite consolidar com **“Calcular portfólio”** (mesmas métricas totais e gráficos).

### Como usar
1) Instalar e rodar:
```bash
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos
pip install -r requirements.txt
streamlit run app.py
```
2) Abrir `http://localhost:8501`.
3) Escolher o modo:
   - **Calcular ativos manualmente**: definir nº de ordens, preencher Ticker, Quantidade, Preço de compra e Data. Clique “Calcular Todos”; depois, opcionalmente, “Calcular portfólio” para ver resumo consolidado, métricas totais e gráficos.
   - **Importar dados - CSV**: baixar o modelo, preencher e enviar. Clique “Calcular share-to-share” para ver cada ordem ou “Calcular portfólio” para consolidar, ver métricas totais e gráficos.

### Modelo CSV
- Arquivo: `modelo_site_ativos.csv`
- Colunas (cabeçalho na segunda linha): `date,ticker,pricebuy,shares`
- Exemplo rápido (também em `sample_combo.csv`):
```csv
,,,,,
,,date,ticker,pricebuy,shares
,,2024-01-10,SXR8.DE,60,5
,,2024-03-15,SXR8.DE,65,4
,,2024-06-20,SXR8.DE,70,3
,,2024-09-05,SXR8.DE,68,2
,,2024-02-01,TSLA,190,1
,,2024-05-12,TSLA,210,2
,,2024-08-18,AMZN,130,3
```

### Estrutura do projeto
- `app.py`: entrada da app, configura layout wide e direciona para cada fluxo.
- `components.py`: UI em funções `render_manual_calc` e `render_csv_calc` (tabelas, gráficos e formulários).
- `logic.py`: `_to_float`, `process_ticket` (preço atual via `fast_info['last_price']`) e `csv_download_import`.
- `modelo_site_ativos.csv`: template em branco.
- `sample_combo.csv`: dataset de exemplo.
- `requirements.txt`: dependências.

### Limitações / notas
- Requer internet; preços vêm do Yahoo Finance em tempo real.
- Tickers precisam existir no Yahoo Finance; senão, aparece erro na linha.
- Datas são informativas; cálculo usa preço atual, não histórico.
- Preços mudam intradiariamente; recalcule para atualizar.

---

## 🇬🇧 English
### What it does
- Computes **GAIN** and **ROI (%)** using real-time prices from Yahoo Finance (`yfinance`).
- Two modes: **manual** (multiple orders at once) and **CSV** (batch import).
- In CSV mode, **“Calcular portfólio”** groups by ticker and also shows portfolio totals (invested, current value, total gain, total ROI) plus charts.
- Manual mode shows every order with current price and individual ROI and lets you consolidate with **“Calcular portfólio”** (same totals and charts).

### How to run
1) Install and launch:
```bash
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos
pip install -r requirements.txt
streamlit run app.py
```
2) Open `http://localhost:8501`.
3) Pick a mode:
   - **Calcular ativos manualmente (Manual)**: set order count, fill Ticker, Quantity, Buy Price, Date, then click “Calcular Todos”; optionally click “Calcular portfólio” to see consolidated summary, totals, and charts.
   - **Importar dados - CSV**: download the template, fill it, upload it. Click “Calcular share-to-share” for per-order view or “Calcular portfólio” to consolidate, see totals, and view charts.

### CSV template
- File: `modelo_site_ativos.csv`
- Columns (header on the second line): `date,ticker,pricebuy,shares`
- Quick example (also saved as `sample_combo.csv`):
```csv
,,,,,
,,date,ticker,pricebuy,shares
,,2024-01-10,SXR8.DE,60,5
,,2024-03-15,SXR8.DE,65,4
,,2024-06-20,SXR8.DE,70,3
,,2024-09-05,SXR8.DE,68,2
,,2024-02-01,TSLA,190,1
,,2024-05-12,TSLA,210,2
,,2024-08-18,AMZN,130,3
```

### Project structure
- `app.py`: app entry, sets wide layout and routes to each flow.
- `components.py`: UI helpers `render_manual_calc` and `render_csv_calc` (forms, tables, charts).
- `logic.py`: `_to_float`, `process_ticket` (current price via `fast_info['last_price']`), `csv_download_import`.
- `modelo_site_ativos.csv`: blank template.
- `sample_combo.csv`: ready-to-use sample dataset.
- `requirements.txt`: dependencies.

### Notes & limitations
- Needs internet; prices are fetched live from Yahoo Finance.
- Tickers must exist on Yahoo Finance; missing tickers raise row-level errors.
- Dates are informational only; calculations use current prices, not historical.
- Intraday moves affect results; rerun to refresh prices.
