import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverlayClient } from "./OverlayClient";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { OverlayState } from "@/lib/types";

beforeEach(() => localStorage.clear());

it("renders cached rows when the live state is empty", async () => {
  const cached: OverlayState = {
    rows: [{ userId: "u", username: "Cached", points: 7 }],
    settings: DEFAULT_SETTINGS,
    window: "this_stream",
  };
  localStorage.setItem("overlay:tok", JSON.stringify(cached));

  render(
    <OverlayClient
      token="tok"
      initial={{
        rows: [],
        settings: DEFAULT_SETTINGS,
        window: "this_stream",
      }}
    />,
  );

  expect(await screen.findByText("Cached")).toBeInTheDocument();
});
