# Calculadora de Rendimentos

Aplicação em **Streamlit** para acompanhar a rentabilidade de uma carteira de investimentos com dados do **Yahoo Finance**.

**Live:** https://calculadora-rendimentos.streamlit.app/

## Funcionalidades

- Registo manual de múltiplas ordens (ticker, quantidade, preço e data)
- Importação de carteira via CSV
- Suporte a ordens de `buy` e `sell` no modo CSV
- Cálculo de:
  - ganho realizado
  - ganho não realizado
  - ganho total
  - ROI total do portfólio
- Resumo consolidado por ticker (posição aberta, custo médio, preço atual, valor atual)
- Evolução semanal do ROI do portfólio
- Comparação da evolução semanal com o **S&P 500**
- Gráficos de apoio (linha, barras e donut de alocação)
- Exportação de relatório em PDF
- Secções de notas explicativas e informação sobre o autor

## Stack

- [Streamlit](https://streamlit.io/)
- [yfinance](https://github.com/ranaroussi/yfinance)
- [pandas](https://pandas.pydata.org/)
- [plotly.express](https://plotly.com/python/plotly-express/)
- [fpdf2](https://py-pdf.github.io/fpdf2/)

## Executar localmente

```bash
git clone https://github.com/pecoelho01/calculadora-rendimentos.git
cd calculadora-rendimentos
pip install -r requirements.txt
streamlit run app.py
```

Depois abre `http://localhost:8501`.

## Estrutura do projeto

```text
.
├── app.py                  # Entrada da aplicação e navegação entre páginas
├── components.py           # UI e fluxos de cálculo (manual + CSV + PDF + gráficos)
├── logic.py                # Lógica de cálculo de portfólio, ROI e integração com yfinance
├── textonly.py             # Conteúdo textual ("Notas explicativas" e "Sobre mim")
├── modelo_site_ativos.csv  # Modelo de CSV para importação
├── sample_combo.csv        # Exemplo de CSV preenchido
└── requirements.txt
```

## Formato do CSV

No modo de upload, o ficheiro deve conter estas colunas:

| Coluna | Obrigatória | Descrição |
|---|---|---|
| `date` | Sim | Data da ordem (`YYYY-MM-DD`) |
| `ticker` | Sim | Ticker no Yahoo Finance (ex.: `SXR8.DE`, `TSLA`) |
| `name` | Opcional | Nome do ativo |
| `pricebuy` | Sim | Preço por unidade (em vendas, representa preço de venda) |
| `shares` | Sim | Quantidade |
| `type` | Opcional | `buy` ou `sell` (se faltar, assume `buy`) |

Notas:

- O parser aceita tanto ponto como vírgula como separador decimal.
- O projeto inclui o template `modelo_site_ativos.csv` e um exemplo em `sample_combo.csv`.

## Menu da aplicação

- **Calcular ativos manualmente**: introdução manual de ordens
- **Upload Portfólio**: análise completa por CSV
- **Notas explicativas**: fórmulas e interpretação das métricas
- **Sobre mim**: informação do autor

## Limitações atuais

- Não existe persistência de dados entre sessões.
- A precisão e disponibilidade dependem da API do Yahoo Finance.
- A opção "Duvidas com ChatBOT" ainda está marcada como breve/pendente.
