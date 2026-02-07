import streamlit as st
import pandas as pd
import plotly.express as px
import yfinance as yf
import datetime as dt

from logic import process_ticket, csv_download_import, type_ticket, _to_float


def _historical_roi_line(df_orders, date_col, ticker_col, price_col, shares_col, title_suffix=""):
    """
    Constrói série diária de ROI acumulado usando preços históricos.
    Usa compras como aportes (sem vendas) e avalia carteira com 'Close' diário.
    """
    if df_orders.empty:
        return

    df = df_orders.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col])
    if df.empty:
        return

    tickers = df[ticker_col].unique()
    start = df[date_col].min().normalize()
    end = dt.datetime.utcnow().date() + dt.timedelta(days=1)  # incluir hoje
    date_index = pd.date_range(start=start, end=end, freq="D")

    # Inicia acumuladores
    total_cost = pd.Series(0.0, index=date_index)
    total_value = pd.Series(0.0, index=date_index)

    for t in tickers:
        bloco = df[df[ticker_col] == t]
        # Passo de compra (cost e shares no dia da compra)
        cost_steps = bloco.set_index(date_col)[price_col].astype(float) * bloco.set_index(date_col)[shares_col].astype(float)
        cost_series = cost_steps.reindex(date_index, fill_value=0).cumsum()

        share_steps = bloco.set_index(date_col)[shares_col].astype(float)
        shares_cum = share_steps.reindex(date_index, fill_value=0).cumsum()

        try:
            hist = yf.Ticker(t).history(start=start, end=end)
            price_series = hist["Close"].reindex(date_index).ffill()
        except Exception:
            # se falhar, pula ticker
            continue

        total_cost = total_cost.add(cost_series, fill_value=0)
        total_value = total_value.add(shares_cum * price_series, fill_value=0)

    valid = total_cost > 0
    if not valid.any():
        return

    roi = (total_value - total_cost) / total_cost * 100
    df_roi = pd.DataFrame({"Data": date_index, "ROI Acum (%)": roi})
    df_roi = df_roi[valid]

    if not df_roi.empty:
        st.subheader(f"Evolução do ROI do portfólio (preços históricos){title_suffix}")
        st.line_chart(df_roi, x="Data", y="ROI Acum (%)")


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

            if st.button("Calcular portfólio"):
                combos = []

                for ticker in df_final["Ticker"].unique():
                    bloco = df_final[df_final["Ticker"] == ticker]
                    total_shares = bloco["Qtd"].astype(float).sum()
                    total_cost = (bloco["Preço Compra"].astype(float) * bloco["Qtd"].astype(float)).sum()
                    current_price = float(bloco["Preço Atual"].iloc[0])

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
                    total_cost = sum(item["Custo Total"] for item in combos)
                    total_value = sum(item["Valor Atual"] for item in combos)
                    total_gain = sum(item["GAIN"] for item in combos)
                    total_roi = (total_gain / total_cost) * 100 if total_cost else 0

                    st.subheader("Rentabilidade total do portfólio")
                    st.metric("ROI Total (%)", f"{total_roi:.2f}%")
                    st.metric("Total investido (€)", f"{total_cost:.2f}")
                    st.metric("Ganho Total (€)", f"{total_gain:,.2f}")
                    st.metric("Valor Atual (€)", f"{total_value:,.2f}")

                    _historical_roi_line(
                        df_final,
                        date_col="Data Compra",
                        ticker_col="Ticker",
                        price_col="Preço Compra",
                        shares_col="Qtd",
                        title_suffix="",
                    )

                    # Linha de ROI acumulado ao longo das compras (usa preços atuais para o valor)
                    df_roi = df_final.copy()
                    df_roi["Data Compra"] = pd.to_datetime(df_roi["Data Compra"], errors="coerce")
                    df_roi = df_roi.sort_values("Data Compra").dropna(subset=["Data Compra"])
                    df_roi["Custo"] = df_roi["Preço Compra"].astype(float) * df_roi["Qtd"].astype(float)
                    df_roi["Valor Atual Linha"] = df_roi["Preço Atual"].astype(float) * df_roi["Qtd"].astype(float)
                    df_roi["Custo Acum"] = df_roi["Custo"].cumsum()
                    df_roi["Valor Acum"] = df_roi["Valor Atual Linha"].cumsum()
                    df_roi["ROI Acum (%)"] = (df_roi["Valor Acum"] - df_roi["Custo Acum"]) / df_roi["Custo Acum"] * 100
                    if not df_roi.empty:
                        st.subheader("Evolução do ROI do portfólio (acumulado)")
                        st.line_chart(df_roi, x="Data Compra", y="ROI Acum (%)")

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
                    last_prices = {t: yf.Ticker(t).fast_info["last_price"] for t in colunaTicker.unique()}

                    custo_total = (df["pricebuy"] * df["shares"]).sum()
                    valor_atual = sum(df.loc[i, "shares"] * last_prices[df.loc[i, "ticker"]] for i in df.index)
                    ganho_total = valor_atual - custo_total
                    roi_total = (ganho_total / custo_total) * 100 if custo_total else 0
                    valor_investido = valor_atual - ganho_total

                    st.subheader("Rentabilidade total do portfólio")
                    st.metric("ROI Total (%)", f"{roi_total:.2f}%")
                    st.metric("Total investido (€)", f"{valor_investido:.2f}")
                    st.metric("Ganho Total (€)", f"{ganho_total:,.2f}")
                    st.metric("Valor Atual (€)", f"{valor_atual:,.2f}")

                    _historical_roi_line(
                        df,
                        date_col="date",
                        ticker_col="ticker",
                        price_col="pricebuy",
                        shares_col="shares",
                        title_suffix="",
                    )

                    # Linha de ROI acumulado ao longo das compras (usa preços atuais para o valor)
                    df_roi = df.copy()
                    df_roi["date"] = pd.to_datetime(df_roi["date"], errors="coerce")
                    df_roi = df_roi.sort_values("date").dropna(subset=["date"])
                    df_roi["current_price"] = df_roi["ticker"].map(last_prices)
                    df_roi["custo"] = df_roi["pricebuy"] * df_roi["shares"]
                    df_roi["valor_atual_linha"] = df_roi["current_price"] * df_roi["shares"]
                    df_roi["custo_acum"] = df_roi["custo"].cumsum()
                    df_roi["valor_acum"] = df_roi["valor_atual_linha"].cumsum()
                    df_roi["roi_acum"] = round((df_roi["valor_acum"] - df_roi["custo_acum"]) / df_roi["custo_acum"] * 100, 2)
                    if not df_roi.empty:
                        st.subheader("Evolução do ROI do portfólio (acumulado)")
                        st.line_chart(df_roi, x="date", y="roi_acum", color="yellow")

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
