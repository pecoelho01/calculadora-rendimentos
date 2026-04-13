import pandas as pd
import plotly.express as px
import streamlit as st
import yfinance as yf

from logic import (
    process_ticket,
    csv_download_import,
    type_ticket,
    _to_float,
)


def _ticker_key(ticker):
    return str(ticker).strip().upper()


def _build_type_map(tickers):
    type_map = {}
    for ticker in tickers:
        t = str(ticker).strip()
        k = _ticker_key(ticker)
        if not t or k in type_map:
            continue
        type_map[k] = type_ticket(t)
    return type_map


def _build_daily_roi_series(df_orders, date_col, ticker_col, shares_col, buy_price_col, roi_col, dayfirst=False):
    df_roi = df_orders.copy()
    df_roi[date_col] = pd.to_datetime(df_roi[date_col], errors="coerce", dayfirst=dayfirst).dt.normalize()
    df_roi = df_roi.dropna(subset=[date_col]).sort_values(date_col)
    if df_roi.empty:
        return pd.DataFrame(columns=[date_col, roi_col])

    df_roi[shares_col] = pd.to_numeric(df_roi[shares_col], errors="coerce")
    df_roi[buy_price_col] = pd.to_numeric(df_roi[buy_price_col], errors="coerce")
    df_roi = df_roi.dropna(subset=[ticker_col, shares_col, buy_price_col])
    if df_roi.empty:
        return pd.DataFrame(columns=[date_col, roi_col])

    start_date = df_roi[date_col].min().normalize()
    today = pd.Timestamp.now().normalize()
    if start_date > today:
        return pd.DataFrame(columns=[date_col, roi_col])

    daily_index = pd.date_range(start=start_date, end=today, freq="D")
    df_roi["cost"] = df_roi[shares_col] * df_roi[buy_price_col]
    daily_cost = df_roi.groupby(date_col)["cost"].sum().reindex(daily_index, fill_value=0).cumsum()

    daily_value = pd.Series(0.0, index=daily_index)
    for ticker in df_roi[ticker_col].astype(str).str.strip().unique():
        ticker_orders = df_roi[df_roi[ticker_col].astype(str).str.strip() == ticker]
        shares_daily = ticker_orders.groupby(date_col)[shares_col].sum().reindex(daily_index, fill_value=0).cumsum()

        try:
            hist = yf.Ticker(ticker).history(
                start=start_date.strftime("%Y-%m-%d"),
                end=(today + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                interval="1d",
                auto_adjust=False,
            )
            prices = hist["Close"] if "Close" in hist.columns else pd.Series(dtype=float)
        except Exception:
            prices = pd.Series(dtype=float)

        if prices.empty:
            try:
                last_price = float(yf.Ticker(ticker).fast_info.get("last_price"))
                price_daily = pd.Series(last_price, index=daily_index, dtype=float)
            except Exception:
                st.error(f"Não foi possível obter histórico/preço atual para {ticker}.")
                continue
        else:
            prices.index = pd.to_datetime(prices.index).normalize()
            price_daily = pd.to_numeric(prices, errors="coerce").groupby(level=0).last().reindex(daily_index).ffill().bfill()

        daily_value = daily_value.add(shares_daily * price_daily, fill_value=0)

    roi_daily = ((daily_value - daily_cost) / daily_cost.replace(0, pd.NA)) * 100
    roi_daily = roi_daily.fillna(0)

    return pd.DataFrame({date_col: daily_index, roi_col: roi_daily.values})


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
        type_by_ticker = {}
        for i in range(int(qnt_orders)):
            try:
                ticker_final = st.session_state[f"man_{i}"] if st.session_state[f"sel_{i}"] == "Outro ativo (digite...)" else st.session_state[f"sel_{i}"]

                t_clean = ticker_final.split("-")[0].strip()
                t_key = _ticker_key(t_clean)
                if t_key not in type_by_ticker:
                    type_by_ticker[t_key] = type_ticket(t_clean)

                q = _to_float(st.session_state[f"q_{i}"], "Quantidade")
                p = _to_float(st.session_state[f"p_{i}"], "Preço de compra")
                d = st.session_state[f"d_{i}"]

                results = process_ticket(t_clean, p, q)

                dados_ordens.append({
                    "Data Compra": d,
                    "Ticker": t_clean,
                    "Tipo de ativo": type_by_ticker.get(t_key, "N/A"),
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
                        "Tipo de ativo": type_by_ticker.get(_ticker_key(ticker), "N/A"),
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

                    # Série diária real de ROI até hoje, com base no histórico de preços
                    df_roi = _build_daily_roi_series(
                        df_orders=df_final,
                        date_col="Data Compra",
                        ticker_col="Ticker",
                        shares_col="Qtd",
                        buy_price_col="Preço Compra",
                        roi_col="ROI Acum (%)",
                        dayfirst=True,
                    )
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
            colunaName = df.get("name")
            colunaPriceBuy = df["pricebuy"]
            colunaShares = df["shares"]

            dados_finais = []

            if st.button("Calcular share-to-share"):
                type_by_ticker = _build_type_map(colunaTicker)

                for i in range(len(colunaDate)):

                    results = process_ticket(colunaTicker[i], colunaPriceBuy[i], colunaShares[i])

                    dados_finais.append({
                        "Date": colunaDate[i],
                        "Ticker": colunaTicker[i],
                        "Name": colunaName[i] if colunaName is not None else "",
                        "Tipo de ativo": type_by_ticker.get(_ticker_key(colunaTicker[i]), "N/A"),
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
                type_by_ticker = _build_type_map(colunaTicker.unique())

                for ticker in colunaTicker.unique():
                    bloco = df[df["ticker"] == ticker]
                    name_value = bloco["name"].iloc[0] if "name" in bloco.columns else ""
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
                        "Name": name_value,
                        "Tipo de ativo": type_by_ticker.get(_ticker_key(ticker), "N/A"),
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

                    # Série diária real de ROI até hoje, com base no histórico de preços
                    df_roi = _build_daily_roi_series(
                        df_orders=df,
                        date_col="date",
                        ticker_col="ticker",
                        shares_col="shares",
                        buy_price_col="pricebuy",
                        roi_col="roi_acum",
                    )
                    if not df_roi.empty:
                        st.subheader("Evolução do ROI do portfólio (acumulado)")
                        st.line_chart(df_roi, x="date", y="roi_acum")

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


#def render_chatbot_gemini():
    
