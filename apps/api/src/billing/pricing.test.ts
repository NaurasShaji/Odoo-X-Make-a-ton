import assert from "node:assert/strict";
import test from "node:test";
import { calculatePricing } from "./pricing.js";

test("calculates percentage discount before tax", () => {
  const result = calculatePricing([{ quantity: 2, unitPrice: 100, taxRate: 18 }], { type: "PERCENTAGE", value: 10 });
  assert.deepEqual({ subtotal: result.subtotal, discountTotal: result.discountTotal, taxTotal: result.taxTotal, total: result.total },
    { subtotal: 200, discountTotal: 20, taxTotal: 32.4, total: 212.4 });
});

test("allocates fixed discount proportionally across lines", () => {
  const result = calculatePricing([
    { quantity: 1, unitPrice: 100, taxRate: 18 },
    { quantity: 1, unitPrice: 50, taxRate: 5 }
  ], { type: "FIXED", value: 15 });
  assert.equal(result.discountTotal, 15);
  assert.equal(result.lines.reduce((sum, line) => sum + line.discountAmount, 0), 15);
  assert.equal(result.total, 153.45);
});

test("rejects discount above subtotal and percentage above 100", () => {
  assert.throws(() => calculatePricing([{ quantity: 1, unitPrice: 10, taxRate: 0 }], { type: "FIXED", value: 11 }), /cannot exceed/);
  assert.throws(() => calculatePricing([{ quantity: 1, unitPrice: 10, taxRate: 0 }], { type: "PERCENTAGE", value: 101 }), /cannot exceed 100/);
});

test("supports zero-value and zero-tax lines", () => {
  const result = calculatePricing([{ quantity: 1, unitPrice: 0, taxRate: 0 }]);
  assert.equal(result.total, 0);
});
