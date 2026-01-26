import streamlit as st
import yfinance as yf

st.title("📈 Calculadora de Rendimentos")

# Inputs
ticker_symbol = st.text_input("Ticker do Ativo (ex: AAPL ou PETR4.SA):", value="AAPL")
share_input = st.text_input("Quantidade de shares:", value="1")
price_input = st.text_input("Preço de compra:", value="150")

if st.button("Calcular"):
    try:
        shares = float(share_input.replace(',', '.'))
        price_buy = float(price_input.replace(',','.'))
        
        ticker_data = yf.Ticker(ticker_symbol)
        # Pegando o preço mais recente
        df = ticker_data.history(period="1d")
        
        if not df.empty:
            today_price = df['Close'].iloc[-1]
            gain = (today_price - price_buy) * shares
            roi = ((today_price - price_buy) / price_buy) * 100
            
            st.divider()
            st.metric("Preço Atual", f"{today_price:.2f}")
            st.metric("Ganho Total", f"{gain:.2f} €", delta=f"{gain:.2f}")
            st.metric("ROI", f"{roi:.2f}%", delta=f"{roi:.2f}%")
        else:
            st.error("Dados não encontrados para este ticker.")
    except Exception as e:
        st.error("Erro nos dados inseridos. Verifique os valores.")