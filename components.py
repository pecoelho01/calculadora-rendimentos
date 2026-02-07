import streamlit as st
import pandas as pd
import plotly.express as px
import yfinance as yf

from logic import process_ticket, csv_download_import, type_ticket, _to_float


def render_manual_calc(my_tickers):
    st.title("Múltiplos ativos manualmente")
    qnt_orders = st.number_input("Nº de ordens:", min_value=1, value=1)
    dados_ordens = []

    with st.form("multi_orders"):
        st.write("Insira os dados de cada ordem:")

        for i in range(int(qnt_orders)):
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                sel = st.selectbox(f"Ticker {i+1}", options=my_tickers, key=f"sel_{i}")
                man = st.text_input(f"Se 'Outro', digite:", key=f"man_{i}", help="Digite o ticker (ex: TSLA)")

            with col2:
                st.text_input(f"Qtd {i+1}", value="1.0", key=f"q_{i}")
            with col3:
                st.text_input(f"Preço de compra {i+1}", value="150.0", key=f"p_{i}")
            with col4:
                st.text_input(f"Data {i+1}", value="25-10-2023", key=f"d_{i}")
            st.divider()

        submit = st.form_submit_button("Calcular Todos")

    if submit:
        for i in range(int(qnt_orders)):
            try:
                ticker_final = st.session_state[f"man_{i}"] if st.session_state[f"sel_{i}"] == "Outro ativo (digite...)" else st.session_state[f"sel_{i}"]

                t_clean = ticker_final.split("-")[0].strip()

                q = _to_float(st.session_state[f"q_{i}"], "Quantidade")
                p = _to_float(st.session_state[f"p_{i}"], "Preço de compra")
                d = st.session_state[f"d_{i}"]

                results = process_ticket(t_clean, p, q)

                dados_ordens.append({
                    "Data Compra": d,
                    "Ticker": t_clean,
                    "Tipo de ativo": type_ticket(t_clean),
                    "Qtd": q,
                    "Preço Compra": f"{p:.2f}",
                    "Preço Atual": f"{results[2]:.2f}",
                    "Ganho": round(results[0], 2),
                    "ROI (%)": f"{results[1]:.2f}%"
                })
            except Exception as e:
                st.error(f"Erro no ticker {i+1} ({t_clean}): {e}")

        if dados_ordens:
            st.subheader("Resumo do Portfólio")
            df_final = pd.DataFrame(dados_ordens)
            st.dataframe(df_final, use_container_width=True)


def render_csv_calc():
    st.title("Dados via CSV")
    st.text("Aqui está um modelo para colocar os dados dos seus ativos financeiros e depois importar")

    file = csv_download_import()

    if file is not None:
        try:
            df = pd.read_csv(file, header=1, sep=',')
            df.columns = df.columns.str.strip()

            df["pricebuy"] = df["pricebuy"].astype(str).str.replace(",", ".", regex=False).astype(float)
            df["shares"] = df["shares"].astype(str).str.replace(",", ".", regex=False).astype(float)
            colunaDate = df["date"]
            colunaTicker = df["ticker"]
            colunaPriceBuy = df["pricebuy"]
            colunaShares = df["shares"]

            dados_finais = []

            if st.button("Calcular share-to-share"):

                for i in range(len(colunaDate)):

                    results = process_ticket(colunaTicker[i], colunaPriceBuy[i], colunaShares[i])

                    dados_finais.append({
                        "Date": colunaDate[i],
                        "Ticker": colunaTicker[i],
                        "Tipo de ativo": type_ticket(colunaTicker[i]),
                        "Price Buy": colunaPriceBuy[i],
                        "Shares": colunaShares[i],
                        "GAIN(euros)": round(results[0],2),
                        "ROI %": round(results[1],2)
                    })
                st.subheader("Resumo do Portfólio")
                df_final_ = pd.DataFrame(dados_finais)
                st.dataframe(df_final_, use_container_width=True)

                st.subheader("ROI por ativos - comparação")
                st.bar_chart(data=df_final_, x="Date", y="ROI %", color="Ticker")

            if st.button("Calcular portfólio"):
                combos = []

                for ticker in colunaTicker.unique():
                    bloco = df[df["ticker"] == ticker]
                    total_shares = bloco["shares"].sum()
                    total_cost = (bloco["pricebuy"] * bloco["shares"]).sum()

                    try:
                        current_price = yf.Ticker(ticker).fast_info["last_price"]
                    except Exception:
                        current_price = None

                    if current_price is None:
                        st.error(f"Não foi possível obter preço atual para {ticker}.")
                        continue

                    total_value = total_shares * current_price
                    gain = total_value - total_cost
                    roi = (gain / total_cost) * 100 if total_cost else 0

                    combos.append({
                        "Ticker": ticker,
                        "Tipo de ativo": type_ticket(ticker),
                        "Qtd Total": round(total_shares, 2),
                        "Preço Médio": round(total_cost / total_shares, 4) if total_shares else 0,
                        "Preço Atual": round(current_price, 4),
                        "Custo Total": round(total_cost, 2),
                        "Valor Atual": round(total_value, 2),
                        "GAIN": round(gain, 2),
                        "ROI %": round(roi, 2)
                    })

                if combos:
                    st.subheader("Resumo consolidado por ticker")
                    st.dataframe(combos, use_container_width=True)
                    st.subheader("ROI consolidado por ticker")
                    st.bar_chart(data=combos, x="Ticker", y="ROI %", color="Ticker")

                    st.subheader("Divisão do portfólio")
                    df_combo = pd.DataFrame(combos)
                    data = {
                        "Categoria": df_combo["Ticker"],
                        "Valores": df_combo["Valor Atual"]
                    }
                    df_pizza = pd.DataFrame(data)
                    fig = px.pie(df_pizza, values="Valores", names="Categoria", hole=0.5)
                    st.plotly_chart(fig)

        except FileNotFoundError:
           st.error("Arquivo não compatível")
