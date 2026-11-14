"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import {
  calculatePerformance,
  INTRADAY_MAX_AGE_MINUTES,
  performancePeriods as periods,
  type PerformancePoint as Point,
  type PerformancePeriod,
} from "@/lib/portfolio";
import { Icon } from "../shared/icon";
import type { Currency, MarketData, Order } from "@/lib/types";
const percent = (value: number | null) =>
  value === null
    ? "Indisponível"
    : `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
const dateLabel = (date: string) =>
  date.length > 10
    ? `${new Date(date).toLocaleString("pt-PT", {
        timeZone: "UTC",
        dateStyle: "short",
        timeStyle: "short",
      })} UTC`
    : new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-PT", {
        timeZone: "UTC",
      });
const estimateLabel = `Estimado · última cotação válida há até ${INTRADAY_MAX_AGE_MINUTES} min`;
export function PerformanceChart({
  orders,
  market,
  currency,
}: {
  orders: Order[];
  market: MarketData;
  currency: Currency;
}) {
  const gradientId = useId();
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
  useEffect(function observeChartWidth() {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setChartWidth(panel.clientWidth));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const plotWidth = Math.max(1, chartWidth - 48);
  const points = data.map((p) => ({
    ...p,
    roi: mode === "total" ? p.roi : p.openRoi,
  }));
  const activeIndex = selection?.data === data ? selection.index : null;
  const active = activeIndex === null ? null : points[activeIndex];
  const values = points
    .map((p) => p.roi)
    .filter((n): n is number => n !== null);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min || 1;
  const firstTime = points.length ? Date.parse(points[0].date) : 0;
  const timeSpan = points.length
    ? Date.parse(points[points.length - 1].date) - firstTime
    : 0;
  const x = (i: number) =>
    24 +
    (timeSpan ? (Date.parse(points[i].date) - firstTime) / timeSpan : 0) *
      plotWidth;
  const y = (v: number) => 150 - ((v - min) / span) * 120;
  function buildChartPath() {
    let connected = false;
    const commands: string[] = [];

    for (const [index, point] of points.entries()) {
      if (point.roi === null) {
        connected = false;
        commands.push("");
        continue;
      }
      const command = connected ? "L" : "M";
      connected = true;
      commands.push(
        `${command}${x(index).toFixed(1)},${y(point.roi).toFixed(1)}`,
      );
    }

    return commands.join(" ");
  }

  function buildAreaPaths() {
    const segments: number[][] = [];
    for (const [index, point] of points.entries()) {
      if (point.roi === null) continue;
      if (index === 0 || points[index - 1].roi === null) segments.push([]);
      segments.at(-1)!.push(index);
    }

    return segments
      .filter((segment) => segment.length > 1)
      .map(function buildAreaPath(segment) {
        const start = segment[0];
        const end = segment.at(-1)!;
        const line = segment
          .map((index) => `L${x(index)},${y(points[index].roi!)}`)
          .join(" ");
        return {
          key: start,
          path: `M${x(start)},150 ${line} L${x(end)},150 Z`,
        };
      });
  }

  function selectPoint(event: PointerEvent<HTMLDivElement>) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return;
    const position = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const targetTime =
      firstTime +
      Math.max(0, Math.min(1, (position.x - 24) / plotWidth)) * timeSpan;
    const index = points.reduce(
      (nearest, point, i) =>
        Math.abs(Date.parse(point.date) - targetTime) <
        Math.abs(Date.parse(points[nearest].date) - targetTime)
          ? i
          : nearest,
      0,
    );
    setSelection({ data, index });
  }

  function selectPointWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const index = activeIndex ?? points.length - 1;
    let next: number;
    switch (event.key) {
      case "Home":
        next = 0;
        break;
      case "End":
        next = points.length - 1;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = Math.max(0, index - 1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = Math.min(points.length - 1, index + 1);
        break;
      case "Escape":
        setSelection(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setSelection({ data, index: next });
  }

  function closeMethodologyOnEscape(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }

  return (
    <section
      ref={panelRef}
      className="panel performance"
    >
      <div className="panel-heading">
        <div>
          <h2>Evolução da rentabilidade</h2>
          <p className="panel-subtitle">
            Desempenho das tuas posições ao longo do tempo
          </p>
        </div>
      </div>
      <div className="performance-current">
        <span>
          {mode === "total"
            ? period === "1D"
              ? "Rentabilidade total da última observação"
              : "Rentabilidade total atual"
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
        <small
          className={
            displayedRoi !== null && data.at(-1)?.estimated
              ? "performance-estimate"
              : "performance-explanation"
          }
        >
          {explanation}
          {displayedRoi !== null && data.at(-1)?.estimated
            ? ` · ${estimateLabel}`
            : ""}
        </small>
      </div>
      {values.length > 0 && points.some((p) => p.roi !== null) ? (
        <>
          <div
            className={`chart-readout no-print ${active ? "is-active" : ""}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {active ? (
              <>
                <time dateTime={active.date}>
                  {dateLabel(active.date)}
                  {active.current
                    ? period === "1D"
                      ? active.estimated
                        ? " · Último valor estimado"
                        : " · Última observação"
                      : " · Atual"
                    : ""}
                </time>
                <span>
                  {modeLabel} <strong>{percent(active.roi)}</strong>
                  {active.estimated && active.roi !== null ? (
                    <small> · {estimateLabel}</small>
                  ) : null}
                </span>
              </>
            ) : (
              <span>
                {period === "1D"
                  ? "Seleciona uma hora para consultar a rentabilidade."
                  : "Seleciona uma data para consultar a rentabilidade."}
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
            aria-valuetext={`${dateLabel((active ?? points[points.length - 1]).date)}: ${modeLabel.toLowerCase()} ${percent((active ?? points[points.length - 1]).roi)}${(active ?? points[points.length - 1]).estimated ? ` · ${estimateLabel}` : ""}`}
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
            onKeyDown={selectPointWithKeyboard}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} 180`}
              preserveAspectRatio="none"
              role="img"
              aria-label={modeLabel}
            >
              <title>Rentabilidade em percentagem</title>
              <defs>
                <linearGradient
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--green)"
                    stopOpacity=".18"
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--green)"
                    stopOpacity=".015"
                  />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map((i) => {
                const v = min + (span * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1="24"
                      x2={chartWidth - 24}
                      y1={y(v)}
                      y2={y(v)}
                      stroke="var(--chart-grid)"
                      strokeDasharray="4 5"
                    />
                    <text
                      x="42"
                      y={y(v) + 4}
                      textAnchor="end"
                      className="chart-label chart-axis-label"
                    >
                      {v.toFixed(0)}%
                    </text>
                  </g>
                );
              })}
              {buildAreaPaths().map((area) => (
                <path
                  key={area.key}
                  d={area.path}
                  fill={`url(#${gradientId})`}
                />
              ))}
              <path
                d={buildChartPath()}
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
                <g
                  className="chart-cursor no-print"
                  aria-hidden="true"
                >
                  <line
                    x1={x(activeIndex)}
                    x2={x(activeIndex)}
                    y1="25"
                    y2="150"
                    stroke="var(--chart-cursor)"
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
                  x={24 + fraction * plotWidth}
                  y="173"
                  textAnchor={
                    fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
                  }
                  className="chart-label chart-date"
                >
                  {period === "1D"
                    ? new Date(
                        firstTime + fraction * timeSpan,
                      ).toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })
                    : new Date(
                        firstTime + fraction * timeSpan,
                      ).toLocaleDateString("pt-PT", {
                        month: "short",
                        year: "2-digit",
                        timeZone: "UTC",
                      })}
                </text>
              ))}
            </svg>
          </div>
          <p className="chart-limitations">
            Retorno simples · Sem dividendos, comissões ou câmbio.
            {period === "1D"
              ? ` Observações de 5 min · Horas em UTC. Falhas curtas usam a última cotação válida por até ${INTRADAY_MAX_AGE_MINUTES} min, com valores assinalados como estimados.`
              : ""}
          </p>
          <details
            className="chart-methodology"
            onKeyDown={closeMethodologyOnEscape}
          >
            <summary
              aria-label="Como interpretar o gráfico"
              title="Como interpretar o gráfico"
            >
              <span aria-hidden="true">•••</span>
            </summary>
            <p className="fine-print">
              {mode === "total"
                ? period === "Máximo"
                  ? "Inclui ganhos realizados e não realizados sobre todas as compras."
                  : "Inclui ganhos realizados e não realizados apenas no período selecionado."
                : "Considera as posições que estavam abertas em cada data, com custo FIFO; vendas podem alterar a percentagem."}{" "}
              {period === "Máximo"
                ? "A carteira mantém os custos originais das compras."
                : "As posições iniciais usam o último fecho anterior ao intervalo. As compras do período entram integralmente na base, independentemente da sua data."}{" "}
              Este retorno não é TWR nem anualizado.
              {period === "1D"
                ? "Falhas superiores a 15 minutos aparecem como interrupções."
                : "As falhas de preços aparecem como interrupções."}
              {period === "1D"
                ? " Usamos as observações intradiárias disponíveis do dia UTC, que podem ter atraso. Como as transações não têm hora, aplicamos as transações do dia a todas as observações desse dia, pela ordem de registo."
                : ""}
            </p>
          </details>
        </>
      ) : (
        <div className="chart-empty">
          <span className="empty-symbol">
            <Icon name="trend" />
          </span>
          <h3>
            {period === "1D"
              ? "Sem dados intradiários neste dia"
              : "Sem rentabilidade neste período"}
          </h3>
          <p>
            {period === "1D"
              ? "Não existem observações suficientes para calcular a rentabilidade de hoje. O mercado pode estar fechado ou os dados indisponíveis."
              : mode === "open"
                ? "Verifica as posições abertas e os preços históricos."
                : "Verifica as transações e os preços históricos."}
          </p>
        </div>
      )}
      <div className="performance-controls no-print">
        <div
          className="segments"
          aria-label="Período do gráfico"
        >
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
      </div>
    </section>
  );
}
