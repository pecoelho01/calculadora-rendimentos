import os

import pandas as pd
import requests
import streamlit as st
import yfinance as yf

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


def search_yahoo_tickers(query: str, max_results: int = 8):
    """Busca símbolos no Yahoo Finance por nome ou ISIN.

    Usa o endpoint público de busca do Yahoo; não requer API key.
    """
    url = "https://query1.finance.yahoo.com/v1/finance/search"
    params = {
        "q": query.strip(),
        "quotesCount": max_results,
        "newsCount": 0,
        "enableFuzzyQuery": True,
    }

    try:
        res = requests.get(url, params=params, timeout=6)
        res.raise_for_status()
        data = res.json()
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Erro ao consultar Yahoo Finance: {exc}") from exc

    quotes = data.get("quotes", []) if isinstance(data, dict) else []
    cleaned = []
    for item in quotes:
        cleaned.append(
            {
                "symbol": item.get("symbol"),
                "nome": item.get("longname") or item.get("shortname"),
                "tipo": item.get("quoteType"),
                "bolsa": item.get("exchange"),
                "moeda": item.get("currency"),
                "score": item.get("score"),
                "isin": item.get("isin"),
            }
        )
    return cleaned
