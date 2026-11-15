"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

type ReelInsights = {
  averageWatchTimeMs: number | null;
  skipRate: number | null;
  views: number | null;
};

type Reel = {
  postId: string;
  caption: string;
  account: string;
  publishedAt: string | null;
  insights: ReelInsights | null;
  error: string | null;
};

function formatWatchTime(milliseconds: number | null) {
  if (milliseconds === null) return "Sin datos";
  const seconds = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(
    milliseconds / 1000
  );
  return `${seconds} s`;
}

function formatSkipRate(rate: number | null) {
  if (rate === null) return "Sin datos";
  const percentage = rate <= 1 ? rate * 100 : rate;
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(percentage)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "Fecha no disponible";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ReelsAnalytics() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    fetch("/api/analytics/instagram/reels")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudieron cargar las métricas.");
        if (!ignore) {
          setReels(data.reels || []);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!ignore) {
          setError(cause instanceof Error ? cause.message : "No se pudieron cargar las métricas.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 className="page-title">Retención de Reels</h1>
          <p className="page-subtitle">
            Tiempo promedio de reproducción y porcentaje de usuarios que omiten los primeros 3
            segundos.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setLoading(true);
            setError(null);
            setRefreshKey((key) => key + 1);
          }}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />}
          Actualizar
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Se muestran hasta los 20 Reels más recientes publicados desde esta aplicación. Meta puede
          tardar hasta 48 horas en disponibilizar las métricas; las celdas sin datos todavía pueden
          estar procesándose.
        </p>
      </div>

      {error ? (
        <div className="card" role="alert" style={{ color: "#b91c1c" }}>
          {error}
          <p style={{ marginBottom: 0 }}>
            Confirma que la app de Meta tenga aprobado <code>instagram_manage_insights</code> y
            vuelve a conectar Facebook para que el token incluya el permiso.
          </p>
        </div>
      ) : loading ? (
        <div className="card" style={{ color: "var(--text-secondary)" }}>
          <Loader2 size={16} className="spin" /> Cargando métricas…
        </div>
      ) : reels.length === 0 ? (
        <div className="card" style={{ color: "var(--text-secondary)" }}>
          Todavía no hay Reels publicados desde la aplicación para mostrar.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {reels.map((reel) => (
            <article className="card" key={reel.postId}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                    @{reel.account} · {formatDate(reel.publishedAt)}
                  </div>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {reel.caption || "Sin descripción"}
                  </div>
                </div>
              </div>
              {reel.error ? (
                <p role="status" style={{ color: "#b45309", margin: 0 }}>
                  No se pudieron consultar las métricas: {reel.error}
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div className="stat-label">Reproducción promedio</div>
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                      {formatWatchTime(reel.insights?.averageWatchTimeMs ?? null)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Omitieron antes de 3 s</div>
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                      {formatSkipRate(reel.insights?.skipRate ?? null)}
                    </div>
                  </div>
                  <div>
                    <div className="stat-label">Reproducciones</div>
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                      {reel.insights?.views?.toLocaleString("es-ES") ?? "Sin datos"}
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
