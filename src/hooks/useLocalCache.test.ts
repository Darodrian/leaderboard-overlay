import { describe, it, expect, beforeEach } from "vitest";
import { readCache, writeCache } from "./useLocalCache";

beforeEach(() => localStorage.clear());

describe("local cache", () => {
  it("writes and reads a payload", () => {
    writeCache("overlay:abc", { points: 42 });
    expect(readCache("overlay:abc", null)).toEqual({ points: 42 });
  });

  it("returns the fallback when the cache is empty or corrupt", () => {
    expect(readCache("missing", [])).toEqual([]);
    localStorage.setItem("bad", "{not json");
    expect(readCache("bad", "fallback")).toBe("fallback");
  });
});
