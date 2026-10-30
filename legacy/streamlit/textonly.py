import streamlit as st


def summary():
    st.header("Notas explicativas")

    st.subheader("Preço Atual")
    st.write("Obtido em tempo real via Yahoo Finance, com base no último preço de fecho disponível para o ticker introduzido.")

    st.subheader("Tipo de ordem (type)")
    st.write("Cada linha do CSV deve ter um campo `type` com o valor `buy` (compra) ou `sell` (venda). Se omitido, é assumido `buy`. Nas linhas de venda, o campo `pricebuy` representa o preço a que vendeste.")

    st.subheader("Custo Médio Ponderado")
    st.write("Calculado apenas com as ordens de compra, ponderando o preço pela quantidade em cada ordem. Atualiza-se a cada nova compra:")
    st.latex(r"Custo\ M\acute{e}dio = \frac{\sum (Pre\c{c}o\ Compra_i \times Qtd_i)}{\sum Qtd_i}")

    st.subheader("Ganho Realizado (€)")
    st.write("Lucro já concretizado ao vender. Calculado com base no custo médio ponderado no momento da venda:")
    st.latex(r"Ganho\ Realizado = (Pre\c{c}o\ Venda - Custo\ M\acute{e}dio) \times Qtd\ Vendida")

    st.subheader("Ganho Não Realizado (€)")
    st.write("Lucro potencial das posições ainda em carteira. Só se torna real quando venderes:")
    st.latex(r"Ganho\ N\~ao\ Realizado = (Pre\c{c}o\ Atual - Custo\ M\acute{e}dio) \times Qtd\ Aberta")

    st.subheader("Ganho Total (€)")
    st.write("Soma do ganho realizado com o ganho não realizado:")
    st.latex(r"Ganho\ Total = Ganho\ Realizado + Ganho\ N\~ao\ Realizado")

    st.subheader("Valor Atual da Posição Aberta (€)")
    st.write("Valor de mercado atual das unidades que ainda tens em carteira:")
    st.latex(r"Valor\ Atual = Pre\c{c}o\ Atual \times Qtd\ Aberta")

    st.subheader("ROI Total do Portfólio (%)")
    st.write("Retorno total sobre todo o capital alguma vez investido, incluindo ganhos realizados e não realizados:")
    st.latex(r"ROI\ Total\ (\%) = \frac{Ganho\ Total}{Total\ Investido} \times 100")

    st.subheader("Evolução semanal do ROI")
    st.write("Para cada semana desde a primeira ordem, é reconstruída a posição do portfólio (considerando compras e vendas até essa data) e calculado o ROI com os preços históricos reais do Yahoo Finance:")
    st.latex(r"ROI\ Semanal\ (\%) = \frac{Valor\ Atual + Recebido\ Vendas - Total\ Investido}{Total\ Investido} \times 100")

def about():
    st.header("Sobre mim")
    st.write("Olá! Sou o **Pedro**, estudante de **Engenharia Informática**.")
    st.write("Criei esta calculadora como projeto pessoal, com o objetivo de ter uma ferramenta simples e prática para acompanhar o desempenho de investimentos financeiros em tempo real.")
    st.write("Se tiveres sugestões, encontrares bugs ou quiseres contribuir, estás à vontade para abrir uma issue ou um pull request no GitHub!")
    st.markdown("🔗 [github.com/pecoelho01](https://github.com/pecoelho01)")
