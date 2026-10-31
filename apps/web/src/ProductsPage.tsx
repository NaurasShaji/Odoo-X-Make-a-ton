import { FormEvent, useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type Variant = { id: string; name: string; priceAddOn: string | number };
type Product = {
  id: string;
  name: string;
  type: string;
  salesPrice: string | number;
  costPrice: string | number;
  notes: string | null;
  createdAt: string;
  variants: Variant[];
};

type Props = { token: string; businessId: string };

const emptyForm = { name: "", type: "SERVICE", salesPrice: "", costPrice: "", notes: "" };

export default function ProductsPage({ token, businessId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [variantForm, setVariantForm] = useState({ name: "", priceAddOn: "0" });

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("x-business-id", businessId);
    if (options.body) headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? data.message ?? `Request failed (${response.status})`);
    return data as Record<string, any>;
  }, [token, businessId]);

  const loadProducts = useCallback(async (term = search) => {
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({ pageSize: "100" });
      if (term.trim()) query.set("search", term.trim());
      const result = await request(`/api/v1/products?${query.toString()}`);
      setProducts((result.products ?? []) as Product[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load products.");
    } finally {
      setBusy(false);
    }
  }, [request, search]);

  useEffect(() => { void loadProducts(""); }, [loadProducts]);

  function openForm(product?: Product) {
    setEditingId(product?.id ?? null);
    setForm(product ? {
      name: product.name,
      type: product.type,
      salesPrice: String(product.salesPrice),
      costPrice: String(product.costPrice),
      notes: product.notes ?? ""
    } : emptyForm);
    setError("");
    setModalOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, salesPrice: Number(form.salesPrice), costPrice: Number(form.costPrice) };
      await request(editingId ? `/api/v1/products/${editingId}` : "/api/v1/products", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setModalOpen(false);
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save product.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/products/${product.id}`, { method: "DELETE" });
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete product.");
    } finally {
      setBusy(false);
    }
  }

  async function addVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variantProduct) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/products/${variantProduct.id}/variants`, {
        method: "POST",
        body: JSON.stringify({ name: variantForm.name, priceAddOn: Number(variantForm.priceAddOn) })
      });
      setVariantForm({ name: "", priceAddOn: "0" });
      await loadProducts();
      const refreshed = await request(`/api/v1/products/${variantProduct.id}`);
      setVariantProduct(refreshed.product as Product);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add variant.");
    } finally {
      setBusy(false);
    }
  }

  async function removeVariant(variant: Variant) {
    if (!variantProduct) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/products/${variantProduct.id}/variants/${variant.id}`, { method: "DELETE" });
      await loadProducts();
      const refreshed = await request(`/api/v1/products/${variantProduct.id}`);
      setVariantProduct(refreshed.product as Product);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove variant.");
    } finally {
      setBusy(false);
    }
  }

  const money = (value: string | number) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <header className="section-heading customer-page-heading">
        <div><p className="eyebrow muted">CATALOG MANAGEMENT</p><h2>Products</h2><p className="muted helper">Manage the products and services you sell.</p></div>
        <button className="primary-button add-customer-button" onClick={() => openForm()}>+ Add product</button>
      </header>
      <section className="content-card">
        <div className="customer-toolbar">
          <input aria-label="Search products" placeholder="Search product name or type…" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void loadProducts(); }} />
          <button className="outline-button" onClick={() => void loadProducts()}>Search</button>
        </div>
        {error && <div className="alert error page-alert" role="alert">{error}</div>}
        {busy && !modalOpen ? <p className="empty-state">Loading products…</p> : products.length ? (
          <div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>Product</th><th>Type</th><th>Sales price</th><th>Cost price</th><th>Variants</th><th>Actions</th></tr></thead><tbody>
            {products.map(product => <tr key={product.id}><td><strong>{product.name}</strong>{product.notes && <small>{product.notes}</small>}</td><td>{product.type}</td><td>{money(product.salesPrice)}</td><td>{money(product.costPrice)}</td><td>{product.variants?.length ?? 0}</td><td><button className="table-action" onClick={() => openForm(product)}>Edit</button><button className="table-action" onClick={() => setVariantProduct(product)}>Variants</button><button className="table-action danger-text" onClick={() => void deleteProduct(product)}>Delete</button></td></tr>)}
          </tbody></table></div>
        ) : <div className="empty-customers"><div className="empty-icon">＋</div><strong>No products yet</strong><span>Add your first product or service to start building subscription plans.</span><button className="primary-button add-customer-button" onClick={() => openForm()}>Add product</button></div>}
      </section>
      {modalOpen && <div className="modal-backdrop"><section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-heading"><div><p className="eyebrow muted">CATALOG RECORD</p><h2 id="product-modal-title">{editingId ? "Edit product" : "Add product"}</h2></div><button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button></div>
        <form className="customer-form" onSubmit={saveProduct}>
          <label>Product name *<input required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <div className="form-two-col"><label>Type *<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="SERVICE">Service</option><option value="GOODS">Goods</option><option value="DIGITAL">Digital</option><option value="OTHER">Other</option></select></label><label>Sales price *<input required type="number" min="0" max="9999999999.99" step="0.01" value={form.salesPrice} onChange={e => setForm({ ...form, salesPrice: e.target.value })} /></label></div>
          <label>Cost price *<input required type="number" min="0" max="9999999999.99" step="0.01" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })} /></label>
          <label>Notes<textarea rows={3} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModalOpen(false)}>Cancel</button><button className="primary-button add-customer-button" type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Create product"}</button></div>
        </form>
      </section></div>}
      {variantProduct && <div className="modal-backdrop"><section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="variant-modal-title"><div className="modal-heading"><div><p className="eyebrow muted">PRODUCT OPTIONS</p><h2 id="variant-modal-title">{variantProduct.name} variants</h2></div><button className="modal-close" onClick={() => setVariantProduct(null)} aria-label="Close">×</button></div>
        {variantProduct.variants?.length ? <div className="member-list">{variantProduct.variants.map(variant => <div className="member-row" key={variant.id}><div className="member-info"><strong>{variant.name}</strong><span>Additional price: {money(variant.priceAddOn)}</span></div><button className="table-action danger-text" onClick={() => void removeVariant(variant)}>Remove</button></div>)}</div> : <p className="empty-state">No variants configured.</p>}
        <form className="customer-form" onSubmit={addVariant}><label>Variant name *<input required maxLength={120} value={variantForm.name} onChange={e => setVariantForm({ ...variantForm, name: e.target.value })} /></label><label>Additional price *<input required type="number" min="0" step="0.01" value={variantForm.priceAddOn} onChange={e => setVariantForm({ ...variantForm, priceAddOn: e.target.value })} /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setVariantProduct(null)}>Close</button><button className="primary-button add-customer-button" disabled={busy}>Add variant</button></div></form>
      </section></div>}
    </>
  );
}
