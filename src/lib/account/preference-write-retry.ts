export type PreferenceWriteRetryOptions<T> = {
  attempt: () => Promise<T | null>;
  isActive: () => boolean;
  isBusy: (error: unknown) => boolean;
  wait: (delay: number) => Promise<void>;
  delays: readonly number[];
};

export async function retryBusyPreferenceWrite<T>({
  attempt,
  isActive,
  isBusy,
  wait,
  delays,
}: PreferenceWriteRetryOptions<T>): Promise<T | null> {
  for (let attemptNumber = 0; attemptNumber <= delays.length; attemptNumber++) {
    if (!isActive()) return null;

    try {
      return await attempt();
    } catch (error) {
      if (!isActive()) return null;
      if (!isBusy(error) || attemptNumber === delays.length) throw error;

      await wait(delays[attemptNumber]);
      if (!isActive()) return null;
    }
  }

  return null;
}
