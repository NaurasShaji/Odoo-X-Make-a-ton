import assert from "node:assert/strict";
import test from "node:test";
import { quotationTotals, quotationTransition } from "./logic.js";

test("quotation totals calculate line amounts, tax and grand total", () => {
  assert.deepEqual(quotationTotals([
    { quantity: 2, unitPrice: 100, taxRate: 18 },
    { quantity: 1, unitPrice: 50, taxRate: 5 }
  ]), { subtotal: 250, taxTotal: 38.5, total: 288.5 });
});

test("quotation totals round monetary values to two decimal places", () => {
  assert.deepEqual(quotationTotals([{ quantity: 3, unitPrice: 0.1, taxRate: 5 }]), {
    subtotal: 0.3, taxTotal: 0.02, total: 0.32
  });
});

test("quotation lifecycle allows sending, accepting and terminal decisions", () => {
  assert.equal(quotationTransition("DRAFT", "send"), "SENT");
  assert.equal(quotationTransition("SENT", "accept"), "ACCEPTED");
  assert.equal(quotationTransition("SENT", "reject"), "REJECTED");
  assert.equal(quotationTransition("SENT", "expire"), "EXPIRED");
  assert.equal(quotationTransition("ACCEPTED", "expire"), "EXPIRED");
});

test("quotation lifecycle blocks invalid and repeated transitions", () => {
  assert.equal(quotationTransition("DRAFT", "accept"), null);
  assert.equal(quotationTransition("REJECTED", "accept"), null);
  assert.equal(quotationTransition("CONVERTED", "expire"), null);
});
