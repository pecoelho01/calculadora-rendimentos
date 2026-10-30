"use client";
import { useState } from "react";
type Point = { date: string; roi: number | null; benchmark: number | null };
const periods = ["3M", "6M", "1A", "Tudo"] as const;
export function PerformanceChart({ data }: { data: Point[] }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>("Tudo");
  const cutoff = new Date();
  cutoff.setUTCMonth(
    cutoff.getUTCMonth() - { "3M": 3, "6M": 6, "1A": 12, Tudo: 1200 }[period],
  );
  const points = data.filter(
    (p) => p.date >= cutoff.toISOString().slice(0, 10),
  );
  const values = points
    .flatMap((p) => [p.roi, p.benchmark])
    .filter((n): n is number => n !== null);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min || 1;
  const x = (i: number) => 55 + (i / Math.max(1, points.length - 1)) * 865;
  const y = (v: number) => 195 - ((v - min) / span) * 160;
  const path = (key: "roi" | "benchmark") => {
    let connected = false;
    return points
      .map((p, i) => {
        const v = p[key];
        if (v === null) {
          connected = false;
          return "";
        }
        const command = connected ? "L" : "M";
        connected = true;
        return `${command}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      })
      .join(" ");
  };
  return (
    <section className="panel performance">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">O TEU PERCURSO</span>
          <h2>Evolução da rentabilidade</h2>
        </div>
        <div className="segments" aria-label="Período do gráfico">
          {periods.map((p) => (
            <button
              key={p}
              aria-pressed={p === period}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {values.length && points.some((p) => p.roi !== null) ? (
        <>
          <svg
            viewBox="0 0 950 235"
            role="img"
            aria-label="ROI acumulado da carteira e rentabilidade do S&P 500 por semana"
          >
            <title>Rentabilidade semanal em percentagem</title>
            {[0, 1, 2, 3, 4].map((i) => {
              const v = min + (span * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1="55"
                    x2="920"
                    y1={y(v)}
                    y2={y(v)}
                    stroke="#e9edf2"
                    strokeDasharray="4 5"
                  />
                  <text
                    x="42"
                    y={y(v) + 4}
                    textAnchor="end"
                    className="chart-label"
                  >
                    {v.toFixed(0)}%
                  </text>
                </g>
              );
            })}
            <path
              d={path("benchmark")}
              stroke="#a8b1c2"
              strokeWidth="2"
              fill="none"
              strokeDasharray="5 5"
            />
            <path
              d={path("roi")}
              stroke="#7047eb"
              strokeWidth="3"
              fill="none"
              strokeLinejoin="round"
            />
            {[0, Math.floor((points.length - 1) / 2), points.length - 1]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((i) => (
                <text
                  key={i}
                  x={x(i)}
                  y="225"
                  textAnchor="middle"
                  className="chart-label"
                >
                  {points[i].date}
                </text>
              ))}
          </svg>
          <div className="legend">
            <span>
              <i className="dot purple" /> A tua carteira
            </span>
            <span>
              <i className="dot gray" /> S&P 500 · índice em USD
            </span>
          </div>
          <p className="fine-print">
            ROI sobre todas as compras; o índice usa o primeiro fecho
            disponível. Sem dividendos, comissões ou conversão cambial. As
            falhas de preços aparecem como interrupções.
          </p>
        </>
      ) : (
        <div className="chart-empty">
          <span className="empty-symbol">↗</span>
          <h3>O teu percurso começa aqui</h3>
          <p>
            A evolução aparece quando existirem transações e preços históricos
            compatíveis.
          </p>
        </div>
      )}
    </section>
  );
}
