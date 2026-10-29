export const FLUSH_INTERVAL_MS = 2000;

/**
 * A `lastFlushAt` of 0 is the "never flushed" sentinel, so the first write is
 * always allowed.
 */
export function shouldFlush(
  lastFlushAt: number,
  now: number,
  intervalMs = FLUSH_INTERVAL_MS,
): boolean {
  if (lastFlushAt === 0) return true;
  return now - lastFlushAt >= intervalMs;
}

/**
 * Per-streamer accumulator. The first push opens a window; `drain` releases
 * the batch once the window has aged past the interval and then resets it.
 */
export class DebounceBuffer<T> {
  private pending: T[] = [];
  private windowStart: number | null = null;

  push(item: T, now: number): void {
    if (this.windowStart === null) this.windowStart = now;
    this.pending.push(item);
  }

  drain(now: number, intervalMs = FLUSH_INTERVAL_MS): T[] {
    if (this.windowStart === null) return [];
    if (now - this.windowStart < intervalMs) return [];

    const flushed = this.pending;
    this.pending = [];
    this.windowStart = now;
    return flushed;
  }
}
