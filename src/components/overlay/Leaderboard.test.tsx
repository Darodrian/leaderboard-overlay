import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Leaderboard } from "./Leaderboard";
import { DEFAULT_SETTINGS } from "@/lib/settings";

describe("Leaderboard", () => {
  it("hides ranks when the toggle is off", () => {
    render(
      <Leaderboard
        rows={[{ userId: "u", username: "Alice", points: 10 }]}
        settings={{
          ...DEFAULT_SETTINGS,
          display: {
            ...DEFAULT_SETTINGS.display,
            rankNumbers: false,
            medals: false,
          },
        }}
        window="this_stream"
      />,
    );
    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("hides hidden accounts", () => {
    render(
      <Leaderboard
        rows={[{ userId: "u", username: "Nightbot", points: 99 }]}
        settings={{ ...DEFAULT_SETTINGS, hiddenAccounts: ["nightbot"] }}
        window="this_stream"
      />,
    );
    expect(screen.queryByText("Nightbot")).toBeNull();
  });
});
