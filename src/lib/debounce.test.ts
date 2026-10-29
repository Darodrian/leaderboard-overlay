import { describe, it, expect } from "vitest";
import { DebounceBuffer, shouldFlush } from "./debounce";

describe("shouldFlush", () => {
  it("allows the first flush", () => expect(shouldFlush(0, 500)).toBe(true));
  it("blocks within 2s", () => expect(shouldFlush(1000, 2500)).toBe(false));
  it("allows at 2s", () => expect(shouldFlush(1000, 3000)).toBe(true));
});

describe("DebounceBuffer", () => {
  it("batches events and flushes at most once per 2s", () => {
    const buffer = new DebounceBuffer<number>();
    buffer.push(1, 0);
    buffer.push(2, 1000);
    expect(buffer.drain(1500)).toEqual([]);
    expect(buffer.drain(2000)).toEqual([1, 2]);
    expect(buffer.drain(2500)).toEqual([]);
    buffer.push(3, 2600);
    expect(buffer.drain(4000)).toEqual([3]);
  });
});
