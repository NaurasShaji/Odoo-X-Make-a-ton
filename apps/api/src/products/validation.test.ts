import assert from "node:assert/strict";
import test from "node:test";
import { fieldErrors, parseListQuery, productCreateSchema, productUpdateSchema } from "./validation.js";

const valid = { name: "Billing Suite", type: "Software", salesPrice: 1200, costPrice: 400, notes: "" };

test("accepts a valid product with variants", () => {
  const parsed = productCreateSchema.safeParse({ ...valid, variants: [{ name: "Odoo", priceAddOn: 560 }, { name: "Standard", priceAddOn: 0 }] });
  assert.equal(parsed.success, true);
});

test("rejects missing name, negative price and too many decimals with field messages", () => {
  const parsed = productCreateSchema.safeParse({ ...valid, name: "  ", salesPrice: -1, costPrice: 10.555 });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    assert.equal(errors.name, "Product name is required.");
    assert.equal(errors.salesPrice, "Sales price cannot be negative.");
    assert.equal(errors.costPrice, "Cost price can have at most 2 decimal places.");
  }
});

test("rejects non-numeric prices and unknown fields", () => {
  assert.equal(productCreateSchema.safeParse({ ...valid, salesPrice: "100" }).success, false);
  assert.equal(productCreateSchema.safeParse({ ...valid, businessId: "other" }).success, false);
});

test("rejects duplicate variant names case-insensitively", () => {
  const parsed = productCreateSchema.safeParse({ ...valid, variants: [{ name: "Odoo", priceAddOn: 560 }, { name: " odoo ", priceAddOn: 10 }] });
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(fieldErrors(parsed.error)["variants.1.name"], "Variant names must be unique.");
});

test("update schema allows partial changes but still validates them", () => {
  assert.equal(productUpdateSchema.safeParse({ salesPrice: 99.99 }).success, true);
  assert.equal(productUpdateSchema.safeParse({ type: "" }).success, false);
});

test("list query falls back to safe defaults", () => {
  assert.deepEqual(parseListQuery({}), { search: "", type: "", sort: "newest", page: 1, pageSize: 20 });
  assert.deepEqual(parseListQuery({ search: "  suite ", type: "Software", sort: "price_desc", page: "3", pageSize: "500" }), { search: "suite", type: "Software", sort: "price_desc", page: 3, pageSize: 100 });
  assert.equal(parseListQuery({ sort: "drop table", page: "-4" }).sort, "newest");
  assert.equal(parseListQuery({ page: "-4" }).page, 1);
});
