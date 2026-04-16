# Calculadora de Rendimentos

Aplicação web para análise e acompanhamento de carteiras de investimento, com dados de mercado em tempo real.

**Live:** https://calculadora-rendimentos.streamlit.app/

## Funcionalidades

- **Cálculo manual**: Adicione posições manualmente com ticker, quantidade, preço de compra e data
- **Importação via CSV**: Carregue um ficheiro CSV com todos os seus ativos de uma só vez
- **Dados em tempo real**: Preços actualizados via Yahoo Finance (yfinance)
- **Métricas de portfólio**: ROI, ganho total e valor actual por ativo e consolidado
- **Evolução temporal**: Gráfico de ROI semanal acumulado ao longo do tempo
- **Visualizações interativas**: Gráficos de barras (ROI por ticker) e donut (alocação da carteira)

## Tech Stack

- [Streamlit](https://streamlit.io/) — framework de UI web
- [yfinance](https://github.com/ranaroussi/yfinance) — dados financeiros do Yahoo Finance
- [pandas](https://pandas.pydata.org/) — manipulação e análise de dados
- [Plotly Express](https://plotly.com/python/plotly-express/) — gráficos interativos

## Instalação e execução

```bash
# Clonar o repositório
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos

# Instalar dependências
pip install -r requirements.txt

# Iniciar a aplicação
streamlit run app.py
```

A aplicação fica disponível em `http://localhost:8501`.

## Estrutura do projeto

```
├── app.py               # Ponto de entrada — configuração da página e navegação
├── components.py        # Componentes de UI (modo manual e modo CSV)
├── logic.py             # Lógica de negócio — cálculos de ROI, ganhos e dados históricos
├── requirements.txt     # Dependências Python
├── modelo_site_ativos.csv  # Template CSV para importação
└── sample_combo.csv     # Exemplo de CSV com dados de amostra
```

## Formato do CSV

Para utilizar o modo de importação, o ficheiro CSV deve seguir o formato do template disponível para download na aplicação:

| Campo      | Descrição                        |
|------------|----------------------------------|
| `date`     | Data de compra (YYYY-MM-DD)      |
| `ticker`   | Símbolo do ativo (ex: `SXR8.DE`) |
| `name`     | Nome do ativo                    |
| `pricebuy` | Preço de compra por unidade      |
| `shares`   | Número de unidades adquiridas    |

## Notas

- Os dados são calculados em memória e não são persistidos entre sessões.
- A aplicação depende da disponibilidade da API do Yahoo Finance; limites de taxa podem afetar carteiras com muitos ativos.
- Interface em português, com formatação de moeda em EUR (€).

---

# Investment Returns Calculator

Web application for investment portfolio analysis and tracking, with real-time market data.

**Live:** https://calculadora-rendimentos.streamlit.app/

## Features

- **Manual entry**: Add positions manually with ticker, quantity, purchase price and date
- **CSV import**: Upload a CSV file with all your assets at once
- **Real-time data**: Prices updated via Yahoo Finance (yfinance)
- **Portfolio metrics**: ROI, total gain and current value per asset and consolidated
- **Time evolution**: Cumulative weekly ROI chart over time
- **Interactive visualisations**: Bar charts (ROI by ticker) and donut chart (portfolio allocation)

## Tech Stack

- [Streamlit](https://streamlit.io/) — web UI framework
- [yfinance](https://github.com/ranaroussi/yfinance) — financial data from Yahoo Finance
- [pandas](https://pandas.pydata.org/) — data manipulation and analysis
- [Plotly Express](https://plotly.com/python/plotly-express/) — interactive charts

## Installation and usage

```bash
# Clone the repository
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos

# Install dependencies
pip install -r requirements.txt

# Start the application
streamlit run app.py
```

The application is available at `http://localhost:8501`.

## Project structure

```
├── app.py               # Entry point — page configuration and navigation
├── components.py        # UI components (manual mode and CSV mode)
├── logic.py             # Business logic — ROI, gains and historical data calculations
├── requirements.txt     # Python dependencies
├── modelo_site_ativos.csv  # CSV template for import
└── sample_combo.csv     # Sample CSV with example data
```

## CSV Format

To use the import mode, the CSV file must follow the template format available for download in the application:

| Field      | Description                        |
|------------|------------------------------------|
| `date`     | Purchase date (YYYY-MM-DD)         |
| `ticker`   | Asset symbol (e.g. `SXR8.DE`)     |
| `name`     | Asset name                         |
| `pricebuy` | Purchase price per unit            |
| `shares`   | Number of units acquired           |

## Notes

- Data is calculated in memory and is not persisted between sessions.
- The application depends on the availability of the Yahoo Finance API; rate limits may affect portfolios with many assets.
- Interface in Portuguese, with currency formatting in EUR (€).
