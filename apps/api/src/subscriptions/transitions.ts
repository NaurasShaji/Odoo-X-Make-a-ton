export type SubscriptionStatus =
  | "DRAFT"
  | "QUOTATION"
  | "CONFIRMED"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED";

export type SubscriptionAction = "quotation" | "confirm" | "activate" | "pause" | "resume" | "close";

const transitions: Record<SubscriptionStatus, Partial<Record<SubscriptionAction, SubscriptionStatus>>> = {
  DRAFT: { quotation: "QUOTATION", confirm: "CONFIRMED" },
  QUOTATION: { confirm: "CONFIRMED", close: "CLOSED" },
  CONFIRMED: { activate: "ACTIVE", close: "CLOSED" },
  ACTIVE: { pause: "PAUSED", close: "CLOSED" },
  PAUSED: { resume: "ACTIVE", close: "CLOSED" },
  CLOSED: {}
};

export function nextSubscriptionStatus(status: SubscriptionStatus, action: SubscriptionAction): SubscriptionStatus | null {
  return transitions[status][action] ?? null;
}
