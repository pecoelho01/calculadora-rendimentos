import streamlit as st


def summary():
    st.header("Notas explicativas")

    st.subheader("Preço Atual")
    st.write("Obtido em tempo real via Yahoo Finance, com base no último preço de fecho disponível para o ticker introduzido.")

    st.subheader("Ganho (€)")
    st.write("Diferença entre o valor atual e o valor investido:")
    st.latex(r"Ganho = (Pre\c{c}o\ Atual - Pre\c{c}o\ Compra) \times Quantidade")

    st.subheader("ROI (%)")
    st.write("Retorno sobre o investimento em percentagem:")
    st.latex(r"ROI\ (\%) = \frac{Pre\c{c}o\ Atual - Pre\c{c}o\ Compra}{Pre\c{c}o\ Compra} \times 100")

    st.subheader("Custo Total")
    st.write("Valor total investido numa posição:")
    st.latex(r"Custo\ Total = Pre\c{c}o\ Compra \times Quantidade")

    st.subheader("Valor Atual")
    st.write("Valor atual de uma posição:")
    st.latex(r"Valor\ Atual = Pre\c{c}o\ Atual \times Quantidade")

    st.subheader("ROI Total do Portfólio")
    st.write("Calculado sobre o conjunto de todas as ordens:")
    st.latex(r"ROI\ Total\ (\%) = \frac{Valor\ Atual\ Total - Custo\ Total}{Custo\ Total} \times 100")

    st.subheader("Evolução semanal do ROI")
    st.write("Para cada semana desde a primeira compra, é calculado o ROI acumulado do portfólio usando os preços históricos reais de fecho do Yahoo Finance, semana a semana.")

def about():
    st.header("Sobre mim")
    st.write("Olá! Sou o **Pedro**, estudante de **Engenharia Informática**.")
    st.write("Criei esta calculadora como projeto pessoal, com o objetivo de ter uma ferramenta simples e prática para acompanhar o desempenho de investimentos financeiros em tempo real.")
    st.write("Se tiveres sugestões, encontrares bugs ou quiseres contribuir, estás à vontade para abrir uma issue ou um pull request no GitHub!")
    st.markdown("🔗 [github.com/pecoelho01](https://github.com/pecoelho01)")
