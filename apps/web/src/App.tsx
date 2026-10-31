import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Workspace = {
  businessId: string;
  role: string;
  business: { name: string; slug: string };
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
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
  const [page, setPage] = useState<"overview" | "customers" | "products" | "plans" | "subscriptions" | "quotations" | "invoices" | "payments" | "reports">("overview");
  const [moduleRows, setModuleRows] = useState<Record<string, unknown>[]>([]);
  const [moduleBusy, setModuleBusy] = useState(false);
  const [moduleError, setModuleError] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerModal, setCustomerModal] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: "", email: "", phone: "", companyName: "", address: "", notes: "" });
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

  async function loadCustomers(search = customerSearch) {
    if (!selectedBusinessId) return;
    setCustomerBusy(true);
    setCustomerError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      const result = await apiRequest<{ customers: Customer[] }>(`/api/v1/customers?${query.toString()}`, {}, selectedBusinessId);
      setCustomers(result.customers);
    } catch (cause) {
      setCustomerError(cause instanceof Error ? cause.message : "Could not load customers.");
    } finally {
      setCustomerBusy(false);
    }
  }

  useEffect(() => {
    if (token && selectedBusinessId && page === "customers") void loadCustomers();
  }, [token, selectedBusinessId, page]);

  const moduleConfig = {
    products: { endpoint: "/api/v1/products", key: "products", title: "Products", description: "Manage your billable products and variants." },
    plans: { endpoint: "/api/v1/plans", key: "plans", title: "Subscription plans", description: "Manage recurring plans, billing periods and plan items." },
    subscriptions: { endpoint: "/api/v1/subscriptions", key: "subscriptions", title: "Subscriptions", description: "Review subscription lifecycle and customer assignments." },
    quotations: { endpoint: "/api/v1/quotations", key: "quotations", title: "Quotations", description: "Track quotations, totals and conversion status." },
    invoices: { endpoint: "/api/v1/invoices", key: "invoices", title: "Invoices", description: "Review generated invoices and outstanding balances." },
    payments: { endpoint: "/api/v1/payments", key: "payments", title: "Payments", description: "Review recorded payments and refunds." }
  } as const;

  async function loadModule() {
    if (!selectedBusinessId || page === "overview" || page === "customers") return;
    setModuleBusy(true);
    setModuleError("");
    try {
      if (page === "reports") {
        const data = await apiRequest<{ metrics: Record<string, unknown>; upcomingRenewals: Record<string, unknown>[] }>("/api/v1/dashboard/summary", {}, selectedBusinessId);
        setModuleRows([
          ...Object.entries(data.metrics ?? {}).map(([label, value]) => ({ id: label, label: label.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), value })),
          ...(data.upcomingRenewals ?? []).map((item) => ({ ...item, recordType: "Upcoming renewal" }))
        ]);
      } else {
        const config = moduleConfig[page];
        const data = await apiRequest<Record<string, unknown>>(`${config.endpoint}?pageSize=100`, {}, selectedBusinessId);
        setModuleRows((data[config.key] as Record<string, unknown>[]) ?? []);
      }
    } catch (cause) {
      setModuleError(cause instanceof Error ? cause.message : "Could not load this module.");
      setModuleRows([]);
    } finally {
      setModuleBusy(false);
    }
  }

  useEffect(() => {
    if (token && selectedBusinessId && page !== "overview" && page !== "customers") void loadModule();
  }, [token, selectedBusinessId, page]);

  function moduleTitle(row: Record<string, unknown>) {
    return String(row.name ?? row.number ?? row.id ?? "Record");
  }

  function moduleSecondary(row: Record<string, unknown>) {
    const customer = row.customer as { name?: string } | undefined;
    const plan = row.plan as { name?: string } | undefined;
    return customer?.name ?? plan?.name ?? String(row.type ?? row.method ?? row.recordType ?? "");
  }

  function openCustomer(customer?: Customer) {
    setEditingCustomerId(customer?.id ?? null);
    setCustomerForm({
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      companyName: customer?.companyName ?? "",
      address: customer?.address ?? "",
      notes: customer?.notes ?? ""
    });
    setCustomerError("");
    setCustomerModal(true);
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCustomerBusy(true);
    setCustomerError("");
    try {
      await apiRequest(editingCustomerId ? `/api/v1/customers/${editingCustomerId}` : "/api/v1/customers", {
        method: editingCustomerId ? "PATCH" : "POST",
        body: JSON.stringify(customerForm)
      }, selectedBusinessId);
      setCustomerModal(false);
      await loadCustomers();
    } catch (cause) {
      setCustomerError(cause instanceof Error ? cause.message : "Could not save customer.");
    } finally {
      setCustomerBusy(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return;
    setCustomerBusy(true);
    setCustomerError("");
    try {
      await apiRequest(`/api/v1/customers/${customer.id}`, { method: "DELETE" }, selectedBusinessId);
      await loadCustomers();
    } catch (cause) {
      setCustomerError(cause instanceof Error ? cause.message : "Could not delete customer.");
    } finally {
      setCustomerBusy(false);
    }
  }

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
        <nav className="side-nav"><button className={`nav-item ${page === "overview" ? "active" : ""}`} onClick={() => setPage("overview")}>Overview</button><button className={`nav-item ${page === "customers" ? "active" : ""}`} onClick={() => setPage("customers")}>Customers</button><button className={`nav-item ${page === "products" ? "active" : ""}`} onClick={() => setPage("products")}>Products</button><button className={`nav-item ${page === "plans" ? "active" : ""}`} onClick={() => setPage("plans")}>Plans</button><button className={`nav-item ${page === "subscriptions" ? "active" : ""}`} onClick={() => setPage("subscriptions")}>Subscriptions</button><button className={`nav-item ${page === "quotations" ? "active" : ""}`} onClick={() => setPage("quotations")}>Quotations</button><button className={`nav-item ${page === "invoices" ? "active" : ""}`} onClick={() => setPage("invoices")}>Invoices</button><button className={`nav-item ${page === "payments" ? "active" : ""}`} onClick={() => setPage("payments")}>Payments</button><button className={`nav-item ${page === "reports" ? "active" : ""}`} onClick={() => setPage("reports")}>Reports</button></nav>
        <div className="sidebar-bottom"><div className="user-avatar">{userEmail.slice(0, 1).toUpperCase()}</div><div className="user-details"><strong>{userEmail}</strong><span>{selectedWorkspace?.role ?? "Member"}</span></div><button className="logout-button" onClick={signOut} title="Sign out" aria-label="Sign out">↗</button></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div><p className="eyebrow muted">WORKSPACE OVERVIEW</p><h1>Good to see you</h1></div><div className="topbar-right"><span className="status-pill"><i /> API connected</span><button className="outline-button" onClick={signOut}>Sign out</button></div></header>
        {error && <div className="alert error page-alert" role="alert">{error}</div>}
        {notice && <div className="alert success page-alert">{notice}</div>}
        {page === "customers" ? (
          <>
            <header className="section-heading customer-page-heading"><div><p className="eyebrow muted">RELATIONSHIP MANAGEMENT</p><h2>Customers</h2><p className="muted helper">Manage the people and businesses you bill.</p></div><button className="primary-button add-customer-button" onClick={() => openCustomer()}>+ Add customer</button></header>
            <section className="content-card">
              <div className="customer-toolbar"><input aria-label="Search customers" placeholder="Search name, email, company or phone…" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadCustomers(); }} /><button className="outline-button" onClick={() => void loadCustomers()}>Search</button></div>
              {customerError && <div className="alert error" role="alert">{customerError}</div>}
              {customerBusy ? <p className="empty-state">Loading customers…</p> : customers.length ? <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Customer</th><th>Contact</th><th>Company</th><th>Added</th><th>Actions</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.email ?? "—"}<small>{customer.phone ?? ""}</small></td><td>{customer.companyName ?? "—"}</td><td>{new Date(customer.createdAt).toLocaleDateString()}</td><td><button className="table-action" onClick={() => openCustomer(customer)}>Edit</button><button className="table-action danger-text" onClick={() => void deleteCustomer(customer)}>Delete</button></td></tr>)}</tbody></table></div> : <div className="empty-customers"><div className="empty-icon">＋</div><strong>No customers yet</strong><span>Add your first customer to start managing billing relationships.</span><button className="primary-button add-customer-button" onClick={() => openCustomer()}>Add customer</button></div>}
            </section>
            {customerModal && <div className="modal-backdrop" role="presentation"><section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title"><div className="modal-heading"><div><p className="eyebrow muted">{editingCustomerId ? "CUSTOMER DETAILS" : "NEW RECORD"}</p><h2 id="customer-modal-title">{editingCustomerId ? "Edit customer" : "Add customer"}</h2></div><button className="modal-close" onClick={() => setCustomerModal(false)} aria-label="Close">×</button></div><form className="customer-form" onSubmit={saveCustomer}><label>Customer name *<input required maxLength={160} value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></label><div className="form-two-col"><label>Email<input type="email" maxLength={254} value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></label><label>Phone<input maxLength={40} value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></label></div><label>Company name<input maxLength={160} value={customerForm.companyName} onChange={(e) => setCustomerForm({ ...customerForm, companyName: e.target.value })} /></label><label>Address<textarea rows={2} maxLength={1000} value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></label><label>Notes<textarea rows={3} maxLength={2000} value={customerForm.notes} onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })} /></label>{customerError && <div className="alert error">{customerError}</div>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setCustomerModal(false)}>Cancel</button><button className="primary-button add-customer-button" type="submit" disabled={customerBusy}>{customerBusy ? "Saving…" : editingCustomerId ? "Save changes" : "Create customer"}</button></div></form></section></div>}
          </>
        ) : page !== "overview" ? (
          <>
            <header className="section-heading customer-page-heading"><div><p className="eyebrow muted">BUSINESS OPERATIONS</p><h2>{page === "reports" ? "Reports & analytics" : moduleConfig[page].title}</h2><p className="muted helper">{page === "reports" ? "Revenue metrics and upcoming renewal activity." : moduleConfig[page].description}</p></div><button className="outline-button" onClick={() => void loadModule()}>Refresh</button></header>
            <section className="content-card">
              {moduleError && <div className="alert error" role="alert">{moduleError}</div>}
              {moduleBusy ? <p className="empty-state">Loading records…</p> : moduleRows.length ? (
                page === "reports" ? (
                  <div className="metric-grid">{moduleRows.map((row) => <article className="metric-card" key={String(row.id ?? row.number)}><span className="metric-label">{String(row.label ?? row.recordType ?? "Metric")}</span><strong>{String(row.value ?? row.number ?? row.name ?? "—")}</strong><span className="metric-foot">{row.expiryDate ? `Expires ${new Date(String(row.expiryDate)).toLocaleDateString()}` : row.customer ? String((row.customer as { name?: string }).name ?? "") : ""}</span></article>)}</div>
                ) : (
                  <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Record</th><th>Details</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead><tbody>{moduleRows.map((row, index) => <tr key={String(row.id ?? index)}><td><strong>{moduleTitle(row)}</strong></td><td>{moduleSecondary(row) || "—"}</td><td>{String(row.status ?? "—")}</td><td>{row.total !== undefined ? String(row.total) : row.amount !== undefined ? String(row.amount) : row.price !== undefined ? String(row.price) : "—"}</td><td>{row.createdAt || row.dueDate || row.startDate ? new Date(String(row.createdAt ?? row.dueDate ?? row.startDate)).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div>
                )
              ) : <div className="empty-customers"><div className="empty-icon">—</div><strong>No records found</strong><span>There are no records in this module yet.</span></div>}
            </section>
          </>
        ) : (
        <>
        <section className="welcome-card"><div><p className="eyebrow">YOUR BUSINESS</p><h2>{selectedWorkspace?.business.name ?? "Your workspace"}</h2><p>Workspace access is active. Your billing modules will appear here as they are implemented.</p></div><div className="welcome-icon">✦</div></section>
        <section className="metric-grid"><article className="metric-card"><span className="metric-label">Workspace role</span><strong>{selectedWorkspace?.role ?? "—"}</strong><span className="metric-foot">Your access level</span></article><article className="metric-card"><span className="metric-label">Team members</span><strong>{members.length}</strong><span className="metric-foot">People in this workspace</span></article><article className="metric-card"><span className="metric-label">Workspace status</span><strong className="active-text">Active</strong><span className="metric-foot">Membership verified</span></article></section>
        <section className="content-card"><div className="section-heading"><div><p className="eyebrow muted">ACCESS CONTROL</p><h2>Workspace members</h2></div><span className="count-badge">{members.length} members</span></div>
          {members.length ? <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><div className="member-avatar">{member.user.email.slice(0, 1).toUpperCase()}</div><div className="member-info"><strong>{member.user.email}</strong><span>Joined {new Date(member.createdAt).toLocaleDateString()}</span></div><span className={`role-badge ${member.role.toLowerCase()}`}>{member.role}</span></div>)}</div> : <p className="empty-state">No workspace members found.</p>}
        </section>
        </>
        )}
        <p className="page-foot">NexBill · Subscription and recurring revenue management</p>
      </main>
    </div>
  );
}

export default App;
