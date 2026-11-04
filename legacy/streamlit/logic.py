import os
import time

import pandas as pd
import streamlit as st
import yfinance as yf
from yfinance.exceptions import YFRateLimitError


def _to_float(value):
    return float(str(value).replace(",", ".").strip())
    

def _strip_tz(idx):
    if idx.tz is not None:
        return idx.tz_convert(None)
    return idx


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_weekly_history(tickers_tuple, start_str):
    hist: dict = {}
    start = pd.Timestamp(start_str)

    for ticker in tickers_tuple:
        try:
            data = yf.Ticker(ticker).history(start=start, interval="1wk", auto_adjust=True)
            if not data.empty and "Close" in data.columns:
                series = data["Close"].copy()
                series.index = _strip_tz(pd.DatetimeIndex(series.index))
                hist[ticker] = series
        except Exception:
            pass

    if not hist:
        return pd.DataFrame()

    df = pd.DataFrame(hist)
    df.index = pd.DatetimeIndex(df.index)
    return df


def calc_weekly_roi(orders_df, ticker_col, date_col, pricebuy_col, shares_col, type_col):
    # Devolve DataFrame com colunas ['date', 'ROI Acumulado'] (semanal, sem timezone).
    # Suporta ordens de compra e venda via type_col ('buy'/'sell').
    # ROI = (valor_atual + total_recebido_vendas - total_investido) / total_investido * 100
    df = orders_df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col]).sort_values(date_col)

    has_types = type_col and type_col in df.columns
    if has_types:
        df[type_col] = df[type_col].astype(str).str.strip().str.lower().fillna("buy")
    else:
        df["_type"] = "buy"
        type_col = "_type"

    if df.empty:
        return pd.DataFrame(columns=["date", "ROI Acumulado"])

    min_date = df[date_col].min()
    tickers = tuple(df[ticker_col].unique())

    hist = fetch_weekly_history(tickers, str(min_date.date()))

    if hist.empty:
        return pd.DataFrame(columns=["date", "ROI Acumulado"])

    today_ts = pd.Timestamp.now().normalize()

    market_dates = list(hist.index)
    if not market_dates or pd.Timestamp(market_dates[-1]).normalize() < today_ts:
        market_dates.append(today_ts)

    roi_series = []
    for week_date in market_dates:
        week_ts = pd.Timestamp(week_date).normalize()

        orders_before = df[df[date_col].dt.normalize() <= week_ts].sort_values(date_col)
        if orders_before.empty:
            continue

        # Simular posições acumuladas até esta semana
        total_invested = 0.0
        total_received = 0.0
        positions = {}  # ticker -> (open_shares, avg_cost)

        for _, row in orders_before.iterrows():
            ticker = str(row[ticker_col])
            shares = float(row[shares_col])
            price = float(row[pricebuy_col])
            order_type = str(row[type_col])

            cur_shares, cur_avg = positions.get(ticker, (0.0, 0.0))

            if order_type == "buy":
                total_invested += price * shares
                new_avg = (cur_avg * cur_shares + price * shares) / (cur_shares + shares)
                positions[ticker] = (cur_shares + shares, new_avg)
            elif order_type == "sell":
                total_received += price * shares
                positions[ticker] = (max(cur_shares - shares, 0.0), cur_avg)

        if total_invested <= 0:
            continue

        # Valor atual das posições abertas
        total_value = 0.0
        for ticker, (open_shares, avg_cost) in positions.items():
            if open_shares <= 0:
                continue
            if ticker in hist.columns:
                col = hist[ticker].dropna()
                valid = col[col.index <= week_ts]
                price = float(valid.iloc[-1]) if not valid.empty else avg_cost
            else:
                price = avg_cost
            total_value += open_shares * price

        roi = (total_value + total_received - total_invested) / total_invested * 100
        roi_series.append({"date": week_ts, "ROI Acumulado": round(roi, 2)})

    return pd.DataFrame(roi_series)


def calc_portfolio_with_sells(df):
    # Calcula posições abertas, custo médio ponderado e ganho realizado por ticker.
    # Processa ordens cronologicamente: compras atualizam o custo médio, vendas realizam ganhos.
    result = []

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"], errors="coerce") #converte a string para um DataTime
    df = df.dropna(subset=["date"]).sort_values("date") #deita fora as linhas com datas inválidas e ordena por ordem

    for ticker in df["ticker"].unique():
        bloco = df[df["ticker"] == ticker].sort_values("date")

        avg_cost = 0.0
        open_shares = 0.0
        realized_gain = 0.0
        total_invested = 0.0
        total_received = 0.0

        for _, row in bloco.iterrows():
            pricebuy = row["pricebuy"]
            shares = row["shares"]
            order_type = str(row["type"])

            if order_type == "buy":
                total_invested += pricebuy * shares
                avg_cost = (avg_cost * open_shares + pricebuy * shares) / (open_shares + shares)
                open_shares += shares
            elif order_type == "sell":
                total_received += pricebuy * shares
                realized_gain += (pricebuy - avg_cost) * shares
                open_shares = max(open_shares - shares, 0.0)

        result.append({
            "ticker": ticker,
            "open_shares": round(open_shares, 6),
            "avg_cost": round(avg_cost, 4),
            "realized_gain": round(realized_gain, 2),
            "total_invested": round(total_invested, 2),
            "total_received": round(total_received, 2),
        })

    return result

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_sp500_weekly_roi(start_date_str):
    data = yf.Ticker("^GSPC").history(start=start_date_str, interval="1wk", auto_adjust=True)
    if data.empty or "Close" not in data.columns:
        return pd.DataFrame(columns=["date", "ROI SP500 (%)"])
    data.index = _strip_tz(pd.DatetimeIndex(data.index)).normalize() # Tornar Data - Hora em só Data
    base_price = data["Close"].iloc[0]
    return pd.DataFrame({
        "date": data.index,
        "ROI SP500 (%)": ((data["Close"] / base_price - 1) * 100).round(2)
    })


def process_ticket(ticket, buy_price, shares):
    ticker_api = yf.Ticker(ticket)
    # fast_info é mais rápido que .info para loops
    today_price = ticker_api.fast_info['last_price']

    gain = (today_price - buy_price) * shares
    roi = ((today_price - buy_price) / buy_price) * 100

    results = [gain, roi, today_price]

    return results


def csv_download_import():
    base_path = os.path.dirname(__file__)
    file_path = os.path.join(base_path, "modelo_site_ativos.csv")

    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            st.download_button(
                label="Download do modelo CSV",
                data=f,
                file_name="modelo_investimentos.csv",
                mime="text/csv"
            )
    else:
        st.warning("Modelo CSV não encontrado no servidor.")
    
    return st.file_uploader("Carrega para aqui o seu ficheiro CSV", type="csv")

@st.cache_data(ttl=1800, show_spinner=False)
def type_ticket(ticket):
    ticker = str(ticket).strip().upper()
    ticker_api = yf.Ticker(ticker)

    # Tentativa leve (quando disponível no fast_info).
    try:
        fast_info = ticker_api.fast_info
        if hasattr(fast_info, "get"):
            for key in ("quoteType", "quote_type", "instrument_type", "type"):
                value = fast_info.get(key)
                if value:
                    return str(value)
    except Exception:
        pass

    # Fallback para .info com backoff para evitar bursts no Yahoo.
    delay = 1.0
    for attempt in range(3):
        try:
            value = ticker_api.info.get("quoteType")
            return value or "N/A"
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).lower()
            is_rate_limit = (
                isinstance(exc, YFRateLimitError)
                or "rate limit" in msg
                or "too many requests" in msg
            )
            if not is_rate_limit or attempt == 2:
                return "N/A"
            time.sleep(delay)
            delay *= 2

    return "N/A"
