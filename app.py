import streamlit as st
import yfinance as yf

st.title("📈 Calculadora de Rendimentos")

# First setp (choice)

choice = st.selectbox( 
    "Como deseja calcular?", ("Apenas um ativo", "Múltiplos ativos") )

if choice == "Apenas um ativo":
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


if choice == "Múltiplos ativos":
    qnt_orders = st.number_input("Insira o nº de ordens que quer calcular os ganhos/perdas: ", value=4)
       
    with st.form("multi_orders"):
        st.write("Insira os dados de cada ordem:")

        for i in range (int(qnt_orders)):
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.text_input(f"Ticker {i+1}", value="AAPL", key=f"t_{i}")
            with col2:
                st.text_input(f"Qtd {i+1}", value="1.0", key=f"q_{i}")
            with col3: 
                st.text_input(f"Preço de compora: {i+1}", value="150.0", key=f"p_{i}")
            with col4: 
                st.text_input(f"Dats de compora: {i+1}", value="25-10-2023", key=f"d_{i}")
            
        submit = st.form_submit_button("Calcular Todos")
    
    if submit: 
        for i in range(int(qnt_orders)):
            # Recuperamos os valores usando as chaves únicas
            t = st.session_state[f"t_{i}"]
            q = float(st.session_state[f"q_{i}"].replace(',', '.'))
            p = float(st.session_state[f"p_{i}"].replace(',', '.'))
            d = st.session_state[f"d_{i}"]

            today_price = yf.Ticker(t).info['regularMarketPrice']

            gain = (today_price - p) * q
            roi = ((today_price - p) / p) * 100

            st.write(f"Data: {d} | Ticker: {t} | Shares: {q} | Gain: {gain} | ROI (‰): {roi} ")


