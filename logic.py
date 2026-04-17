import os
import time

import pandas as pd
import streamlit as st
import yfinance as yf
from yfinance.exceptions import YFRateLimitError


def _to_float(value):
    return float(str(value).replace(",", ".").strip())
    

def _strip_tz(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
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


def calc_weekly_roi(orders_df, ticker_col, date_col, pricebuy_col, shares_col):
    #Devolve um DataFrame com colunas ['date', 'roi_acum'] (semanal, sem timezone).x
    #Para cada semana (desde a primeira compra até hoje) calcula o ROI acumulado
    #do portfólio usando o preço histórico real de fecho de cada ticker.
    df = orders_df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col]).sort_values(date_col)

    if df.empty:
        return pd.DataFrame(columns=["date", "roi_acum"])

    min_date = df[date_col].min()
    tickers = tuple(df[ticker_col].unique())

    hist = fetch_weekly_history(tickers, str(min_date.date()))

    if hist.empty:
        return pd.DataFrame(columns=["date", "roi_acum"])

    today_ts = pd.Timestamp.now().normalize()

    # Usar as datas de mercado do histórico; adicionar hoje se necessário
    market_dates = list(hist.index)
    if not market_dates or pd.Timestamp(market_dates[-1]).normalize() < today_ts:
        market_dates.append(today_ts)

    roi_series = []
    for week_date in market_dates:
        week_ts = pd.Timestamp(week_date).normalize()

        orders_before = df[df[date_col].dt.normalize() <= week_ts]
        if orders_before.empty:
            continue

        total_cost = (
            orders_before[pricebuy_col].astype(float)
            * orders_before[shares_col].astype(float)
        ).sum()
        if total_cost <= 0:
            continue

        total_value = 0.0
        for _, row in orders_before.iterrows():
            ticker = str(row[ticker_col])
            shares = float(row[shares_col])
            buy_price = float(row[pricebuy_col])

            if ticker in hist.columns:
                col = hist[ticker].dropna()
                valid = col[col.index <= week_ts]
                price = float(valid.iloc[-1]) if not valid.empty else buy_price
            else:
                price = buy_price

            total_value += shares * price

        roi = (total_value - total_cost) / total_cost * 100
        roi_series.append({"date": week_ts, "ROI Acumulado": round(roi, 2)})

    return pd.DataFrame(roi_series)

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
