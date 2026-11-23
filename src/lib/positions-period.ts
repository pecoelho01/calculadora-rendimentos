import { parseChartPeriod } from "@/lib/chart-period";

export const POSITIONS_PERIOD_KEY = "rendimentos-positions-period-v1";

// O período das posições aceita os mesmos valores e a mesma predefinição do
// período do gráfico; só a chave de armazenamento é diferente.
export const parsePositionsPeriod = parseChartPeriod;
