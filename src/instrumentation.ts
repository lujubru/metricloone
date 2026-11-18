import {
  publishIntervalMs,
  schedulerEnabled,
  schedulerState,
  setSchedulerState,
  STUCK_TICK_MS,
  type SchedulerState,
} from "./lib/scheduler-status";

/** Cada cuántos ticks se escribe una línea de latido en el log. */
const HEARTBEAT_EVERY_TICKS = 10;

function watchdogIntervalMs(intervalMs: number) {
  return Math.max(10_000, Math.min(intervalMs, 60_000));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function tick() {
  const state = schedulerState();
  if (!state || state.running) return;

  state.running = true;
  state.lastTickStartedAt = Date.now();

  try {
    const { publishDuePosts } = await import("./lib/publisher");
    const result = await publishDuePosts();

    state.lastResult = result;
    state.lastError = null;

    if (result.published || result.failed || result.retried) {
      console.log(
        `[scheduler] posts publicados: ${result.published}, reintentos: ${result.retried}, fallidos: ${result.failed}`
      );
    }
  } catch (error) {
    state.lastError = errorMessage(error);
    console.error("[scheduler] error al publicar posts programados:", error);
  } finally {
    state.lastTickFinishedAt = Date.now();
    state.lastTickDurationMs =
      state.lastTickStartedAt === null ? null : state.lastTickFinishedAt - state.lastTickStartedAt;
    state.running = false;
  }
}

/**
 * Red de seguridad del scheduler. El `setInterval` del tick se pierde si un
 * tick queda colgado esperando a la Graph API, o si el proceso pasa por un
 * momento sin timers: el post queda `SCHEDULED` y no se publica hasta que
 * alguien lo fuerza a mano. El watchdog detecta el hueco y vuelve a disparar
 * el tick (o libera el cerrojo si quedó trabado).
 */
function watchdog() {
  const state = schedulerState();
  if (!state) return;

  const now = Date.now();
  const reference = state.lastTickFinishedAt ?? state.lastTickStartedAt ?? state.startedAt;

  if (state.running) {
    const runningFor = now - (state.lastTickStartedAt ?? now);
    if (runningFor > STUCK_TICK_MS) {
      state.watchdogRuns += 1;
      state.lastError = "Tareas de publicacion colgadas: se libero el cerrojo";
      console.warn(
        `[scheduler] un tick lleva ${Math.round(runningFor / 1000)}s colgado; se libera el cerrojo para reintentar`
      );
      // Los posts se toman con un `updateMany` atomico, asi que reintentar
      // nunca puede duplicar una publicacion.
      state.running = false;
    }
    return;
  }

  const silentFor = now - reference;
  if (silentFor > state.intervalMs * 2) {
    state.watchdogRuns += 1;
    console.warn(
      `[scheduler] sin ticks hace ${Math.round(silentFor / 1000)}s; se dispara uno desde el watchdog`
    );
    void tick();
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (!schedulerEnabled()) {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      console.log("[scheduler] publicacion automatica desactivada");
    }
    return;
  }

  if (schedulerState()) return;

  const intervalMs = publishIntervalMs();
  const state: SchedulerState = {
    intervalMs,
    startedAt: Date.now(),
    running: false,
    lastTickStartedAt: null,
    lastTickFinishedAt: null,
    lastTickDurationMs: null,
    lastResult: null,
    lastError: null,
    watchdogRuns: 0,
  };
  setSchedulerState(state);

  console.log(`[scheduler] publicacion automatica activa (cada ${intervalMs / 1000}s)`);

  let ticks = 0;

  // Ningun timer debe mantener vivo el proceso.
  state.timer = setInterval(() => {
    ticks += 1;
    if (ticks % HEARTBEAT_EVERY_TICKS === 0) {
      const lastTickAgo = state.lastTickFinishedAt ? Date.now() - state.lastTickFinishedAt : null;
      const ago = lastTickAgo === null ? "n/a" : `${Math.round(lastTickAgo / 1000)}s`;
      console.log(
        `[scheduler] latido: ${ticks} ticks, ultimo hace ${ago}, watchdog: ${state.watchdogRuns}`
      );
    }
    void tick();
  }, intervalMs);
  state.timer.unref?.();

  state.watchdog = setInterval(watchdog, watchdogIntervalMs(intervalMs));
  state.watchdog.unref?.();

  void tick();
}
