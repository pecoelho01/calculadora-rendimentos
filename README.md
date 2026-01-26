# 📈 Asset Yield Calculator

A simple and efficient web application to monitor your investment performance in real-time.

### 🔗 Project Link: 
**[https://calculadora-rendimentos.streamlit.app/](https://calculadora-rendimentos.streamlit.app/)**

---

## 📖 About the Project
This project was developed in Python using the Streamlit framework to transform a financial calculation script into an interactive web interface. It uses the `yfinance` library to fetch the latest market quotes and calculate the return on a long position.

## ✨ Features
* **Price Inquiry**: Gets the latest closing price for any ticker supported by Yahoo Finance.
* **Total Gain Calculation**: Calculates absolute profit or loss based on the quantity of shares and purchase price entered.
* **ROI Calculation**: Displays the Return on Investment in percentage format.
* **Interactive Interface**: Allows data entry via text boxes and displays instant visual metrics.

## 🛠️ Technologies Used
* **Python**: The base language of the project.
* **Streamlit**: Used to create the website interface.
* **yfinance**: Responsible for providing updated financial data.

## 🚀 How to Run Locally
If you want to test this code on your computer:

1.  Make sure you have Python installed.
2.  Install the required libraries:
    ```bash
    pip install streamlit yfinance
    ```
3.  Run the command:
    ```bash
    streamlit run app.py
    ```

## 📂 File Structure
* `app.py`: The main application code.
* `requirements.txt`: List of dependencies for deployment on Streamlit Cloud.