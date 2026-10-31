import assert from "node:assert/strict";
import test from "node:test";
import { billingDecision, paymentResult } from "./billing/logic.js";
import { nextSubscriptionStatus } from "./subscriptions/transitions.js";

test("billing generation creates the next due period", () => {
  const start = new Date("2026-10-01T00:00:00.000Z");
  const decision = billingDecision({ startDate: start, billingPeriod: "MONTHLY", now: new Date("2026-11-02T00:00:00.000Z"), alreadyBilled: false });
  assert.equal(decision.status, "generated");
  if (decision.status === "generated") {
    assert.equal(decision.periodStart.toISOString(), start.toISOString());
    assert.equal(decision.periodEnd.toISOString(), "2026-11-01T00:00:00.000Z");
  }
});

test("billing generation skips an already-started period that is not due", () => {
  const decision = billingDecision({ startDate: new Date("2026-10-01T00:00:00.000Z"), billingPeriod: "MONTHLY", lastPeriodEnd: new Date("2026-11-01T00:00:00.000Z"), now: new Date("2026-10-20T00:00:00.000Z"), alreadyBilled: false });
  assert.deepEqual(decision, { status: "skipped", reason: "not_due" });
});

test("billing generation skips periods at or after expiry", () => {
  const expiry = new Date("2026-11-01T00:00:00.000Z");
  const decision = billingDecision({ startDate: new Date("2026-10-01T00:00:00.000Z"), billingPeriod: "MONTHLY", lastPeriodEnd: expiry, expiryDate: expiry, now: new Date("2026-12-01T00:00:00.000Z"), alreadyBilled: false });
  assert.deepEqual(decision, { status: "skipped", reason: "expired" });
});

test("payment recording returns partial balance", () => {
  assert.deepEqual(paymentResult(100, 25, 30), { status: "PARTIALLY_PAID", balance: 45 });
});

test("payment recording closes the invoice at exact balance", () => {
  assert.deepEqual(paymentResult(100, 25, 75), { status: "PAID", balance: 0 });
});

test("payment recording rejects overpayment", () => {
  assert.throws(() => paymentResult(100, 90, 20), /exceeds outstanding balance/);
});

test("subscription transitions follow the allowed lifecycle", () => {
  assert.equal(nextSubscriptionStatus("DRAFT", "quotation"), "QUOTATION");
  assert.equal(nextSubscriptionStatus("QUOTATION", "confirm"), "CONFIRMED");
  assert.equal(nextSubscriptionStatus("CONFIRMED", "activate"), "ACTIVE");
  assert.equal(nextSubscriptionStatus("ACTIVE", "pause"), "PAUSED");
  assert.equal(nextSubscriptionStatus("PAUSED", "resume"), "ACTIVE");
  assert.equal(nextSubscriptionStatus("ACTIVE", "close"), "CLOSED");
});

test("closed subscriptions cannot transition", () => {
  assert.equal(nextSubscriptionStatus("CLOSED", "activate"), null);
  assert.equal(nextSubscriptionStatus("DRAFT", "resume"), null);
});
