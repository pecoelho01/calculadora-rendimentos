# 📈 Asset Yield Calculator

An interactive web application built with Python to monitor investment performance for single or multiple assets in real-time.

### 🔗 Live Project: 
**[https://calculadora-rendimentos.streamlit.app/](https://calculadora-rendimentos.streamlit.app/)**

---

## 📖 About the Project
This project evolved from a simple calculation script into a versatile financial tool. Using the **Streamlit** framework and **Yahoo Finance API**, it allows users to track their portfolio's health by calculating gains and ROI (Return on Investment) based on current market prices.

## ✨ Features
* **Dual Calculation Modes**: Choose between analyzing a single asset or batch-processing multiple orders.
* **Dynamic Forms**: For multiple assets, the app generates a specific number of input fields (Ticker, Quantity, Purchase Price, and Date) based on your needs.
* **Real-time Market Data**: Fetches the most recent closing prices automatically using `yfinance`.
* **Visual Metrics**: View single-asset results with professional dashboard metrics (including green/red delta indicators).
* **Batch Summary**: Process and list all your orders at once with a single click.

## 🛠️ Technologies Used
* **Python**: The core programming language.
* **Streamlit**: For the interactive web interface.
* **yfinance**: For fetching financial market data.
* **Pandas**: For structured data handling and table visualization (optional but recommended).

## 🚀 How to Run Locally
1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/pecoelho01/calculadora-rendimentos.git](https://github.com/pecoelho01/calculadora-rendimentos.git)
    ```
2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the app**:
    ```bash
    streamlit run app.py
    ```

## 📂 File Structure
* `app.py`: The main application logic and UI.
* `requirements.txt`: List of Python packages required for deployment.
* `.devcontainer/`: Configuration for standardized development environments.