import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Workspace = {
  businessId: string;
  role: string;
  business: { name: string; slug: string };
};

type Member = {
  userId: string;
  role: string;
  createdAt: string;
  user: { email: string };
};

type AuthResponse = {
  token: string;
  user: { id: string; email: string };
  business?: { id: string; name: string };
};

function App() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("nexbill_token") ?? "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("nexbill_email") ?? "");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.businessId === selectedBusinessId),
    [workspaces, selectedBusinessId]
  );

  async function apiRequest<T>(path: string, options: RequestInit = {}, businessId?: string): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (businessId) headers.set("x-business-id", businessId);
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? data.message ?? `Request failed (${response.status})`);
    return data as T;
  }

  async function loadWorkspaces(activeToken = token) {
    const headers = { Authorization: `Bearer ${activeToken}` };
    const response = await fetch(`${API_BASE}/api/v1/workspaces`, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Could not load workspaces.");
    const items = (data.workspaces ?? []) as Workspace[];
    setWorkspaces(items);
    if (items.length) setSelectedBusinessId((current) => items.some((item) => item.businessId === current) ? current : items[0].businessId);
  }

  useEffect(() => {
    if (!token) return;
    loadWorkspaces().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not restore your session.");
      setToken("");
      localStorage.removeItem("nexbill_token");
      localStorage.removeItem("nexbill_email");
    });
  }, []);

  useEffect(() => {
    if (!token || !selectedBusinessId) return;
    apiRequest<{ members: Member[] }>("/api/v1/workspaces/members", {}, selectedBusinessId)
      .then((data) => setMembers(data.members ?? []))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspace members."));
  }, [token, selectedBusinessId]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const path = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const body = mode === "register" ? { email, password, businessName } : { email, password };
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Authentication failed.");
      const result = data as AuthResponse;
      localStorage.setItem("nexbill_token", result.token);
      localStorage.setItem("nexbill_email", result.user.email);
      setToken(result.token);
      setUserEmail(result.user.email);
      await loadWorkspaces(result.token);
      setNotice(mode === "register" ? "Your NexBill workspace is ready." : "Signed in successfully.");
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    localStorage.removeItem("nexbill_token");
    localStorage.removeItem("nexbill_email");
    setToken("");
    setUserEmail("");
    setWorkspaces([]);
    setMembers([]);
    setSelectedBusinessId("");
    setNotice("You have signed out.");
    setError("");
  }

  if (!token) {
    return (
      <main className="auth-layout">
        <section className="brand-panel">
          <div className="brand-mark">N</div>
          <p className="eyebrow">Subscription management</p>
          <h1>NexBill</h1>
          <p className="brand-copy">One platform. Every subscription. Every transaction. Fully connected.</p>
          <div className="brand-foot">Billing clarity for growing businesses.</div>
        </section>
        <section className="auth-panel">
          <div className="auth-card">
            <div className="mobile-brand"><span className="brand-mark">N</span><strong>NexBill</strong></div>
            <p className="eyebrow muted">{mode === "login" ? "Welcome back" : "Get started"}</p>
            <h2>{mode === "login" ? "Sign in to your account" : "Create your workspace"}</h2>
            <p className="muted helper">{mode === "login" ? "Enter your details to continue to NexBill." : "Set up your business workspace in a few steps."}</p>
            <form onSubmit={handleAuth}>
              {mode === "register" && <label>Business name<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Acme Studio" minLength={2} maxLength={120} required /></label>}
              <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" minLength={mode === "register" ? 12 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
              {error && <div className="alert error" role="alert">{error}</div>}
              {notice && <div className="alert success">{notice}</div>}
              <button className="primary-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
            </form>
            <p className="switch-mode">{mode === "login" ? "New to NexBill?" : "Already have an account?"} <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
            <p className="legal-note">Secure workspace access · Multi-tenant by design</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark">N</span><strong>NexBill</strong></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-picker">
          <span className="workspace-avatar">{selectedWorkspace?.business.name.slice(0, 1).toUpperCase() ?? "W"}</span>
          <span className="workspace-name">{selectedWorkspace?.business.name ?? "Loading workspace…"}</span>
        </div>
        <nav className="side-nav"><span className="nav-item active">Overview</span><span className="nav-item disabled">Customers <small>Coming soon</small></span><span className="nav-item disabled">Products & plans <small>Coming soon</small></span><span className="nav-item disabled">Subscriptions <small>Coming soon</small></span><span className="nav-item disabled">Invoices <small>Coming soon</small></span></nav>
        <div className="sidebar-bottom"><div className="user-avatar">{userEmail.slice(0, 1).toUpperCase()}</div><div className="user-details"><strong>{userEmail}</strong><span>{selectedWorkspace?.role ?? "Member"}</span></div><button className="logout-button" onClick={signOut} title="Sign out" aria-label="Sign out">↗</button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow muted">WORKSPACE OVERVIEW</p><h1>Good to see you</h1></div><div className="topbar-right"><span className="status-pill"><i /> API connected</span><button className="outline-button" onClick={signOut}>Sign out</button></div></header>
        {error && <div className="alert error page-alert" role="alert">{error}</div>}
        {notice && <div className="alert success page-alert">{notice}</div>}
        <section className="welcome-card"><div><p className="eyebrow">YOUR BUSINESS</p><h2>{selectedWorkspace?.business.name ?? "Your workspace"}</h2><p>Workspace access is active. Your billing modules will appear here as they are implemented.</p></div><div className="welcome-icon">✦</div></section>
        <section className="metric-grid"><article className="metric-card"><span className="metric-label">Workspace role</span><strong>{selectedWorkspace?.role ?? "—"}</strong><span className="metric-foot">Your access level</span></article><article className="metric-card"><span className="metric-label">Team members</span><strong>{members.length}</strong><span className="metric-foot">People in this workspace</span></article><article className="metric-card"><span className="metric-label">Workspace status</span><strong className="active-text">Active</strong><span className="metric-foot">Membership verified</span></article></section>
        <section className="content-card"><div className="section-heading"><div><p className="eyebrow muted">ACCESS CONTROL</p><h2>Workspace members</h2></div><span className="count-badge">{members.length} members</span></div>
          {members.length ? <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><div className="member-avatar">{member.user.email.slice(0, 1).toUpperCase()}</div><div className="member-info"><strong>{member.user.email}</strong><span>Joined {new Date(member.createdAt).toLocaleDateString()}</span></div><span className={`role-badge ${member.role.toLowerCase()}`}>{member.role}</span></div>)}</div> : <p className="empty-state">No workspace members found.</p>}
        </section>
        <p className="page-foot">NexBill · Subscription and recurring revenue management</p>
      </main>
    </div>
  );
}

export default App;
