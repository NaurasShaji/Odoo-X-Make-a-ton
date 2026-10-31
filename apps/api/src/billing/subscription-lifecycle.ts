import type { SubscriptionStatus } from "@prisma/client";

const transitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["QUOTATION", "CONFIRMED", "CLOSED"],
  QUOTATION: ["CONFIRMED", "CLOSED"],
  CONFIRMED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: []
};

export function canTransitionSubscription(current: SubscriptionStatus, next: SubscriptionStatus, allowPause: boolean): boolean {
  if (current === next) return true;
  if ((current === "ACTIVE" && next === "PAUSED") || (current === "PAUSED" && next === "ACTIVE")) {
    return allowPause && transitions[current].includes(next);
  }
  return transitions[current].includes(next);
}

export function assertSubscriptionTransition(current: SubscriptionStatus, next: SubscriptionStatus, allowPause: boolean): void {
  if (!canTransitionSubscription(current, next, allowPause)) {
    throw new Error("Invalid subscription transition: " + current + " -> " + next);
  }
}
