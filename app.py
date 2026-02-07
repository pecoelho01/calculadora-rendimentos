import streamlit as st

from components import render_manual_calc, render_csv_calc

st.set_page_config(
    page_title="Calculadora de Rendimentos",
    page_icon="📈",
    layout="wide",
)

# Remover limites de largura e reduzir a folga lateral/padding padrão
st.markdown(
    """
    <style>
    .main .block-container {
        max-width: 100%;
        padding-left: 1.5rem;
        padding-right: 1.5rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


st.title("📈 Calculadora de Rendimentos")

st.markdown("Para saber mais sobre os tickers, visite o [Yahoo Finance](https://finance.yahoo.com/).")
st.write("Nota: basta pesquisar o nome do ativo financeiro na barra <pesquisar> do Yahoo Finance e depois verificar o Ticker do seu ativo.")
my_tickers = [ "SXR8.DE-MSCI SP500", "SEC0D.XD-MSCI Semiondutores", "EMIMA.XD-MSCI IMI EME", "EUNK.DE-MSCI Europe", "Outro ativo (digite...)"]

choice = st.selectbox( 
    "Como deseja calcular?", ("Calcular ativos manualmente", "Importar dados - CSV") )

if choice == "Calcular ativos manualmente":
    render_manual_calc(my_tickers)

if choice == "Importar dados - CSV":
    render_csv_calc()
