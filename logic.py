import streamlit as st
import yfinance as yf
import pandas as pd
import os

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

def type_ticket(ticket):
    return yf.Ticker(ticket).info.get("quoteType")


def _to_float(text: str, label: str) -> float:
    try:
        return float(str(text).replace(",", "."))
    except ValueError:
        raise ValueError(f"{label} inválido: use número (ex: 123.45)")
