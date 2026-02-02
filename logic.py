import streamlit as st
import yfinance as yf
import pandas as pd

def process_ticket(ticket, buy_price, shares):
    ticker_api = yf.Ticker(ticket)
    # fast_info é mais rápido que .info para loops
    today_price = ticker_api.fast_info['last_price']

    gain = (today_price - buy_price) * shares
    roi = ((today_price - buy_price) / buy_price) * 100

    results = [gain, roi, today_price]

    return results


def csv_download_import():
    try:
        with open("modelo_site_ativos.csv", "rb") as f:
            conteudo_do_arquivo = f.read() 
            
        st.download_button(
            label="📥 Download do modelo CSV",
            data=conteudo_do_arquivo,
            file_name="modelo_investimentos.csv",
            mime="text/csv"
        )
    except FileNotFoundError:
        st.error("O arquivo 'modelo_ativos.csv' não foi encontrado no servidor.")

    
    return st.file_uploader("Carrega para aqui o seu ficheiro CSV", type="csv")