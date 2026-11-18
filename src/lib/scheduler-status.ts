import type { PublishRunResult } from "./publisher";

const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 15;
/** Un tick que arrancó hace más de esto se considera colgado. */
export const STUCK_TICK_MS = 10 * 60 * 1000;
/** Margen extra sobre dos intervalos para declarar el scheduler frenado. */
const STALL_GRACE_MS = 15 * 1000;

export type SchedulerState = {
  intervalMs: number;
  startedAt: number;
  running: boolean;
  lastTickStartedAt: number | null;
  lastTickFinishedAt: number | null;
  lastTickDurationMs: number | null;
  lastResult: PublishRunResult | null;
  lastError: string | null;
  watchdogRuns: number;
  timer?: NodeJS.Timeout;
  watchdog?: NodeJS.Timeout;
};

type SchedulerGlobal = typeof globalThis & {
  __metricloonePublisher?: SchedulerState;
};

/** Intervalo configurado del scheduler interno (`PUBLISH_INTERVAL_SECONDS`). */
export function publishIntervalMs() {
  const configured = Number(process.env.PUBLISH_INTERVAL_SECONDS);
  const seconds =
    Number.isFinite(configured) && configured >= MIN_INTERVAL_SECONDS
      ? configured
      : DEFAULT_INTERVAL_SECONDS;
  return seconds * 1000;
}

export function schedulerEnabled() {
  if (process.env.SCHEDULER_ENABLED === "false") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  // En desarrollo solo se activa de forma explícita para no publicar por accidente.
  if (process.env.NODE_ENV !== "production") return process.env.SCHEDULER_ENABLED === "true";
  return true;
}

export function schedulerState() {
  return (globalThis as SchedulerGlobal).__metricloonePublisher;
}

export function setSchedulerState(state: SchedulerState | undefined) {
  (globalThis as SchedulerGlobal).__metricloonePublisher = state;
}

export type SchedulerStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  uptimeMs: number;
  watchdogRuns: number;
  lastTickStartedAt: string | null;
  lastTickFinishedAt: string | null;
  lastTickDurationMs: number | null;
  lastTickAgoMs: number | null;
  lastResult: PublishRunResult | null;
  lastError: string | null;
  stalled: boolean;
};

/**
 * Estado del scheduler en formato JSON. `stalled` es true cuando pasó más de
 * dos intervalos sin que termine un tick: el proceso está vivo pero dejó de
 * publicar (tick colgado o event loop bloqueado).
 */
export function readSchedulerStatus(now = Date.now()): SchedulerStatus {
  const intervalMs = publishIntervalMs();
  const state = schedulerState();

  if (!state) {
    return {
      enabled: schedulerEnabled(),
      running: false,
      intervalMs,
      uptimeMs: 0,
      watchdogRuns: 0,
      lastTickStartedAt: null,
      lastTickFinishedAt: null,
      lastTickDurationMs: null,
      lastTickAgoMs: null,
      lastResult: null,
      lastError: null,
      stalled: false,
    };
  }

  const reference = state.lastTickFinishedAt ?? state.lastTickStartedAt ?? state.startedAt;
  const lastTickAgoMs = Math.max(0, now - reference);

  return {
    enabled: true,
    running: state.running,
    intervalMs: state.intervalMs,
    uptimeMs: Math.max(0, now - state.startedAt),
    watchdogRuns: state.watchdogRuns,
    lastTickStartedAt: state.lastTickStartedAt ? new Date(state.lastTickStartedAt).toISOString() : null,
    lastTickFinishedAt: state.lastTickFinishedAt
      ? new Date(state.lastTickFinishedAt).toISOString()
      : null,
    lastTickDurationMs: state.lastTickDurationMs,
    lastTickAgoMs,
    lastResult: state.lastResult,
    lastError: state.lastError,
    stalled: lastTickAgoMs > state.intervalMs * 2 + STALL_GRACE_MS,
  };
}
