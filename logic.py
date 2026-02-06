import streamlit as st
import yfinance as yf
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import os

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

def type_ticket(ticket):
    return yf.Ticker(ticket).info.get("quoteType")


# Cache o tipo de ativo para evitar chamadas repetidas ao Yahoo Finance
# quando o mesmo ticker aparece em várias linhas/execuções próximas.
@st.cache_data(ttl=3600)
def cached_type_ticket(ticket: str):
    return yf.Ticker(ticket).info.get("quoteType")


# Cache do último preço para reduzir chamadas repetidas à API.
@st.cache_data(ttl=300)
def cached_last_price(ticket: str):
    return yf.Ticker(ticket).fast_info.get("last_price")

    
def _fetch_prices_parallel(tickers):
    """Busca preços em paralelo (ThreadPool) e reaproveita cache do ticker."""
    max_workers = max(1, min(8, len(tickers)))
    prices = {}
    with ThreadPoolExecutor(max_workers=max_workers) as exe:
        future_map = {exe.submit(cached_last_price, t): t for t in tickers}
        for fut in as_completed(future_map):
            t = future_map[fut]
            try:
                prices[t] = fut.result()
            except Exception:
                prices[t] = None
    return prices
