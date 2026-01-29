import streamlit as st
import yfinance as yf
import pandas as pd

st.title("📈 Calculadora de Rendimentos")

st.markdown("Para saber mais sobre os tickers, visite o [Yahoo Finance](https://finance.yahoo.com/).")
st.write("Nota: basta pesquisar o nome do ativo financeiro na barra <pesquisar> do Yahoo Finance e depois verificar o Ticker do seu ativo.")
my_tickers = [ "SXR8.DE-MSCI SP500", "SEC0D.XD-MSCI Semiondutores", "EMIMA.XD-MSCI IMI EME", "EUNK.DE-MSCI Europe", "Outro ativo (digite...)"]

choice = st.selectbox( 
    "Como deseja calcular?", ("Apenas um ativo", "Múltiplos ativos") )

if choice == "Apenas um ativo":

    
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


if choice == "Múltiplos ativos":
    qnt_orders = st.number_input("Nº de ordens:", min_value=1, value=4)
    
    # Lista para armazenar os dados coletados
    dados_ordens = []

    # Se você quer dinamismo (aparecer/sumir campos), evite o st.form para a entrada
    # ou aceite que o campo de texto deve estar sempre visível se "Outro" for uma opção.
    
    with st.form("multi_orders"):
        st.write("Insira os dados de cada ordem:")

        for i in range(int(qnt_orders)):
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                # Selectbox normal
                ticker_sel = st.selectbox(f"Ticker {i+1}", options=my_tickers, key=f"t_sel_{i}")
                # Campo extra sempre visível ou condicional ao submit
                ticker_manual = st.text_input(f"Se 'Outro', digite aqui {i+1}", key=f"manual_{i}")
                
            with col2:
                st.text_input(f"Qtd {i+1}", value="1.0", key=f"q_{i}")
            with col3: 
                st.text_input(f"Preço de compra {i+1}", value="150.0", key=f"p_{i}")
            with col4: 
                st.text_input(f"Data de compra {i+1}", value="2023-10-25", key=f"d_{i}")
            st.divider()

        submit = st.form_submit_button("Calcular Todos")
    
    if submit: 
        for i in range(int(qnt_orders)):
            # Lógica para escolher o ticker correto
            sel = st.session_state[f"t_sel_{i}"]
            man = st.session_state[f"manual_{i}"]
            
            # Se selecionou outro, usa o manual, senão usa o do selectbox
            t_final_name = man if sel == "Outro ativo (digite...)" else sel
            
            # Limpeza do ticker (ex: remover descrição após o hífen se houver)
            ticker_clean = t_final_name.split("-")[0].strip()

            try:
                # Conversão de valores
                q = float(st.session_state[f"q_{i}"].replace(',', '.'))
                p = float(st.session_state[f"p_{i}"].replace(',', '.'))
                
                # Busca no Yahoo Finance
                ticker_data = yf.Ticker(ticker_clean)
                # Dica: .info pode ser lento em loops, use .fast_info se disponível
                today_price = ticker_data.fast_info['last_price']

                gain = (today_price - p) * q
                roi = ((today_price - p) / p) * 100
                
                st.success(f"{ticker_clean}: Ganho de R$ {gain:.2f} ({roi:.2f}%)")
            except Exception as e:
                st.error(f"Erro ao processar {ticker_clean}: {e}")

    # Preencher a lista com os múltiplos ativos 
            lista_ativos.append({
                    "Date": d,
                    "Ticker": t,
                    "Shares": q,
                    "Buy Price": f"{p:.2f}€",
                    "Gain (€)": round(gain, 2),
                    "ROI (%)": f"{roi:.2f}%"
                })

    if lista_ativos:
        # Divisão 
        st.divider()        
        st.subheader("Resumo do portfólio")
    
        df_final = pd.DataFrame(lista_ativos)
        st.dataframe(df_final, use_container_width=True)