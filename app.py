import streamlit as st
import yfinance as yf
import pandas as pd

st.title("📈 Calculadora de Rendimentos")

st.markdown("Para saber mais sobre os tickers, visite o [Yahoo Finance](https://finance.yahoo.com/).")
st.write("Nota: basta pesquisar o nome do ativo financeiro na barra <pesquisar> do Yahoo Finance e depois verificar o Ticker do seu ativo.")
my_tickers = [ "SXR8.DE-MSCI SP500", "SEC0D.XD-MSCI Semiondutores", "EMIMA.XD-MSCI IMI EME", "EUNK.DE-MSCI Europe", "Outro ativo (digite...)"]

choice = st.selectbox( 
    "Como deseja calcular?", ("Apenas um ativo - manual", "Múltiplos ativos - manual", "Importar dados - CSV") )

if choice == "Apenas um ativo - manual":
    st.title("Apenas um ativo manualmente")
    
    #ticker_symbol = st.text_input("Ticker do Ativo (ex: AAPL ou PETR4.SA):", value="AAPL")
    ticker_symbol = st.selectbox("Digite o ativo que deseja ou digite para filtrar:", options=my_tickers)
    if  ticker_symbol == "Outro ativo (digite...)":
        ticker_symbol = st.text_input("Ticker do Ativo (ex: AAPL ou PETR4.SA):", value="AAPL")
    
    ticker_symbol_partes = ticker_symbol.split("-",1)
    share_input = st.text_input("Quantidade de shares:", value="1")
    price_input = st.text_input("Preço de compra:", value="150")

    if st.button("Calcular"):
        try:
            shares = float(share_input.replace(',', '.'))
            price_buy = float(price_input.replace(',','.'))
            
            ticker_data = yf.Ticker(ticker_symbol_partes[0])
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


if choice == "Múltiplos ativos - manual":
    st.title("Múltiplos ativos manualmente")
    qnt_orders = st.number_input("Nº de ordens:", min_value=1, value=4)
    dados_ordens = []
       
    with st.form("multi_orders"):
        st.write("Insira os dados de cada ordem:")

        for i in range(int(qnt_orders)):
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                # 1. Mudamos a chave para não conflitar
                sel = st.selectbox(f"Ticker {i+1}", options=my_tickers, key=f"sel_{i}")
                # 2. O campo manual fica aqui, visível para preenchimento
                man = st.text_input(f"Se 'Outro', digite:", key=f"man_{i}", help="Digite o ticker (ex: TSLA)")
                
            with col2:
                st.text_input(f"Qtd {i+1}", value="1.0", key=f"q_{i}")
            with col3: 
                st.text_input(f"Preço de compra {i+1}", value="150.0", key=f"p_{i}")
            with col4: 
                st.text_input(f"Data {i+1}", value="25-10-2023", key=f"d_{i}")
            st.divider()
            
        submit = st.form_submit_button("Calcular Todos")
    
    if submit: 
        for i in range(int(qnt_orders)):
            try:
                # 3. Lógica de decisão: Qual ticker usar?
                ticker_final = st.session_state[f"man_{i}"] if st.session_state[f"sel_{i}"] == "Outro ativo (digite...)" else st.session_state[f"sel_{i}"]
                
                # Limpeza e captura de dados
                t_clean = ticker_final.split("-")[0].strip()
                q = float(st.session_state[f"q_{i}"].replace(',', '.'))
                p = float(st.session_state[f"p_{i}"].replace(',', '.'))
                d = st.session_state[f"d_{i}"]

                # Consulta API
                ticker_api = yf.Ticker(t_clean)
                # fast_info é mais rápido que .info para loops
                today_price = ticker_api.fast_info['last_price']

                gain = (today_price - p) * q
                roi = ((today_price - p) / p) * 100

                # 4. Adiciona à lista DENTRO do try para evitar erros de variáveis vazias
                dados_ordens.append({
                    "Data Compra": d,
                    "Ticker": t_clean,
                    "Qtd": q,
                    "Preço Compra": f"{p:.2f}",
                    "Preço Atual": f"{today_price:.2f}",
                    "Ganho": round(gain, 2),
                    "ROI (%)": f"{roi:.2f}%"
                })
            except Exception as e:
                st.error(f"Erro no ticker {i+1}: Ativo não encontrado ou dados inválidos.")

        if dados_ordens:
            st.subheader("Resumo do Portfólio")
            df_final = pd.DataFrame(dados_ordens)
            st.dataframe(df_final, use_container_width=True)

if choice == "Importar dados - CSV":

    st.title("Dados através de um CSV")