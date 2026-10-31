import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, ApiRequest } from "../api";

type Variant = { id?: string; name: string; priceAddOn: string | number };
export type Product = {
  id: string;
  name: string;
  type: string;
  salesPrice: string | number;
  costPrice: string | number;
  notes: string | null;
  createdAt: string;
  variants: Variant[];
};
type Pagination = { page: number; pageSize: number; total: number; pages: number };
type FormVariant = { key: string; name: string; priceAddOn: string };
type ProductForm = { name: string; type: string; salesPrice: string; costPrice: string; notes: string; variants: FormVariant[] };
type Errors = Record<string, string>;

const PAGE_SIZE = 10;
const MAX_MONEY = 9999999999.99;
const SUGGESTED_TYPES = ["Service", "Software", "Add-on", "Subscription", "Hardware", "Consumable"];
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" }
];
const emptyForm = (): ProductForm => ({ name: "", type: "", salesPrice: "", costPrice: "", notes: "", variants: [] });
let variantKey = 0;
const newKey = () => `v${++variantKey}`;

const money = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMoney = (value: string | number) => money.format(Number(value));

function validatePrice(raw: string, label: string, required: boolean): string | undefined {
  const value = raw.trim();
  if (!value) return required ? `${label} is required.` : undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return /^-/.test(value) ? `${label} cannot be negative.` : `${label} must be a number with up to 2 decimals.`;
  if (Number(value) > MAX_MONEY) return `${label} is too large.`;
  return undefined;
}

export function validateProductForm(form: ProductForm): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = "Product name is required.";
  else if (form.name.trim().length > 160) errors.name = "Product name must be 160 characters or fewer.";
  if (!form.type.trim()) errors.type = "Product type is required.";
  else if (form.type.trim().length > 60) errors.type = "Product type must be 60 characters or fewer.";
  const sales = validatePrice(form.salesPrice, "Sales price", true);
  if (sales) errors.salesPrice = sales;
  const cost = validatePrice(form.costPrice, "Cost price", true);
  if (cost) errors.costPrice = cost;
  if (form.notes.length > 2000) errors.notes = "Notes must be 2000 characters or fewer.";
  const seen = new Set<string>();
  form.variants.forEach((variant, index) => {
    const name = variant.name.trim();
    if (!name) errors[`variants.${index}.name`] = "Variant name is required.";
    else if (name.length > 120) errors[`variants.${index}.name`] = "Variant name must be 120 characters or fewer.";
    else if (seen.has(name.toLowerCase())) errors[`variants.${index}.name`] = "Variant names must be unique.";
    seen.add(name.toLowerCase());
    const addOn = validatePrice(variant.priceAddOn, "Price add-on", true);
    if (addOn) errors[`variants.${index}.priceAddOn`] = addOn;
  });
  return errors;
}

function toPayload(form: ProductForm) {
  return {
    name: form.name.trim(),
    type: form.type.trim(),
    salesPrice: Number(form.salesPrice),
    costPrice: Number(form.costPrice),
    notes: form.notes.trim(),
    variants: form.variants.map((variant) => ({ name: variant.name.trim(), priceAddOn: Number(variant.priceAddOn) }))
  };
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ProductsPage({ apiRequest, businessId }: { apiRequest: ApiRequest; businessId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, pages: 0 });
  const [types, setTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const debouncedSearch = useDebounced(search, 300);
  const requestId = useRef(0);
  const filtersActive = Boolean(search.trim() || typeFilter || sort !== "newest");

  const loadProducts = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setListError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
      if (debouncedSearch.trim()) query.set("search", debouncedSearch.trim());
      if (typeFilter) query.set("type", typeFilter);
      const data = await apiRequest<{ products: Product[]; pagination: Pagination }>(`/api/v1/products?${query}`, {}, businessId);
      if (current !== requestId.current) return;
      if (data.pagination.pages > 0 && page > data.pagination.pages) { setPage(data.pagination.pages); return; }
      setProducts(data.products);
      setPagination(data.pagination);
    } catch (cause) {
      if (current === requestId.current) setListError(cause instanceof Error ? cause.message : "Could not load products.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [apiRequest, businessId, page, sort, typeFilter, debouncedSearch]);

  const loadTypes = useCallback(async () => {
    try {
      const data = await apiRequest<{ types: string[] }>("/api/v1/products/types", {}, businessId);
      setTypes(data.types);
    } catch {
      setTypes([]);
    }
  }, [apiRequest, businessId]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);
  useEffect(() => { void loadTypes(); }, [loadTypes]);
  useEffect(() => { setPage(1); }, [debouncedSearch, typeFilter, sort]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!modalOpen && !deleting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (modalOpen && !saving) setModalOpen(false);
      if (deleting && !deleteBusy) setDeleting(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, deleting, saving, deleteBusy]);

  const typeOptions = useMemo(() => Array.from(new Set([...types, ...SUGGESTED_TYPES])).sort((a, b) => a.localeCompare(b)), [types]);
  const liveErrors = touched ? validateProductForm(form) : {};
  const shownErrors = { ...liveErrors, ...errors };
  const sales = Number(form.salesPrice);
  const cost = Number(form.costPrice);
  const marginWarning = form.salesPrice && form.costPrice && !shownErrors.salesPrice && !shownErrors.costPrice && cost > sales
    ? "Cost price is higher than the sales price, so this product sells at a loss." : "";

  function openForm(product?: Product) {
    setEditing(product ?? null);
    setForm(product ? {
      name: product.name,
      type: product.type,
      salesPrice: String(Number(product.salesPrice)),
      costPrice: String(Number(product.costPrice)),
      notes: product.notes ?? "",
      variants: product.variants.map((variant) => ({ key: newKey(), name: variant.name, priceAddOn: String(Number(variant.priceAddOn)) }))
    } : emptyForm());
    setErrors({});
    setFormError("");
    setTouched(false);
    setModalOpen(true);
  }

  function update<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field as string]; return next; });
  }

  function updateVariant(index: number, field: "name" | "priceAddOn", value: string) {
    setForm((current) => ({ ...current, variants: current.variants.map((variant, i) => i === index ? { ...variant, [field]: value } : variant) }));
    setErrors((current) => { const next = { ...current }; delete next[`variants.${index}.${field}`]; return next; });
  }

  function removeVariant(index: number) {
    setForm((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));
    setErrors({});
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    const clientErrors = validateProductForm(form);
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors);
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await apiRequest(editing ? `/api/v1/products/${editing.id}` : "/api/v1/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(toPayload(form))
      }, businessId);
      setModalOpen(false);
      setNotice(editing ? `Saved changes to ${form.name.trim()}.` : `${form.name.trim()} was added.`);
      if (!editing) setPage(1);
      await Promise.all([loadProducts(), loadTypes()]);
    } catch (cause) {
      if (cause instanceof ApiError && cause.fieldErrors) setErrors(cause.fieldErrors);
      setFormError(cause instanceof Error ? cause.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await apiRequest(`/api/v1/products/${deleting.id}`, { method: "DELETE" }, businessId);
      setNotice(`${deleting.name} was deleted.`);
      setDeleting(null);
      await Promise.all([loadProducts(), loadTypes()]);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete the product.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setTypeFilter("");
    setSort("newest");
  }

  const fieldError = (key: string) => shownErrors[key] ? <span className="field-error" id={`${key}-error`}>{shownErrors[key]}</span> : null;
  const invalid = (key: string) => shownErrors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {};
  const firstRow = pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const lastRow = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <>
      <header className="section-heading customer-page-heading">
        <div><p className="eyebrow muted">CATALOG</p><h2>Products</h2><p className="muted helper">Manage the products and variants you sell on subscription.</p></div>
        <button className="primary-button add-customer-button" onClick={() => openForm()}>+ Add product</button>
      </header>
      {notice && <div className="alert success page-alert" role="status">{notice}</div>}
      <section className="content-card">
        <div className="product-toolbar">
          <input className="product-search" type="search" aria-label="Search products" placeholder="Search name, type, notes or variant…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            {types.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}>
            {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {filtersActive && <button className="outline-button" onClick={clearFilters}>Clear</button>}
        </div>
        {listError && <div className="alert error" role="alert">{listError} <button className="text-button" onClick={() => void loadProducts()}>Retry</button></div>}
        {loading && !products.length ? <p className="empty-state">Loading products…</p> : products.length ? (
          <>
            <div className={`customer-table-wrap ${loading ? "is-loading" : ""}`}>
              <table className="customer-table">
                <thead><tr><th>Product</th><th>Type</th><th className="num">Sales price</th><th className="num">Cost price</th><th className="num">Margin</th><th>Variants</th><th>Actions</th></tr></thead>
                <tbody>
                  {products.map((product) => {
                    const salesPrice = Number(product.salesPrice);
                    const margin = salesPrice > 0 ? ((salesPrice - Number(product.costPrice)) / salesPrice) * 100 : null;
                    return (
                      <tr key={product.id}>
                        <td><strong>{product.name}</strong>{product.notes && <small className="truncate" title={product.notes}>{product.notes}</small>}</td>
                        <td><span className="type-chip">{product.type}</span></td>
                        <td className="num">{formatMoney(product.salesPrice)}</td>
                        <td className="num">{formatMoney(product.costPrice)}</td>
                        <td className={`num ${margin !== null && margin < 0 ? "danger-text" : ""}`}>{margin === null ? "—" : `${margin.toFixed(1)}%`}</td>
                        <td>{product.variants.length ? <div className="variant-chips">{product.variants.slice(0, 3).map((variant) => <span key={variant.id ?? variant.name} className="variant-chip">{variant.name} +{formatMoney(variant.priceAddOn)}</span>)}{product.variants.length > 3 && <span className="variant-chip">+{product.variants.length - 3} more</span>}</div> : <span className="muted">—</span>}</td>
                        <td><button className="table-action" onClick={() => openForm(product)}>Edit</button><button className="table-action danger-text" onClick={() => { setDeleteError(""); setDeleting(product); }}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>Showing {firstRow}–{lastRow} of {pagination.total}</span>
              <div><button className="outline-button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><span className="pager-page">Page {pagination.page} of {Math.max(1, pagination.pages)}</span><button className="outline-button" disabled={page >= pagination.pages || loading} onClick={() => setPage(page + 1)}>Next</button></div>
            </div>
          </>
        ) : filtersActive ? (
          <div className="empty-customers"><div className="empty-icon">⌕</div><strong>No matching products</strong><span>Try a different search or clear the filters.</span><button className="outline-button" onClick={clearFilters}>Clear filters</button></div>
        ) : (
          <div className="empty-customers"><div className="empty-icon">＋</div><strong>No products yet</strong><span>Add your first product so you can include it in plans and subscriptions.</span><button className="primary-button add-customer-button" onClick={() => openForm()}>Add product</button></div>
        )}
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
          <section className="customer-modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div className="modal-heading"><div><p className="eyebrow muted">{editing ? "PRODUCT DETAILS" : "NEW PRODUCT"}</p><h2 id="product-modal-title">{editing ? "Edit product" : "Add product"}</h2></div><button className="modal-close" onClick={() => setModalOpen(false)} disabled={saving} aria-label="Close">×</button></div>
            <form className="customer-form" onSubmit={saveProduct} noValidate>
              <label>Product name *<input autoFocus maxLength={160} value={form.name} onChange={(e) => update("name", e.target.value)} {...invalid("name")} />{fieldError("name")}</label>
              <label>Type *<input list="product-type-options" maxLength={60} placeholder="e.g. Software" value={form.type} onChange={(e) => update("type", e.target.value)} {...invalid("type")} /><datalist id="product-type-options">{typeOptions.map((type) => <option key={type} value={type} />)}</datalist>{fieldError("type")}</label>
              <div className="form-two-col">
                <label>Sales price *<input inputMode="decimal" placeholder="0.00" value={form.salesPrice} onChange={(e) => update("salesPrice", e.target.value)} {...invalid("salesPrice")} />{fieldError("salesPrice")}</label>
                <label>Cost price *<input inputMode="decimal" placeholder="0.00" value={form.costPrice} onChange={(e) => update("costPrice", e.target.value)} {...invalid("costPrice")} />{fieldError("costPrice")}</label>
              </div>
              {marginWarning && <div className="alert warning">{marginWarning}</div>}
              <label>Notes<textarea rows={3} maxLength={2000} value={form.notes} onChange={(e) => update("notes", e.target.value)} {...invalid("notes")} /><span className="field-hint">{form.notes.length}/2000</span>{fieldError("notes")}</label>

              <fieldset className="variant-fieldset">
                <legend>Variants <span className="muted">(optional)</span></legend>
                <p className="field-hint">Add options such as a brand or edition. The add-on is added to the sales price.</p>
                {form.variants.map((variant, index) => (
                  <div className="variant-row" key={variant.key}>
                    <label>Variant name<input maxLength={120} placeholder="e.g. Odoo" value={variant.name} onChange={(e) => updateVariant(index, "name", e.target.value)} {...invalid(`variants.${index}.name`)} />{fieldError(`variants.${index}.name`)}</label>
                    <label>Price add-on<input inputMode="decimal" placeholder="0.00" value={variant.priceAddOn} onChange={(e) => updateVariant(index, "priceAddOn", e.target.value)} {...invalid(`variants.${index}.priceAddOn`)} />{fieldError(`variants.${index}.priceAddOn`)}</label>
                    <div className="variant-total"><span>Final price</span><strong>{!validatePrice(form.salesPrice, "", true) && !validatePrice(variant.priceAddOn, "", true) ? formatMoney(sales + Number(variant.priceAddOn)) : "—"}</strong></div>
                    <button type="button" className="table-action danger-text variant-remove" onClick={() => removeVariant(index)} aria-label={`Remove variant ${variant.name || index + 1}`}>Remove</button>
                  </div>
                ))}
                {form.variants.length < 50 && <button type="button" className="outline-button" onClick={() => setForm((current) => ({ ...current, variants: [...current.variants, { key: newKey(), name: "", priceAddOn: "" }] }))}>+ Add variant</button>}
              </fieldset>

              {formError && <div className="alert error" role="alert">{formError}</div>}
              <div className="modal-actions"><button type="button" className="outline-button" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button className="primary-button add-customer-button" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create product"}</button></div>
            </form>
          </section>
        </div>
      )}

      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <section className="customer-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title">
            <div className="modal-heading"><div><p className="eyebrow muted">DELETE PRODUCT</p><h2 id="delete-product-title">Delete {deleting.name}?</h2></div></div>
            <p className="muted helper">This removes the product and its {deleting.variants.length} variant{deleting.variants.length === 1 ? "" : "s"}. Products used in plans, quotations, subscriptions or invoices can't be deleted.</p>
            {deleteError && <div className="alert error" role="alert">{deleteError}</div>}
            <div className="modal-actions"><button className="outline-button" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button><button className="primary-button add-customer-button danger-button" onClick={() => void confirmDelete()} disabled={deleteBusy}>{deleteBusy ? "Deleting…" : "Delete product"}</button></div>
          </section>
        </div>
      )}
    </>
  );
}
