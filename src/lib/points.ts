import type { EventType, PointConfig } from "./types";

export type { PointConfig };

/**
 * `tip` is expressed in cents on the incoming event while `config.tip` is the
 * number of points awarded per whole dollar, so the amount is scaled by 100.
 */
export function computePoints(
  eventType: EventType,
  amount: number,
  config: PointConfig,
): number {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const rate = config[eventType];
  const raw = eventType === "tip" ? (safeAmount / 100) * rate : safeAmount * rate;
  return Math.max(0, Math.floor(raw));
}

export function shouldCredit(
  eventType: EventType,
  amountCents: number,
  thresholdCents: number,
): boolean {
  if (eventType !== "tip") return true;
  return amountCents > 0 && amountCents >= thresholdCents;
}
