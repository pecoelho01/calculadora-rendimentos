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