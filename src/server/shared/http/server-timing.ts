export type ServerTimingName = "auth" | "account_read" | "service";

export type ServerTiming = {
  measure<T>(name: ServerTimingName, operation: () => Promise<T>): Promise<T>;
  response(response: Response): Response;
};

export function createServerTiming(): ServerTiming {
  const startedAt = performance.now();
  const measurements: string[] = [];

  return {
    async measure<T>(name: ServerTimingName, operation: () => Promise<T>) {
      const measurementStartedAt = performance.now();
      try {
        return await operation();
      } finally {
        const duration = Math.max(0, performance.now() - measurementStartedAt);
        measurements.push(`${name};dur=${duration.toFixed(2)}`);
      }
    },
    response(response: Response) {
      const duration = Math.max(0, performance.now() - startedAt);
      const headers = new Headers(response.headers);
      headers.set(
        "Server-Timing",
        [...measurements, `total;dur=${duration.toFixed(2)}`].join(", "),
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}
