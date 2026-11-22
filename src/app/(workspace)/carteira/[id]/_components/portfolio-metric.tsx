import { Icon } from "@/components/icon";

export function PortfolioMetric({
  label,
  value,
  detail,
  featured = false,
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  featured?: boolean;
  trend?: number | null;
}) {
  return (
    <section className={`metric ${featured ? "featured" : ""}`}>
      <div className="metric-label">
        {label}
        <Icon name={featured ? "wallet" : "trend"} />
      </div>
      <strong
        className={trend == null ? "" : trend >= 0 ? "positive" : "negative"}
      >
        {value}
      </strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}
