import { it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverlayClient } from "./OverlayClient";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { OverlayState, BoardType } from "@/lib/types";

const makeOverlayState = (overrides: Partial<OverlayState> = {}): OverlayState => ({
  boards: {
    points: {
      rows: [{ userId: "u", username: "Cached", quantity: 7 }],
      window: "this_stream",
      rankCount: 25,
    },
    donations: { rows: [], window: "this_stream", rankCount: 10 },
    bits: { rows: [], window: "this_stream", rankCount: 10 },
    subs: { rows: [], window: "this_stream", rankCount: 10 },
    raiders: { rows: [], window: "this_stream", rankCount: 10 },
    view_time: { rows: [], window: "this_stream", rankCount: 10 },
    chat_messages: { rows: [], window: "this_stream", rankCount: 10 },
    clips: { rows: [], window: "this_stream", rankCount: 10 },
  },
  settings: DEFAULT_SETTINGS,
  activeBoard: "points",
  activeWindow: "this_stream",
  ...overrides,
});

beforeEach(() => localStorage.clear());

it("renders cached rows when the live state is empty", async () => {
  const cached = makeOverlayState({
    boards: {
      points: {
        rows: [{ userId: "u", username: "Cached", quantity: 7 }],
        window: "this_stream",
        rankCount: 25,
      },
      donations: { rows: [], window: "this_stream", rankCount: 10 },
      bits: { rows: [], window: "this_stream", rankCount: 10 },
      subs: { rows: [], window: "this_stream", rankCount: 10 },
      raiders: { rows: [], window: "this_stream", rankCount: 10 },
      view_time: { rows: [], window: "this_stream", rankCount: 10 },
      chat_messages: { rows: [], window: "this_stream", rankCount: 10 },
      clips: { rows: [], window: "this_stream", rankCount: 10 },
    },
  } as unknown as OverlayState);
  localStorage.setItem("overlay:tok", JSON.stringify(cached));

  render(
    <OverlayClient
      token="tok"
      initial={makeOverlayState()}
    />,
  );

  expect(await screen.findByText("Cached")).toBeInTheDocument();
});
