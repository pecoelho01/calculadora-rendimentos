import streamlit as st
import yfinance as yf
import pandas as pd
import os

def process_ticket(ticket, buy_price, shares):
    """Calcula ganho/ROI com busca de preço resiliente."""
    ticker_api = yf.Ticker(ticket)

    def _current_price():
        # 1) fast_info (mais rápido)
        try:
            price = ticker_api.fast_info.get("last_price")
            if price is not None:
                return price
        except Exception:
            pass

        # 2) info (alguns ativos só expõem aqui)
        try:
            price = ticker_api.info.get("currentPrice")
            if price is not None:
                return price
        except Exception:
            pass

        # 3) Histórico diário (fallback final)
        try:
            hist = ticker_api.history(period="1d")
            if not hist.empty:
                price = hist["Close"].iloc[-1]
                if pd.notna(price):
                    return float(price)
        except Exception:
            pass

        raise ValueError("Preço atual indisponível para o ticker.")

    today_price = _current_price()

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

    
