/**
 * `tip` is expressed in cents on the incoming event while `config.tip` is the
 * number of points awarded per whole dollar, so the amount is scaled by 100.
 */
export function computePoints(eventType, amount, config) {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const configured = config[eventType];
  const rate = typeof configured === 'number' && Number.isFinite(configured)
    ? configured
    : 0;
  const raw = eventType === 'tip' ? (safeAmount / 100) * rate : safeAmount * rate;
  return Math.max(0, Math.floor(raw));
}

export function shouldCredit(eventType, amountCents, thresholdCents) {
  if (eventType !== 'tip') return true;
  return amountCents > 0 && amountCents >= thresholdCents;
}
