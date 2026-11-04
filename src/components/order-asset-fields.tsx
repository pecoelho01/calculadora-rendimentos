import { useState } from "react";
import type { Order } from "@/lib/types";

export function OrderAssetFields({ orders }: { orders: Order[] }) {
  const [selectedTicker, setSelectedTicker] = useState("");
  const [name, setName] = useState("");
  const assets = new Map<string, string>();
  for (const order of orders) {
    assets.set(order.ticker, order.name || assets.get(order.ticker) || "");
  }

  return (
    <>
      {assets.size > 0 ? (
        <label className={selectedTicker ? undefined : "order-asset-choice"}>
          Ativo da transação
          <select
            name={selectedTicker ? "ticker" : undefined}
            value={selectedTicker}
            onChange={(event) => {
              const ticker = event.target.value;
              setSelectedTicker(ticker);
              setName(assets.get(ticker) ?? "");
            }}
          >
            <option value="">Novo ticker</option>
            <optgroup label="Tickers da carteira">
              {[...assets].sort(([a], [b]) => a.localeCompare(b)).map(([ticker, assetName]) => (
                <option key={ticker} value={ticker}>
                  {assetName ? `${ticker} · ${assetName}` : ticker}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      ) : null}
      {!selectedTicker ? (
        <label>
          Ticker Yahoo
          <input name="ticker" required placeholder="AAPL" maxLength={25} />
        </label>
      ) : null}
      <label>
        Nome do ativo
        <input
          name="name"
          placeholder="Apple"
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </>
  );
}
