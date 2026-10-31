import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionSubscription } from "./subscription-lifecycle.js";

test("confirmed subscriptions can become active", () => {
  assert.equal(canTransitionSubscription("CONFIRMED", "ACTIVE", false), true);
});

test("pausing requires plan permission", () => {
  assert.equal(canTransitionSubscription("ACTIVE", "PAUSED", false), false);
  assert.equal(canTransitionSubscription("ACTIVE", "PAUSED", true), true);
});

test("closed subscriptions cannot be reopened", () => {
  assert.equal(canTransitionSubscription("CLOSED", "ACTIVE", true), false);
});
