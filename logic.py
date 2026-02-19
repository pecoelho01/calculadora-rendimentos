import os
import time

import pandas as pd
import streamlit as st
import yfinance as yf
from yfinance.exceptions import YFRateLimitError

def _to_float(text: str, label: str) -> float:
    try:
        return float(str(text).replace(",", "."))
    except ValueError:
        raise ValueError(f"{label} inválido: use número (ex: 123.45)")

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
                label="📥 Download do modelo CSV",
                data=f,
                file_name="modelo_investimentos.csv",
                mime="text/csv"
            )
    else:
        st.warning("⚠️ Modelo CSV não encontrado no servidor.")
    
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


def _to_float(text: str, label: str) -> float:
    try:
        return float(str(text).replace(",", "."))
    except ValueError:
        raise ValueError(f"{label} inválido: use número (ex: 123.45)")
