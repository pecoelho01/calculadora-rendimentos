# 📈 Asset Yield Calculator

Interactive **Streamlit** app that computes gain and ROI for financial assets using real-time prices from **Yahoo Finance** (`yfinance`). Supports manual multi-order input and CSV imports.

### 🔗 Live app
**[https://calculadora-rendimentos.streamlit.app/](https://calculadora-rendimentos.streamlit.app/)**

---

## How it works
- **Manual mode**: choose how many orders to enter; fill Ticker, Quantity, Buy Price and Date for each. Includes a quick list of ETFs/indices plus “Other asset (type...)”.
- **CSV mode**: download the template (`modelo_site_ativos.csv`), fill columns `date`, `ticker`, `pricebuy`, `shares`, then upload. Commas in numbers are converted to dots automatically.
- **Per-order calc**: `logic.process_ticket` fetches `fast_info['last_price']` for each ticker and calculates absolute gain and ROI (%).
- **Per-order outputs**: table of every row and a bar chart comparing ROI by Date and Ticker.
- **Per-ticker combo (CSV)**: the “Calcular combo por ativo” button groups all orders of each ticker, computing weighted average price, total cost, current value, consolidated GAIN and ROI%, plus a ROI bar chart by ticker.

## Quickstart
```bash
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos
pip install -r requirements.txt
streamlit run app.py
```

## CSV template
- File: `modelo_site_ativos.csv`
- Header columns: `date,ticker,pricebuy,shares` (header starts on the second line; first line is blank to match the current uploader).
- Example (also saved as `sample_combo.csv`):
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

## Project structure
- `app.py`: Streamlit UI; manual mode, CSV mode, per-order and per-ticker outputs.
- `logic.py`: calculation helpers (`process_ticket`) and CSV download/upload helper (`csv_download_import`).
- `modelo_site_ativos.csv`: blank template for imports.
- `sample_combo.csv`: ready-to-use sample dataset for testing the combo feature.
- `requirements.txt`: app dependencies.
- `components.py`: reserved placeholder (currently empty).

## Dependencies
- streamlit
- yfinance
- pandas

## Notes & limitations
- Requires internet access; prices come from Yahoo Finance at request time.
- Tickers must exist on Yahoo Finance; missing tickers trigger per-order error messages.
- Dates are informational only; calculations use current prices, not historical ones.
- Current price uses `fast_info['last_price']` and may move intraday.
