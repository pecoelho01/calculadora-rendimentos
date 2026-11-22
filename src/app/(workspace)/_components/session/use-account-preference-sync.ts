"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  hasUnsupportedAccountPreferencesVersion,
  parseAccountPreferences,
  type AccountPreferences,
} from "@/lib/account/preferences";
import { retryBusyPreferenceWrite } from "@/lib/account/preference-write-retry";
import {
  AUTH_BUSY_MESSAGE,
  runBrowserAuthMutation,
} from "@/lib/auth/browser-auth";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import {
  clearAccountChartPeriodSource,
  setAccountChartPeriodSource,
} from "@/components/chart-period/use-chart-period-preference";
import {
  clearAccountThemeSource,
  setAccountThemeSource,
} from "@/components/theme/use-theme-preference";
import type { AccountIdentity } from "./session-types";

type UseAccountPreferenceSyncOptions = {
  session: Session | null;
  identity: AccountIdentity | null;
  checking: boolean;
};

type PreferenceQueue = {
  userId: string;
  active: boolean;
  confirmed: AccountPreferences;
  optimistic: AccountPreferences;
  pending: AccountPreferences | null;
  draining: boolean;
  unsupportedVersion: boolean;
  writeTheme: (theme: AccountPreferences["theme"]) => void;
  writePeriod: (period: AccountPreferences["chartPeriod"]) => void;
  apply: (preferences: AccountPreferences) => void;
};

const busyRetryDelays = [40, 100, 200];
const preferenceSaveError =
  "Não foi possível guardar a preferência na conta. A escolha anterior foi reposta.";

function configurePreferenceQueue(
  queue: PreferenceQueue,
  queueRef: { current: PreferenceQueue | null },
  activeAccountKeyRef: { current: string },
  setErrorState: (state: { userId: string; message: string }) => void,
) {
  function isActive() {
    return (
      queue.active &&
      queueRef.current === queue &&
      activeAccountKeyRef.current === queue.userId
    );
  }

  function apply(preferences: AccountPreferences) {
    queue.optimistic = preferences;
    setAccountThemeSource(preferences.theme, queue.writeTheme);
    setAccountChartPeriodSource(preferences.chartPeriod, queue.writePeriod);
  }

  async function drainWrites() {
    if (queue.draining || queue.unsupportedVersion) return;
    queue.draining = true;

    while (isActive() && queue.pending) {
      const next = queue.pending;
      queue.pending = null;
      setErrorState({ userId: "", message: "" });

      try {
        const user = await updateAccountPreferences(
          next,
          queue.userId,
          isActive,
        );
        if (!isActive()) return;
        if (!user) continue;

        queue.confirmed = parseAccountPreferences(user.user_metadata);
        if (!queue.pending) apply(queue.confirmed);
      } catch {
        if (!isActive()) return;
        queue.pending = null;
        apply(queue.confirmed);
        setErrorState({ userId: queue.userId, message: preferenceSaveError });
      }
    }

    queue.draining = false;
    if (isActive() && queue.pending) void drainWrites();
  }

  function queueWrite(next: AccountPreferences) {
    if (!isActive()) return;
    if (queue.unsupportedVersion) {
      apply(queue.confirmed);
      return;
    }

    queue.pending = next;
    apply(next);
    void drainWrites();
  }

  queue.writeTheme = function writeTheme(theme) {
    queueWrite({ ...queue.optimistic, theme });
  };
  queue.writePeriod = function writePeriod(chartPeriod) {
    queueWrite({ ...queue.optimistic, chartPeriod });
  };
  queue.apply = apply;
  apply(queue.confirmed);
}

async function updateAccountPreferences(
  preferences: AccountPreferences,
  expectedUserId: string,
  isActive: () => boolean,
) {
  return retryBusyPreferenceWrite({
    attempt: async () => {
      return runBrowserAuthMutation(async () => {
        if (!isActive()) return null;

        const client = getBrowserSupabase();
        if (!client) throw new Error("Auth indisponível");
        const {
          data: { session },
          error,
        } = await client.auth.getSession();
        if (error) throw error;
        if (!isActive() || session?.user.id !== expectedUserId) return null;

        const result = await client.auth.updateUser({
          data: { rendimentosPreferences: preferences },
        });
        if (result.error) throw result.error;
        return result.data.user;
      });
    },
    isActive,
    isBusy: (error) =>
      error instanceof Error && error.message === AUTH_BUSY_MESSAGE,
    wait: (delay) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delay)),
    delays: busyRetryDelays,
  });
}

export function useAccountPreferenceSync({
  session,
  identity,
  checking,
}: UseAccountPreferenceSyncOptions) {
  const [errorState, setErrorState] = useState({ userId: "", message: "" });
  const queueRef = useRef<PreferenceQueue | null>(null);
  const activeAccountKeyRef = useRef("");
  const sessionRef = useRef(session);
  const accountUserId = identity?.userId ?? "";
  const accountModeActive = !checking && !!accountUserId && !!session;
  const activeAccountKey = accountModeActive ? accountUserId : "";
  const unsupportedVersion = hasUnsupportedAccountPreferencesVersion(
    session?.user.user_metadata,
  );
  const preferenceError =
    accountUserId && errorState.userId === accountUserId
      ? errorState.message
      : "";

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useLayoutEffect(() => {
    activeAccountKeyRef.current = activeAccountKey;
    return () => {
      activeAccountKeyRef.current = "";
    };
  }, [activeAccountKey]);

  useEffect(() => {
    const currentSession = sessionRef.current;
    if (!accountModeActive || !currentSession) {
      queueRef.current = null;
      // While the session is still being restored, keep the cached account
      // theme applied by the inline script; clearing it here would flash the
      // local theme before the account one comes back.
      if (checking) return;
      clearAccountThemeSource();
      clearAccountChartPeriodSource();
      return;
    }

    const confirmed = parseAccountPreferences(
      currentSession.user.user_metadata,
    );
    const queue: PreferenceQueue = {
      userId: accountUserId,
      active: true,
      confirmed,
      optimistic: confirmed,
      pending: null,
      draining: false,
      unsupportedVersion: hasUnsupportedAccountPreferencesVersion(
        currentSession.user.user_metadata,
      ),
      writeTheme: () => {},
      writePeriod: () => {},
      apply: () => {},
    };
    queueRef.current = queue;
    configurePreferenceQueue(
      queue,
      queueRef,
      activeAccountKeyRef,
      setErrorState,
    );
    return () => {
      queue.active = false;
      if (queueRef.current === queue) queueRef.current = null;
      clearAccountThemeSource(queue.writeTheme);
      clearAccountChartPeriodSource(queue.writePeriod);
    };
  }, [accountModeActive, accountUserId, checking]);

  useEffect(() => {
    const queue = queueRef.current;
    if (!queue || !session || session.user.id !== queue.userId) return;
    if (queue.draining || queue.pending) return;

    queue.unsupportedVersion = unsupportedVersion;
    queue.confirmed = parseAccountPreferences(session.user.user_metadata);
    queue.apply(queue.confirmed);
  }, [session, unsupportedVersion]);

  function dismissPreferenceError() {
    setErrorState({ userId: "", message: "" });
  }

  return { preferenceError, dismissPreferenceError, unsupportedVersion };
}
