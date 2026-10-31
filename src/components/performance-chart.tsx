"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  calculatePerformance,
  performancePeriods as periods,
  type PerformancePoint as Point,
  type PerformancePeriod,
} from "@/lib/portfolio";
import { Icon } from "./icon";
import type { Currency, MarketData, Order } from "@/lib/types";
const percent = (value: number | null) =>
  value === null
    ? "Indisponível"
    : `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-PT", {
    timeZone: "UTC",
  });
export function PerformanceChart({
  orders,
  market,
  currency,
}: {
  orders: Order[];
  market: MarketData;
  currency: Currency;
}) {
  const [selection, setSelection] = useState<{
    data: Point[];
    index: number;
  } | null>(null);
  const [period, setPeriod] = useState<PerformancePeriod>("Máximo");
  const endDate = new Date().toISOString().slice(0, 10);
  const performance = useMemo(
    () => calculatePerformance(orders, market, currency, period, endDate),
    [orders, market, currency, period, endDate],
  );
  const { data, roi: currentRoi, openRoi: currentOpenRoi } = performance;
  const [mode, setMode] = useState<"total" | "open">("open");
  const displayedRoi = mode === "total" ? currentRoi : currentOpenRoi;
  const modeLabel =
    mode === "total" ? "Rentabilidade total" : "Posições abertas";
  const explanation =
    period === "Máximo"
      ? mode === "total"
        ? "ROI acumulado: ganho total sobre todas as compras"
        : "Ganho não realizado sobre o custo FIFO das posições abertas"
      : mode === "total"
        ? "Ganho do período sobre o valor inicial e as compras do intervalo"
        : "Ganho das posições abertas desde o início do período ou a aquisição";
  const svgRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [chartWidth, setChartWidth] = useState(950);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setChartWidth(panel.clientWidth));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const plotWidth = Math.max(1, chartWidth - 85);
  const points = data.map((p) => ({
    ...p,
    roi: mode === "total" ? p.roi : p.openRoi,
  }));
  const activeIndex = selection?.data === data ? selection.index : null;
  const active = activeIndex === null ? null : points[activeIndex];
  const values = points
    .flatMap((p) => [p.roi, p.benchmark])
    .filter((n): n is number => n !== null);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min || 1;
  const firstTime = points.length ? Date.parse(points[0].date) : 0;
  const timeSpan = points.length
    ? Date.parse(points[points.length - 1].date) - firstTime
    : 0;
  const x = (i: number) =>
    55 +
    (timeSpan ? (Date.parse(points[i].date) - firstTime) / timeSpan : 0) *
      plotWidth;
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
  const selectPoint = (event: PointerEvent<HTMLDivElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const targetTime =
      firstTime +
      Math.max(0, Math.min(1, (position.x - 55) / plotWidth)) * timeSpan;
    const index = points.reduce(
      (nearest, point, i) =>
        Math.abs(Date.parse(point.date) - targetTime) <
        Math.abs(Date.parse(points[nearest].date) - targetTime)
          ? i
          : nearest,
      0,
    );
    setSelection({ data, index });
  };
  return (
    <section ref={panelRef} className="panel performance">
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
              onClick={() => {
                setPeriod(p);
                setSelection(null);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div
        className="performance-modes no-print"
        role="group"
        aria-label="Tipo de rentabilidade"
      >
        {(["open", "total"] as const).map((option) => (
          <button
            key={option}
            aria-pressed={mode === option}
            onClick={() => {
              setMode(option);
              setSelection(null);
            }}
          >
            {option === "total" ? "Rentabilidade total" : "Posições abertas"}
          </button>
        ))}
      </div>
      <div className="performance-current">
        <span>
          {mode === "total"
            ? "Rentabilidade total atual"
            : "Rentabilidade das posições abertas"}{" "}
          · {period}
        </span>
        <strong
          className={
            displayedRoi === null
              ? ""
              : displayedRoi < 0
                ? "negative"
                : "positive"
          }
        >
          {percent(displayedRoi)}
        </strong>
        <small>{explanation}</small>
      </div>
      {values.length > 0 && points.some((p) => p.roi !== null) ? (
        <>
          <div
            className="chart-readout no-print"
            aria-live="polite"
            aria-atomic="true"
          >
            {active ? (
              <>
                <time dateTime={active.date}>
                  {dateLabel(active.date)}
                  {active.current ? " · Atual" : ""}
                </time>
                <span>
                  {modeLabel} <strong>{percent(active.roi)}</strong>
                </span>
                <span>
                  S&P 500 <strong>{percent(active.benchmark)}</strong>
                </span>
              </>
            ) : (
              <span>
                Seleciona uma data para consultar a rentabilidade semanal.
              </span>
            )}
          </div>
          <div
            className="chart-interaction"
            role="slider"
            tabIndex={0}
            aria-label="Data da rentabilidade"
            aria-valuemin={0}
            aria-valuemax={points.length - 1}
            aria-valuenow={activeIndex ?? points.length - 1}
            aria-valuetext={`${dateLabel((active ?? points[points.length - 1]).date)}: ${modeLabel.toLowerCase()} ${percent((active ?? points[points.length - 1]).roi)}, S&P 500 ${percent((active ?? points[points.length - 1]).benchmark)}`}
            onFocus={() => setSelection({ data, index: points.length - 1 })}
            onBlur={() => setSelection(null)}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setSelection(null);
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") event.currentTarget.focus();
              selectPoint(event);
            }}
            onPointerMove={selectPoint}
            onKeyDown={(event) => {
              const index = activeIndex ?? points.length - 1;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? points.length - 1
                    : event.key === "ArrowLeft" || event.key === "ArrowDown"
                      ? Math.max(0, index - 1)
                      : event.key === "ArrowRight" || event.key === "ArrowUp"
                        ? Math.min(points.length - 1, index + 1)
                        : null;
              if (event.key === "Escape") setSelection(null);
              if (next === null) return;
              event.preventDefault();
              setSelection({ data, index: next });
            }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} 235`}
              role="img"
              aria-label={`${modeLabel} e rentabilidade do S&P 500 por semana`}
            >
              <title>Rentabilidade semanal em percentagem</title>
              {[0, 1, 2, 3, 4].map((i) => {
                const v = min + (span * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1="55"
                      x2={chartWidth - 30}
                      y1={y(v)}
                      y2={y(v)}
                      stroke="var(--chart-grid)"
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
                stroke="var(--benchmark)"
                strokeWidth="2"
                fill="none"
                strokeDasharray="5 5"
              />
              <path
                d={path("roi")}
                stroke="var(--accent)"
                strokeWidth="3"
                fill="none"
                strokeLinejoin="round"
              />
              {points.map((point, i) =>
                point.roi !== null &&
                (i === 0 || points[i - 1].roi === null) &&
                (i === points.length - 1 || points[i + 1].roi === null) ? (
                  <circle
                    key={point.date}
                    cx={x(i)}
                    cy={y(point.roi)}
                    r="4"
                    fill="var(--accent)"
                  />
                ) : null,
              )}
              {active && activeIndex !== null ? (
                <g className="chart-cursor no-print" aria-hidden="true">
                  <line
                    x1={x(activeIndex)}
                    x2={x(activeIndex)}
                    y1="30"
                    y2="200"
                    stroke="var(--benchmark)"
                    strokeDasharray="4 4"
                  />
                  {active.roi !== null ? (
                    <circle
                      cx={x(activeIndex)}
                      cy={y(active.roi)}
                      r="5"
                      fill="var(--accent)"
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />
                  ) : null}
                </g>
              ) : null}
              {(timeSpan ? [0, 0.5, 1] : [0]).map((fraction) => (
                <text
                  key={fraction}
                  x={55 + fraction * plotWidth}
                  y="225"
                  textAnchor={
                    fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
                  }
                  className="chart-label chart-date"
                >
                  {new Date(firstTime + fraction * timeSpan).toLocaleDateString(
                    "pt-PT",
                    {
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    },
                  )}
                </text>
              ))}
            </svg>
          </div>
          <div className="legend">
            <span>
              <i className="dot accent" /> {modeLabel}
            </span>
            <span>
              <i className="dot gray" /> S&P 500 · índice em USD
            </span>
          </div>
          <p className="chart-limitations">
            Retorno simples · Sem dividendos, comissões ou câmbio. O S&amp;P 500
            é um índice em USD e não replica os fluxos da carteira.
          </p>
          <details className="chart-methodology">
            <summary>
              Como interpretar o gráfico <Icon name="chevron" />
            </summary>
            <p className="fine-print">
              {mode === "total"
                ? period === "Máximo"
                  ? "Inclui ganhos realizados e não realizados sobre todas as compras."
                  : "Inclui ganhos realizados e não realizados apenas no período selecionado."
                : "Considera as posições que estavam abertas em cada data, com custo FIFO; vendas podem alterar a percentagem."}{" "}
              {period === "Máximo"
                ? "O índice usa o primeiro fecho disponível desde a primeira transação."
                : "As posições iniciais e o índice usam o último fecho anterior ao intervalo. As compras do período entram integralmente na base, independentemente da sua data."}{" "}
              O índice não replica os fluxos da carteira. Retorno simples; não é
              TWR nem anualizado. Sem dividendos, comissões ou conversão
              cambial. As falhas de preços aparecem como interrupções.
            </p>
          </details>
        </>
      ) : (
        <div className="chart-empty">
          <span className="empty-symbol">
            <Icon name="trend" />
          </span>
          <h3>O teu percurso começa aqui</h3>
          <p>
            {mode === "open"
              ? "Sem rentabilidade disponível para as posições abertas neste intervalo. Verifica as posições e os preços históricos necessários."
              : "Sem rentabilidade disponível neste intervalo. Verifica as transações e os preços históricos necessários."}
          </p>
        </div>
      )}
    </section>
  );
}
