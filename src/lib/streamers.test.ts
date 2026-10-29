import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  mapStreamerRow,
  settingsToRow,
  toOverlaySettings,
  type StreamerRow,
} from "./streamers";

describe("settingsToRow", () => {
  it("maps overlay settings onto streamers columns", () => {
    const row = settingsToRow({
      ...DEFAULT_SETTINGS,
      hiddenAccounts: ["nightbot"],
      tipThresholdCents: 250,
    });

    expect(row.hidden_accounts).toEqual(["nightbot"]);
    expect(row.tip_threshold_cents).toBe(250);
    expect(row.point_config).toEqual(DEFAULT_SETTINGS.pointConfig);
    expect(row.display_toggles).toEqual(DEFAULT_SETTINGS.display);
    expect(row.layout).toEqual(DEFAULT_SETTINGS.layout);
    expect(row.visuals).toEqual(DEFAULT_SETTINGS.visuals);
    expect(row.theme).toEqual(DEFAULT_SETTINGS.theme);
    expect(row.rotation).toEqual(DEFAULT_SETTINGS.rotation);
  });

  it("round-trips through mapStreamerRow", () => {
    const settings = { ...DEFAULT_SETTINGS, hiddenAccounts: ["nightbot"] };
    const row = {
      id: "s1",
      twitch_user_id: "tw1",
      twitch_login: "login",
      license_key: null,
      obs_token: "tok",
      created_at: "2026-01-01T00:00:00.000Z",
      ...settingsToRow(settings),
    } satisfies StreamerRow;

    expect(toOverlaySettings(mapStreamerRow(row))).toEqual(settings);
  });
});
