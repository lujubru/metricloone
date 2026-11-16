"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

const INSTAGRAM_PLATFORM = "instagram_business";

type AdminProfile = {
  id: string;
  platform: string;
  profileId: string;
  username: string | null;
  parentProfileId: string | null;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  socialProfileIds: string[];
};

type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  fbAppId: string | null;
  hasAppSecret: boolean;
  createdAt: string;
  facebook: { fbUserName: string | null; tokenExpiresAt: string | null } | null;
  users: AdminUser[];
  postsCount: number;
};

type Networks = {
  connected: boolean;
  facebook: { fbUserName: string | null; tokenExpiresAt: string | null } | null;
  profiles: AdminProfile[];
};

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function profileLabel(profile: AdminProfile): string {
  return profile.platform === INSTAGRAM_PLATFORM
    ? `@${profile.username ?? profile.profileId}`
    : profile.username ?? profile.profileId;
}

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

function CheckRow({
  checked,
  onChange,
  icon,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.5rem 0.65rem",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)",
        background: checked ? "var(--bg-color)" : "transparent",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: "var(--accent-color, #2563eb)" }}
      />
      {icon}
      <span style={{ display: "grid", lineHeight: 1.25 }}>
        <span style={{ fontSize: "0.9rem" }}>{title}</span>
        {subtitle && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{subtitle}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Selector sobre el pool de redes del administrador: son las redes que ya están
 * vinculadas con su cuenta de Facebook, así que elegir acá sólo otorga permisos.
 */
function NetworkPicker({
  networks,
  selection,
  onChange,
  loading,
}: {
  networks: Networks | null;
  selection: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        <Loader2 className="spin" size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Buscando tus redes de Meta…
      </p>
    );
  }

  if (!networks?.connected && !networks?.profiles.length) {
    return (
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        Todavía no vinculaste ninguna red. Conectá tu cuenta de Facebook y agregá tus Páginas y
        cuentas de Instagram desde «Redes sociales».
      </p>
    );
  }

  if (!networks.profiles.length) {
    return (
      <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
        No hay Páginas ni cuentas de Instagram vinculadas todavía.
      </p>
    );
  }

  const pages = networks.profiles.filter(
    (profile) => profile.platform !== INSTAGRAM_PLATFORM,
  );
  const instagram = networks.profiles.filter(
    (profile) => profile.platform === INSTAGRAM_PLATFORM,
  );

  const instagramByPage = new Map<string, AdminProfile[]>();
  const orphanInstagram: AdminProfile[] = [];
  for (const account of instagram) {
    const parent = account.parentProfileId;
    if (!parent || !pages.some((page) => page.profileId === parent)) {
      orphanInstagram.push(account);
      continue;
    }
    const list = instagramByPage.get(parent) ?? [];
    list.push(account);
    instagramByPage.set(parent, list);
  }

  return (
    <div style={{ display: "grid", gap: "0.4rem" }}>
      {pages.map((page) => (
        <div key={page.id} style={{ display: "grid", gap: "0.35rem" }}>
          <CheckRow
            checked={selection.includes(page.id)}
            onChange={() => onChange(toggleId(selection, page.id))}
            icon={<Globe size={16} color="#1877f2" />}
            title={profileLabel(page)}
            subtitle="Página de Facebook"
          />
          {(instagramByPage.get(page.profileId) ?? []).map((account) => (
            <div key={account.id} style={{ paddingLeft: "1.75rem" }}>
              <CheckRow
                checked={selection.includes(account.id)}
                onChange={() => onChange(toggleId(selection, account.id))}
                icon={<Camera size={16} color="#e1306c" />}
                title={profileLabel(account)}
                subtitle={`Instagram · ${profileLabel(page)}`}
              />
            </div>
          ))}
        </div>
      ))}
      {orphanInstagram.map((account) => (
        <CheckRow
          key={account.id}
          checked={selection.includes(account.id)}
          onChange={() => onChange(toggleId(selection, account.id))}
          icon={<Camera size={16} color="#e1306c" />}
          title={profileLabel(account)}
          subtitle="Instagram"
        />
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [networks, setNetworks] = useState<Networks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [newTenant, setNewTenant] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [newSelection, setNewSelection] = useState<string[]>([]);

  const [credentialsFor, setCredentialsFor] = useState<string | null>(null);
  const [creds, setCreds] = useState({ fbAppId: "", fbAppSecret: "" });

  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [accessDraft, setAccessDraft] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantsRes, networksRes] = await Promise.all([
        fetch("/api/admin/tenants", { cache: "no-store" }),
        fetch("/api/admin/networks", { cache: "no-store" }),
      ]);

      const tenantsData = await tenantsRes.json();
      if (!tenantsRes.ok) {
        throw new Error(tenantsData?.error ?? "No se pudieron cargar las cuentas");
      }
      setTenants(tenantsData.tenants ?? []);

      const networksData = await networksRes.json();
      if (!networksRes.ok) {
        throw new Error(networksData?.error ?? "No se pudieron cargar tus redes de Meta");
      }
      setNetworks({
        connected: Boolean(networksData.connected),
        facebook: networksData.facebook ?? null,
        profiles: networksData.profiles ?? [],
      });
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
        body: JSON.stringify({ ...newTenant, socialProfileIds: newSelection }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo crear la cuenta");
      setNewTenant({ name: "", email: "", password: "" });
      setNewSelection([]);

      const parts = [`Cuenta "${data.tenant?.name}" creada`];
      if (data.grants) parts.push(`${data.grants} red(es) asignada(s)`);
      if (data.warning) parts.push(data.warning);
      setNotice(parts.join(" · "));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setBusy(null);
    }
  }

  async function saveUserAccess(user: AdminUser) {
    setBusy(`access-${user.id}`);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialProfileIds: accessDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudieron guardar las redes");
      setAccessFor(null);
      setNotice(`Redes de ${user.email}: ${data.grants ?? 0} asignada(s)`);
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

  const pool = networks?.profiles ?? [];

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
            Vinculá las redes de tus clientes con tu cuenta de Facebook y después elegí cuáles
            administra cada usuario.
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
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>
          <Globe size={16} color="#1877f2" style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Redes vinculadas
        </h2>
        {networks?.connected ? (
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.9rem" }}>
            Conectado como <strong>{networks.facebook?.fbUserName ?? "tu cuenta"}</strong>
          </p>
        ) : (
          <p style={{ margin: "0 0 0.25rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Todavía no conectaste tu cuenta de Facebook.
          </p>
        )}
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.8rem" }}>
          {pool.length} red(es) disponibles para asignar
          {networks?.facebook?.tokenExpiresAt
            ? ` · token vence el ${new Date(
                networks.facebook.tokenExpiresAt,
              ).toLocaleDateString("es-AR")}`
            : ""}
          .
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.85rem" }}>
          <a
            className="btn btn-primary"
            href="/api/connect/facebook/start?next=/admin"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Globe size={16} />
            {networks?.connected ? "Reconectar Facebook" : "Conectar mi Facebook"}
          </a>
          <a
            className="btn btn-secondary"
            href="/connections"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={16} /> Agregar redes
          </a>
        </div>
        <p style={{ margin: "0.6rem 0 0", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
          Las redes se cargan una sola vez con tu cuenta y se publican siempre con ella. Cada
          usuario ve únicamente las que le asignes.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Redirect URI para las apps de Meta</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Esta URL tiene que estar cargada en <strong>Facebook Login → Configuración</strong> de tu
          app de Meta. Sólo necesitás App ID/Secret propios por cliente si preferís que cada uno
          conecte con su app (si no, se usa la de las variables de entorno).
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: "0 1rem",
            }}
          >
            <Field label="Nombre del cliente">
              <input
                style={inputStyle}
                value={newTenant.name}
                onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                placeholder="Cliente S.A."
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
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              margin: "0.25rem 0 0.85rem",
              paddingTop: "0.85rem",
            }}
          >
            <label style={labelStyle}>
              Redes que va a administrar (opcional · {newSelection.length} elegida(s))
            </label>
            <p style={{ margin: "0 0 0.6rem", color: "var(--text-secondary)", fontSize: "0.78rem" }}>
              El cliente va a ver sólo estas redes. Si no elegís ninguna ahora, podés asignarlas
              después desde la tarjeta de la cuenta.
            </p>
            <NetworkPicker
              networks={networks}
              selection={newSelection}
              onChange={setNewSelection}
              loading={loading && networks === null}
            />
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
                <p
                  style={{
                    margin: "0.25rem 0",
                    color: "var(--text-secondary)",
                    fontSize: "0.85rem",
                  }}
                >
                  {tenant.users.map((u) => u.email).join(", ") || "sin usuarios"}
                </p>
                <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                  {tenant.postsCount} publicaciones
                  {tenant.facebook?.fbUserName
                    ? ` · conexión propia: ${tenant.facebook.fbUserName}`
                    : " · usa tus conexiones"}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setCredentialsFor(credentialsFor === tenant.id ? null : tenant.id);
                    setCreds({ fbAppId: tenant.fbAppId ?? "", fbAppSecret: "" });
                  }}
                  title="Sólo si este cliente usa su propia app de Meta"
                >
                  {tenant.hasAppSecret ? "Credenciales propias" : "App propia"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void removeTenant(tenant)}
                  disabled={busy === tenant.id}
                  title="Eliminar cuenta"
                >
                  {busy === tenant.id ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>

            {tenant.users.length > 0 && (
              <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.4rem" }}>
                {tenant.users.map((user) => {
                  const isEditing = accessFor === user.id;
                  const assigned = user.socialProfileIds
                    .map((id) => pool.find((profile) => profile.id === id))
                    .filter((profile): profile is AdminProfile => Boolean(profile));

                  return (
                    <div
                      key={user.id}
                      style={{
                        padding: "0.6rem 0.75rem",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-color)",
                        background: "var(--bg-color)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "0.88rem" }}>{user.email}</span>
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: "0.72rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {user.role === "ADMIN" ? "admin" : "cliente"}
                          </span>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                            {assigned.length
                              ? assigned.map(profileLabel).join(" · ")
                              : "sin redes asignadas"}
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary"
                          disabled={pool.length === 0}
                          title={
                            pool.length === 0
                              ? "Primero vinculá redes con tu cuenta de Facebook"
                              : "Elegir redes de este usuario"
                          }
                          onClick={() => {
                            if (isEditing) {
                              setAccessFor(null);
                              return;
                            }
                            setAccessFor(user.id);
                            setAccessDraft(user.socialProfileIds);
                          }}
                        >
                          {isEditing ? "Cancelar" : "Asignar redes"}
                        </button>
                      </div>

                      {isEditing && (
                        <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.4rem" }}>
                          <NetworkPicker
                            networks={networks}
                            selection={accessDraft}
                            onChange={setAccessDraft}
                          />
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              className="btn btn-primary"
                              onClick={() => void saveUserAccess(user)}
                              disabled={busy === `access-${user.id}`}
                            >
                              {busy === `access-${user.id}` ? (
                                <Loader2 className="spin" size={16} />
                              ) : null}
                              Guardar redes
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setAccessFor(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {credentialsFor === tenant.id && (
              <div
                style={{
                  marginTop: "1rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--border-color)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 0.75rem",
                    color: "var(--text-secondary)",
                    fontSize: "0.78rem",
                  }}
                >
                  Opcional: sólo si este cliente va a conectar sus redes con su propia app de Meta.
                  Si no, las redes se siguen vinculando con tu cuenta desde «Redes sociales».
                </p>
                <div
                  style={{
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
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "0.5rem",
                      paddingBottom: "0.85rem",
                    }}
                  >
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
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
