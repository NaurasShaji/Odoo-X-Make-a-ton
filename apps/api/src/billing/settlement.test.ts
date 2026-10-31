import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateInvoiceSettlement, calculateNetPaid } from "./settlement.js";

test("net payment amount subtracts successful refunds only", () => {
  assert.equal(calculateNetPaid([
    { amount: 100, status: "PARTIALLY_REFUNDED", refunds: [{ amount: 20, status: "SUCCEEDED" }, { amount: 5, status: "PENDING" }] },
    { amount: 40, status: "FAILED", refunds: [] }
  ]), 80);
});

test("invoice settlement reflects full and partial refunds", () => {
  const due = new Date("2026-10-30T00:00:00Z");
  const now = new Date("2026-10-31T00:00:00Z");
  assert.deepEqual(calculateInvoiceSettlement(100, 100, due, now), { status: "PAID", balance: 0 });
  assert.deepEqual(calculateInvoiceSettlement(100, 60, due, now), { status: "PARTIALLY_PAID", balance: 40 });
  assert.deepEqual(calculateInvoiceSettlement(100, 0, due, now), { status: "OVERDUE", balance: 100 });
});
