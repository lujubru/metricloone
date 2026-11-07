"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

type AdminUser = { id: string; name: string; email: string; role: string };

type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  fbAppId: string | null;
  hasAppSecret: boolean;
  createdAt: string;
  facebook: { fbUserName: string | null; tokenExpiresAt: string | null } | null;
  users: AdminUser[];
  profilesCount: number;
  postsCount: number;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-color)",
  background: "var(--bg-color)",
  color: "var(--text-primary)",
  fontSize: "0.9rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.35rem",
  fontSize: "0.8rem",
  color: "var(--text-secondary)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [newTenant, setNewTenant] = useState({
    name: "",
    email: "",
    password: "",
    fbAppId: "",
    fbAppSecret: "",
  });

  const [credentialsFor, setCredentialsFor] = useState<string | null>(null);
  const [creds, setCreds] = useState({ fbAppId: "", fbAppSecret: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tenants", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron cargar las cuentas");
      setTenants(data.tenants ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      // El fetch arranca fuera del cuerpo del efecto para no encadenar renders.
      queueMicrotask(() => {
        void load();
      });
    }
  }, [status, session?.user?.role, load]);

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTenant),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo crear la cuenta");
      setNewTenant({ name: "", email: "", password: "", fbAppId: "", fbAppSecret: "" });
      setNotice(`Cuenta "${data.tenant?.name}" creada`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  async function saveCredentials(tenantId: string) {
    setBusy(tenantId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron guardar las credenciales");
      setCredentialsFor(null);
      setCreds({ fbAppId: "", fbAppSecret: "" });
      setNotice("Credenciales actualizadas");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  async function removeTenant(tenant: AdminTenant) {
    if (!window.confirm(`¿Eliminar la cuenta "${tenant.name}" con todos sus datos?`)) return;
    setBusy(tenant.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo eliminar la cuenta");
      setNotice(`Cuenta "${tenant.name}" eliminada`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  async function copyRedirectUri() {
    const uri = `${window.location.origin}/api/connect/facebook/callback`;
    try {
      await navigator.clipboard.writeText(uri);
      setNotice("Redirect URI copiada al portapapeles");
    } catch {
      window.prompt("Copiá esta Redirect URI en la app de Meta:", uri);
    }
  }

  if (status === "loading") {
    return (
      <div className="page-content">
        <Loader2 className="spin" size={20} /> Cargando…
      </div>
    );
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="page-content">
        <h1 className="page-title">Acceso restringido</h1>
        <p className="page-subtitle">Esta sección es solo para administradores.</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="page-title">
            <ShieldCheck size={22} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            Administración
          </h1>
          <p className="page-subtitle">
            Creá las cuentas de tus clientes, cargá el App ID/Secret de su app de Facebook y
            entregales su usuario.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> Refrescar
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#ef4444", marginBottom: "1rem" }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={16} color="#ef4444" /> {error}
          </p>
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderColor: "#22c55e", marginBottom: "1rem" }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color="#22c55e" /> {notice}
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Redirect URI para las apps de Meta</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Cada cliente debe agregar esta URL en <strong>Facebook Login → Configuración</strong> de su
          propia app.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <code
            style={{
              flex: 1,
              minWidth: 260,
              padding: "0.6rem 0.75rem",
              background: "var(--bg-color)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.8rem",
            }}
          >
            {typeof window !== "undefined"
              ? `${window.location.origin}/api/connect/facebook/callback`
              : "/api/connect/facebook/callback"}
          </code>
          <button className="btn btn-secondary" onClick={() => void copyRedirectUri()}>
            <Copy size={16} /> Copiar
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>
          <Plus size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Nueva cuenta
        </h2>
        <form onSubmit={createTenant}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 1rem" }}>
            <Field label="Nombre del cliente">
              <input
                style={inputStyle}
                value={newTenant.name}
                onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                placeholder="Panadería Pérez"
                required
              />
            </Field>
            <Field label="Email de acceso">
              <input
                style={inputStyle}
                type="email"
                value={newTenant.email}
                onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                placeholder="cliente@ejemplo.com"
                required
              />
            </Field>
            <Field label="Contraseña inicial">
              <input
                style={inputStyle}
                type="text"
                value={newTenant.password}
                onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })}
                placeholder="mínimo 8 caracteres"
                required
              />
            </Field>
            <Field label="App ID de Facebook (opcional)">
              <input
                style={inputStyle}
                value={newTenant.fbAppId}
                onChange={(e) => setNewTenant({ ...newTenant, fbAppId: e.target.value })}
                placeholder="123456789012345"
              />
            </Field>
            <Field label="App Secret (opcional)">
              <input
                style={inputStyle}
                type="password"
                value={newTenant.fbAppSecret}
                onChange={(e) => setNewTenant({ ...newTenant, fbAppSecret: e.target.value })}
                placeholder="se guarda cifrado"
              />
            </Field>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy === "create"}>
            {busy === "create" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
            Crear cuenta
          </button>
        </form>
      </div>

      <h2 style={{ fontSize: "1rem" }}>
        <Users size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Cuentas ({tenants.length})
      </h2>

      {loading && tenants.length === 0 && (
        <div className="card">
          <Loader2 className="spin" size={16} /> Cargando cuentas…
        </div>
      )}

      {!loading && tenants.length === 0 && (
        <div className="card">
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Todavía no hay cuentas de clientes.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {tenants.map((tenant) => (
          <div className="card" key={tenant.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>{tenant.name}</h3>
                <p style={{ margin: "0.25rem 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                  {tenant.users.map((u) => u.email).join(", ") || "sin usuarios"}
                </p>
                <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  {tenant.profilesCount} páginas · {tenant.postsCount} publicaciones ·{" "}
                  {tenant.facebook?.fbUserName
                    ? `Facebook: ${tenant.facebook.fbUserName}`
                    : "Facebook sin conectar"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCredentialsFor(credentialsFor === tenant.id ? null : tenant.id);
                    setCreds({ fbAppId: tenant.fbAppId ?? "", fbAppSecret: "" });
                  }}
                >
                  {tenant.hasAppSecret ? "Credenciales" : "Cargar credenciales"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void removeTenant(tenant)}
                  disabled={busy === tenant.id}
                  title="Eliminar cuenta"
                >
                  {busy === tenant.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            </div>

            {credentialsFor === tenant.id && (
              <div
                style={{
                  marginTop: "1rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--border-color)",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                  gap: "0 1rem",
                }}
              >
                <Field label="App ID de Facebook">
                  <input
                    style={inputStyle}
                    value={creds.fbAppId}
                    onChange={(e) => setCreds({ ...creds, fbAppId: e.target.value })}
                  />
                </Field>
                <Field
                  label={tenant.hasAppSecret ? "App Secret (vacío = sin cambios)" : "App Secret"}
                >
                  <input
                    style={inputStyle}
                    type="password"
                    value={creds.fbAppSecret}
                    onChange={(e) => setCreds({ ...creds, fbAppSecret: e.target.value })}
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", paddingBottom: "0.85rem" }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => void saveCredentials(tenant.id)}
                    disabled={busy === tenant.id}
                  >
                    {busy === tenant.id ? <Loader2 className="spin" size={16} /> : null}
                    Guardar
                  </button>
                  <button className="btn btn-secondary" onClick={() => setCredentialsFor(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
