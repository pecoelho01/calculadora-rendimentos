import pandas as pd
import plotly.express as px
import streamlit as st
import yfinance as yf

from logic import (
    process_ticket,
    csv_download_import,
    type_ticket,
    _to_float,
    calc_weekly_roi,
    fetch_sp500_weekly_roi,
    _strip_tz,
    calc_portfolio_with_sells,
)

# Limpar o ticket
def ticker_key(ticker):
    return str(ticker).strip().upper()

# Guardar os tipos de ativos de os determinados tickets, evitar múltiplas chamadas à API
def _build_type_map(tickers):
    type_map = {}
    for ticker in tickers:
        t = str(ticker).strip()
        k = ticker_key(ticker)
        if not t or k in type_map:
            continue
        type_map[k] = type_ticket(t)
    return type_map

# Trata da parte manual
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
                if st.session_state[f"sel_{i}"] == "Outro ativo (digite...)":
                      ticker_final = st.session_state[f"man_{i}"] 
                else:
                    st.session_state[f"sel_{i}"]

                t_clean = ticker_final.split("-")[0].strip()
                t_key = ticker_key(t_clean)
                if t_key not in type_by_ticker:
                    type_by_ticker[t_key] = type_ticket(t_clean)

                qntd = _to_float(st.session_state[f"q_{i}"])
                price_buy = _to_float(st.session_state[f"p_{i}"])
                date_buy = st.session_state[f"d_{i}"]

                results = process_ticket(t_clean, price_buy, qntd)

                dados_ordens.append({
                    "Data Compra": date_buy,
                    "Ticker": t_clean,
                    "Tipo de ativo": type_by_ticker.get(t_key, "N/A"),
                    "Qtd": qntd,
                    "Preço Compra": round(price_buy, 2) + "€",
                    "Preço Atual": round(results[2], 2) + "€",
                    "Ganho": round(results[0], 2),
                    "ROI (%)": round(results[1],2) + "%"
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
                    roi = (gain / total_cost) * 100 
                    if total_cost:
                         roi = (gain / total_cost) * 100 
                    else:
                        0

                    combos.append({
                        "Ticker": ticker,
                        "Tipo de ativo": type_by_ticker.get(ticker_key(ticker), "N/A"),
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

                    # Gráfico de ROI acumulado semana a semana com preços históricos reais
                    with st.spinner("A carregar evolução semanal do ROI..."):
                        df_weekly_roi = calc_weekly_roi(
                            df_final, "Ticker", "Data Compra", "Preço Compra", "Qtd"
                        )
                    if not df_weekly_roi.empty:
                        st.subheader("Evolução do ROI do portfólio (semana a semana)")
                        start_date = df_weekly_roi["date"].min()
                        df_sp500 = fetch_sp500_weekly_roi(str(start_date.date()))
                        df_weekly_sorted = df_weekly_roi.copy()
                        df_weekly_sorted["date"] = pd.to_datetime(df_weekly_sorted["date"]).dt.normalize().astype("datetime64[ns]")
                        df_sp500_sorted = df_sp500.copy()
                        df_sp500_sorted["date"] = pd.to_datetime(df_sp500_sorted["date"]).dt.normalize().astype("datetime64[ns]")
                        df_weekly_sorted = df_weekly_sorted.sort_values("date")
                        df_sp500_sorted = df_sp500_sorted.sort_values("date")
                        df_merge = pd.merge_asof(df_weekly_sorted, df_sp500_sorted, on="date", direction="nearest")
                        st.line_chart(df_merge, x="date", y=["ROI Acumulado", "ROI SP500 (%)"])

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

# Trata da parte do CSV 
def render_csv_calc():
    st.title("Dados via CSV")
    st.write("Aqui está um modelo para colocar os dados dos seus ativos financeiros e depois importar.")

    st.info(
        "**Como preencher o CSV:**\n\n"
        "O ficheiro deve ter as seguintes colunas, pela mesma ordem:\n\n"
        "- **date** — data da ordem no formato `YYYY-MM-DD` (ex: `2024-03-15`)\n"
        "- **ticker** — símbolo do ativo no Yahoo Finance (ex: `SXR8.DE`, `TSLA`)\n"
        "- **name** — nome do ativo (ex: `iShares S&P 500`)\n"
        "- **pricebuy** — preço por unidade (ex: `150.50`). Nas vendas, representa o preço de venda. Usa ponto ou vírgula como separador decimal\n"
        "- **shares** — número de unidades (ex: `10`)\n"
        "- **type** — tipo de ordem: `buy` para compra ou `sell` para venda (omitir equivale a `buy`)\n\n"
        "Podes fazer o download do modelo abaixo para ver um exemplo preenchido."
    )

    file = csv_download_import()

    if file is not None:
        try:
            df = pd.read_csv(file, header=1, sep=',')
            df.columns = df.columns.str.strip()

            df["pricebuy"] = df["pricebuy"].astype(str).str.replace(",", ".", regex=False).astype(float)
            df["shares"] = df["shares"].astype(str).str.replace(",", ".", regex=False).astype(float)
            if "type" in df.columns:
                df["type"] = df["type"].astype(str).str.strip().str.lower().fillna("buy")
            else:
                df["type"] = "buy"

            colunaDate = df["date"]
            colunaTicker = df["ticker"]
            colunaName = df.get("name")
            colunaPriceBuy = df["pricebuy"]
            colunaShares = df["shares"]
            colunaType = df["type"]

            dados_finais = []

            if st.button("Calcular share-to-share"):
                type_by_ticker = _build_type_map(colunaTicker)

                for i in range(len(colunaDate)):
                    order_type = colunaType.iloc[i] if hasattr(colunaType, "iloc") else colunaType[i]
                    if order_type == "sell":
                        dados_finais.append({
                            "Date": colunaDate[i],
                            "Ticker": colunaTicker[i],
                            "Name": colunaName[i] if colunaName is not None else "",
                            "Tipo de ativo": type_by_ticker.get(ticker_key(colunaTicker[i]), "N/A"),
                            "Price": colunaPriceBuy[i],
                            "Shares": colunaShares[i],
                            "Type": "SELL",
                            "GAIN(euros)": "-",
                            "ROI %": "-",
                        })
                        continue

                    results = process_ticket(colunaTicker[i], colunaPriceBuy[i], colunaShares[i])

                    dados_finais.append({
                        "Date": colunaDate[i],
                        "Ticker": colunaTicker[i],
                        "Name": colunaName[i] if colunaName is not None else "",
                        "Tipo de ativo": type_by_ticker.get(ticker_key(colunaTicker[i]), "N/A"),
                        "Price": colunaPriceBuy[i],
                        "Shares": colunaShares[i],
                        "Type": "BUY",
                        "GAIN(euros)": round(results[0], 2),
                        "ROI %": round(results[1], 2),
                    })

                st.subheader("Resumo do Portfólio")
                df_final_ = pd.DataFrame(dados_finais)
                st.dataframe(df_final_, use_container_width=True)

                buys_only = df_final_[df_final_["Type"] == "BUY"].copy()
                if not buys_only.empty:
                    buys_only["ROI %"] = pd.to_numeric(buys_only["ROI %"], errors="coerce")
                    st.subheader("ROI por ativos - comparação (compras)")
                    st.bar_chart(data=buys_only, x="Date", y="ROI %", color="Ticker")

            if st.button("Calcular portfólio"):
                portfolio_data = calc_portfolio_with_sells(df)
                all_tickers = [p["ticker"] for p in portfolio_data]
                open_tickers = [p["ticker"] for p in portfolio_data if p["open_shares"] > 0]
                type_by_ticker = _build_type_map(all_tickers)

                last_prices = {t: yf.Ticker(t).fast_info["last_price"] for t in open_tickers}

                combos = []
                for p in portfolio_data:
                    ticker = p["ticker"]
                    open_shares = p["open_shares"]
                    avg_cost = p["avg_cost"]
                    realized_gain = p["realized_gain"]

                    bloco = df[df["ticker"] == ticker]
                    name_value = bloco["name"].iloc[0] if "name" in bloco.columns else ""

                    if open_shares > 0 and ticker in last_prices:
                        current_price = last_prices[ticker]
                        current_value = open_shares * current_price
                        unrealized_gain = (current_price - avg_cost) * open_shares
                        cost_open = avg_cost * open_shares
                        roi_open = (unrealized_gain / cost_open) * 100 if cost_open else 0
                    else:
                        current_price = 0.0
                        current_value = 0.0
                        unrealized_gain = 0.0
                        roi_open = 0.0

                    total_gain = realized_gain + unrealized_gain
                    roi_total_ticker = (total_gain / p["total_invested"]) * 100 if p["total_invested"] else 0

                    combos.append({
                        "Ticker": ticker,
                        "Name": name_value,
                        "Tipo de ativo": type_by_ticker.get(ticker_key(ticker), "N/A"),
                        "Qtd Aberta": round(open_shares, 2),
                        "Custo Médio": round(avg_cost, 4),
                        "Preço Atual": round(current_price, 4) if open_shares > 0 else "-",
                        "Valor Atual": round(current_value, 2),
                        "Ganho Realizado (€)": round(realized_gain, 2),
                        "Ganho Não Realizado (€)": round(unrealized_gain, 2),
                        "Ganho Total (€)": round(total_gain, 2),
                        "ROI Total %": round(roi_total_ticker, 2),
                    })

                if combos:
                    total_realized = sum(p["realized_gain"] for p in portfolio_data)
                    total_unrealized = sum(
                        (last_prices.get(p["ticker"], p["avg_cost"]) - p["avg_cost"]) * p["open_shares"]
                        for p in portfolio_data if p["open_shares"] > 0
                    )
                    total_current_value = sum(
                        last_prices.get(p["ticker"], 0) * p["open_shares"]
                        for p in portfolio_data if p["open_shares"] > 0
                    )
                    total_invested_all = sum(p["total_invested"] for p in portfolio_data)
                    total_gain_all = total_realized + total_unrealized
                    roi_total_all = (total_gain_all / total_invested_all) * 100 if total_invested_all else 0

                    st.subheader("Rentabilidade total do portfólio")
                    col1, col2 = st.columns(2)
                    with col1:
                        st.metric("Ganho Realizado (€)", f"{total_realized:,.2f}")
                        st.metric("Ganho Não Realizado (€)", f"{total_unrealized:,.2f}")
                    with col2:
                        st.metric("Valor Atual Posição Aberta (€)", f"{total_current_value:,.2f}")
                        st.metric("ROI Total do Portfólio (%)", f"{roi_total_all:.2f}%")

                    with st.spinner("A carregar evolução semanal do ROI..."):
                        df_weekly_roi = calc_weekly_roi(
                            df, "ticker", "date", "pricebuy", "shares", type_col="type"
                        )
                    if not df_weekly_roi.empty:
                        st.subheader("Evolução do ROI do portfólio (semana a semana)")
                        start_date = df_weekly_roi["date"].min()
                        df_sp500 = fetch_sp500_weekly_roi(str(start_date.date()))
                        df_weekly_sorted = df_weekly_roi.copy()
                        df_weekly_sorted["date"] = pd.to_datetime(df_weekly_sorted["date"]).dt.normalize().astype("datetime64[ns]")
                        df_sp500_sorted = df_sp500.copy()
                        df_sp500_sorted["date"] = pd.to_datetime(df_sp500_sorted["date"]).dt.normalize().astype("datetime64[ns]")
                        df_weekly_sorted = df_weekly_sorted.sort_values("date")
                        df_sp500_sorted = df_sp500_sorted.sort_values("date")
                        df_merge = pd.merge_asof(df_weekly_sorted, df_sp500_sorted, on="date", direction="nearest")
                        st.line_chart(df_merge, x="date", y=["ROI Acumulado", "ROI SP500 (%)"])

                    st.subheader("Resumo consolidado por ticker")
                    st.dataframe(combos, use_container_width=True)

                    open_combos = [c for c in combos if c["Qtd Aberta"] > 0]
                    if open_combos:
                        st.subheader("Ganho não realizado por ticker (posição aberta)")
                        st.bar_chart(data=open_combos, x="Ticker", y="Ganho Não Realizado (€)", color="Ticker")

                        st.subheader("Divisão do portfólio (posição aberta)")
                        df_combo = pd.DataFrame(open_combos)
                        df_pizza = pd.DataFrame({
                            "Categoria": df_combo["Ticker"],
                            "Valores": df_combo["Valor Atual"],
                        })
                        fig = px.pie(df_pizza, values="Valores", names="Categoria", hole=0.5)
                        st.plotly_chart(fig)
            
        except FileNotFoundError:
           st.error("Arquivo não compatível")


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



#def render_chatbot_gemini():
    
