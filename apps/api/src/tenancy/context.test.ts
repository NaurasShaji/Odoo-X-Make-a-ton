import assert from "node:assert/strict";
import test from "node:test";
import { assertSameBusiness, tenantScope } from "./context.js";

test("tenantScope always applies the active business ID", () => {
  assert.deepEqual(
    tenantScope("business_a", { status: "ACTIVE" }),
    { status: "ACTIVE", businessId: "business_a" }
  );
});

test("tenantScope rejects an empty business ID", () => {
  assert.throws(() => tenantScope(" "), /businessId is required/);
});

test("assertSameBusiness rejects cross-business records", () => {
  assert.throws(
    () => assertSameBusiness("business_a", "business_a", "business_b"),
    /Cross-business access/
  );
});

test("assertSameBusiness accepts records in the active business", () => {
  assert.doesNotThrow(() => assertSameBusiness("business_a", "business_a"));
});
