const DEFAULT_INTERVAL_SECONDS = 60;
const MIN_INTERVAL_SECONDS = 15;

type SchedulerGlobal = typeof globalThis & {
  __metricloonePublisher?: { timer: NodeJS.Timeout; running: boolean };
};

function intervalMs() {
  const configured = Number(process.env.PUBLISH_INTERVAL_SECONDS);
  const seconds =
    Number.isFinite(configured) && configured >= MIN_INTERVAL_SECONDS
      ? configured
      : DEFAULT_INTERVAL_SECONDS;
  return seconds * 1000;
}

function isEnabled() {
  if (process.env.SCHEDULER_ENABLED === "false") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  // En desarrollo solo se activa de forma explícita para no publicar por accidente.
  if (process.env.NODE_ENV !== "production") return process.env.SCHEDULER_ENABLED === "true";
  return true;
}

async function tick() {
  const state = (globalThis as SchedulerGlobal).__metricloonePublisher;
  if (!state || state.running) return;

  state.running = true;
  try {
    const { publishDuePosts } = await import("./lib/publisher");
    const result = await publishDuePosts();

    if (result.published || result.failed || result.retried) {
      console.log(
        `[scheduler] posts publicados: ${result.published}, reintentos: ${result.retried}, fallidos: ${result.failed}`
      );
    }
  } catch (error) {
    console.error("[scheduler] error al publicar posts programados:", error);
  } finally {
    state.running = false;
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!isEnabled()) return;

  const globalState = globalThis as SchedulerGlobal;
  if (globalState.__metricloonePublisher) return;

  console.log(
    `[scheduler] publicacion automatica activa (cada ${intervalMs() / 1000}s)`
  );

  // El timer no debe mantener vivo el proceso.
  const timer = setInterval(() => {
    void tick();
  }, intervalMs());
  timer.unref?.();

  globalState.__metricloonePublisher = { timer, running: false };

  void tick();
}
