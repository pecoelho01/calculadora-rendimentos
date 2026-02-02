import streamlit as st
import yfinance as yf
import pandas as pd

st.title("📈 Calculadora de Rendimentos")

st.markdown("Para saber mais sobre os tickers, visite o [Yahoo Finance](https://finance.yahoo.com/).")
st.write("Nota: basta pesquisar o nome do ativo financeiro na barra <pesquisar> do Yahoo Finance e depois verificar o Ticker do seu ativo.")
my_tickers = [ "SXR8.DE-MSCI SP500", "SEC0D.XD-MSCI Semiondutores", "EMIMA.XD-MSCI IMI EME", "EUNK.DE-MSCI Europe", "Outro ativo (digite...)"]

choice = st.selectbox( 
    "Como deseja calcular?", ("Calcular ativos manualmente", "Importar dados - CSV") )

if choice == "Calcular ativos manualmente":
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
    #model_file = "modelo_site_ativos.csv"

    st.title("Dados via CSV")
    st.text("Aqui está um modelo para colocar os dados dos seus ativos financeiros e depois importar")
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

    file = st.file_uploader("Carrega para aqui o seu ficheiro CSV", type="csv")

    if file is not None:
        try:
            df = pd.read_csv(file, sep=None, engine="python")

            df["price_buy"] = df["price_buy"].astype(str).str.replace(",", ".", regex=False).astype(float)
            df["shares"] = df["shares"].astype(str).str.replace(",", ".", regex=False).astype(float)
            colunaDate = df["date"]
            colunaTicker = df["ticker"]
            colunaPriceBuy = df["price_buy"]
            colunaShares = df["shares"]

            dados_finais = []

            if st.button("Calcular share-to-share"):

                for i in range(len(colunaDate)):
                    current_price = yf.Ticker(colunaTicker[i]).fast_info['last_price']

                    gain = (current_price - colunaPriceBuy[i]) * colunaShares[i]
                    roi = ((current_price - colunaPriceBuy[i]) / colunaPriceBuy[i]) * 100

                    dados_finais.append({
                        "Date": colunaDate[i],
                        "Ticker": colunaTicker[i],
                        "Price Buy": colunaPriceBuy[i],
                        "Shares": colunaShares[i],
                        "GAIN(euros)": round(gain,2),
                        "ROI %": round(roi,2)
                    }) 
                st.subheader("Resumo do Portfólio")
                df_final_ = pd.DataFrame(dados_finais)
                st.dataframe(df_final_, use_container_width=True)

                st.subheader("ROI por ativos - comparação")
                st.bar_chart(data=df_final, x="Ticker", y="ROI %")

           # if st.button("Calcular o combo de cada ativo "):
            #    for i in range(len(colunaDate)):
             #       current_price = 


        except FileNotFoundError:
            st.error("Arquivo não compatível")

