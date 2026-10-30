"use client";

import { useState } from "react";
import { ColorField } from "./controls/ColorField";
import { NumberField } from "./controls/NumberField";
import { Select } from "./controls/Select";
import { Slider } from "./controls/Slider";
import { Toggle } from "./controls/Toggle";
import {
  applySettings,
  ALL_BOARD_TYPES,
  BOARD_LABELS,
  BOARD_UNITS,
  DEFAULT_BOARDS,
  DEFAULT_SETTINGS,
  THEMES,
  type DeepPartial,
} from "@/lib/settings";
import type { BoardConfig, BoardType, OverlaySettings, PointConfig, ThemePreset } from "@/lib/types";

const POINT_FIELDS: { key: keyof PointConfig; label: string }[] = [
  { key: "tip", label: "Points per dollar" },
  { key: "bit", label: "Points per bit" },
  { key: "sub", label: "Points per sub" },
  { key: "gift", label: "Points per gifted sub" },
  { key: "raid", label: "Points per raider" },
];

const COLOR_FIELDS: { key: string; label: string; theme: keyof typeof THEMES.midnight }[] = [
  { key: "--lb-bg", label: "Background color", theme: "background" },
  { key: "--lb-text", label: "Text color", theme: "text" },
  { key: "--lb-accent", label: "Accent color", theme: "accent" },
  { key: "--lb-bar", label: "Bar track color", theme: "bar" },
  { key: "--lb-rank", label: "Rank color", theme: "accent" },
];

const SCREEN_LAYOUTS: { key: "single" | "side-by-side" | "stacked"; label: string }[] = [
  { key: "single", label: "Single board" },
  { key: "side-by-side", label: "Side by side" },
  { key: "stacked", label: "Stacked" },
];

const ROTATION_MODES: { key: "boards" | "windows" | "both"; label: string }[] = [
  { key: "boards", label: "Rotate boards" },
  { key: "windows", label: "Rotate time windows" },
  { key: "both", label: "Rotate boards & windows" },
];

const LABEL_ALIGNMENTS: { key: "left" | "center" | "right"; label: string }[] = [
  { key: "left", label: "Left" },
  { key: "center", label: "Center" },
  { key: "right", label: "Right" },
];

const FONT_OPTIONS: { key: string; label: string }[] = [
  { key: "system", label: "System font" },
  { key: "Inter", label: "Inter" },
  { key: "Roboto", label: "Roboto" },
  { key: "Open Sans", label: "Open Sans" },
  { key: "Lato", label: "Lato" },
  { key: "Montserrat", label: "Montserrat" },
  { key: "Poppins", label: "Poppins" },
  { key: "Oswald", label: "Oswald" },
  { key: "Raleway", label: "Raleway" },
  { key: "Libre Franklin", label: "Libre Franklin" },
  { key: "Source Sans Pro", label: "Source Sans Pro" },
  { key: "Ubuntu", label: "Ubuntu" },
  { key: "Merriweather", label: "Merriweather" },
  { key: "Playfair Display", label: "Playfair Display" },
  { key: "Press Start 2P", label: "Press Start 2P" },
  { key: "VT323", label: "VT323" },
  { key: "Share Tech Mono", label: "Share Tech Mono" },
  { key: "Special Elite", label: "Special Elite" },
  { key: "Gagalin", label: "Gagalin" },
  { key: "Permanent Marker", label: "Permanent Marker" },
];

type Props = {
  initial: OverlaySettings;
  onChange: (next: OverlaySettings) => void;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function BoardSection({
  board,
  config,
  onChange,
}: {
  board: BoardType;
  config: BoardConfig;
  onChange: (patch: { active?: boolean; windows?: string[]; rankCount?: number }) => void;
}) {
  const [localWindows, setLocalWindows] = useState<string[]>(config.windows);

  const toggleWindow = (window: string) => {
    const next = localWindows.includes(window)
      ? localWindows.filter((w) => w !== window)
      : [...localWindows, window];
    setLocalWindows(next);
    onChange({ windows: next });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-700/40 bg-slate-900/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <Toggle
          id={`board-active-${board}`}
          label={BOARD_LABELS[board]}
          checked={config.active}
          onChange={(active) => onChange({ active })}
        />
        <span className="text-xs font-mono text-slate-500">{BOARD_UNITS[board].symbol}</span>
      </div>
      {!config.active && (
        <p className="text-xs text-slate-500 mt-1">
          Board is disabled. Enable to show on overlay.
        </p>
      )}
      {config.active && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active windows
          </label>
          <div className="grid grid-cols-4 gap-1">
            {["this_stream", "7d", "30d", "alltime"].map((window) => (
              <button
                key={window}
                onClick={() => toggleWindow(window)}
                className={`rounded border px-2 py-1 text-xs text-slate-300 transition-colors ${
                  localWindows.includes(window)
                    ? "border-indigo-400 bg-indigo-500/20 text-indigo-300"
                    : "border-slate-700/60 bg-slate-950 hover:bg-slate-800/60"
                }`}
              >
                {window === "this_stream" ? "This Stream" : window}
              </button>
            ))}
          </div>
          <NumberField
            id={`board-rank-${board}`}
            label="Max ranks"
            value={config.rankCount}
            min={1}
            max={100}
            onChange={(rankCount) => onChange({ rankCount })}
          />
        </div>
      )}
    </div>
  );
}

export function SettingsForm({ initial, onChange }: Props) {
  const [settings, setSettings] = useState(initial);

  const update = (patch: DeepPartial<OverlaySettings>) => {
    const next = applySettings(settings, patch);
    setSettings(next);
    onChange(next);
  };

  const setOverride = (key: string, value: string) => {
    const overrides = { ...settings.theme.overrides };
    if (value) overrides[key] = value;
    else delete overrides[key];
    update({ theme: { overrides } });
  };

  const preset = THEMES[settings.theme.preset] ?? THEMES.midnight;

  return (
    <div className="space-y-4">
      <Section title="Rank display">
        <Toggle
          id="display-ranks"
          label="Show ranks (top 25)"
          checked={settings.display.ranks}
          onChange={(ranks) => update({ display: { ranks } })}
        />
        <Toggle
          id="display-medals"
          label="Medals"
          checked={settings.display.medals}
          onChange={(medals) => update({ display: { medals } })}
        />
        <Toggle
          id="display-rank-numbers"
          label="Rank numbers"
          checked={settings.display.rankNumbers}
          onChange={(rankNumbers) => update({ display: { rankNumbers } })}
        />
        <Toggle
          id="display-bars"
          label="Progress bars"
          checked={settings.display.bars}
          onChange={(bars) => update({ display: { bars } })}
        />
        <Toggle
          id="display-amounts"
          label="Point amounts"
          checked={settings.display.amounts}
          onChange={(amounts) => update({ display: { amounts } })}
        />
        <label
          htmlFor="hidden-accounts"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Hidden accounts (comma separated)</span>
          <input
            id="hidden-accounts"
            type="text"
            value={settings.hiddenAccounts.join(", ")}
            onChange={(event) =>
              update({
                hiddenAccounts: event.target.value
                  .split(",")
                  .map((account) => account.trim())
                  .filter(Boolean),
              })
            }
            placeholder="nightbot, streamelements"
            className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400"
          />
        </label>
      </Section>

      <Section title="Points">
        <div className="grid gap-3 sm:grid-cols-2">
          {POINT_FIELDS.map((field) => (
            <NumberField
              key={field.key}
              id={`points-${field.key}`}
              label={field.label}
              value={settings.pointConfig[field.key]}
              onChange={(value) => update({ pointConfig: { [field.key]: value } })}
            />
          ))}
          <NumberField
            id="tip-threshold"
            label="Minimum tip (cents)"
            value={settings.tipThresholdCents}
            onChange={(tipThresholdCents) => update({ tipThresholdCents })}
          />
        </div>
        <label
          htmlFor="anonymous-mask"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Anonymous display name</span>
          <input
            id="anonymous-mask"
            type="text"
            value={settings.anonymousMaskName ?? ""}
            onChange={(event) =>
              update({ anonymousMaskName: event.target.value || null })}
            className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400"
          />
        </label>
      </Section>

      <Section title="Board modes">
        <p className="text-xs text-slate-500">
          Enable the boards you want to show on the overlay. Disabled boards are
          skipped during rotation.
        </p>
        <div className="space-y-2">
          {ALL_BOARD_TYPES.map((board) => {
            const config =
              (settings.boards[board] ?? DEFAULT_BOARDS[board] ?? DEFAULT_BOARDS.points) as BoardConfig;
            return (
              <BoardSection
                key={board}
                board={board}
                config={config}
                onChange={(patch) =>
                  update({
                    boards: {
                      ...settings.boards,
                      [board]: { ...config, ...patch },
                    },
                  })
                }
              />
            );
          })}
        </div>
      </Section>

      <Section title="Layout">
        <label
          htmlFor="screen-layout"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Screen layout</span>
          <Select
            id="screen-layout"
            value={settings.screenLayout}
            options={SCREEN_LAYOUTS}
            onChange={(value) =>
              update({ screenLayout: value as "single" | "side-by-side" | "stacked" })}
          />
        </label>
        <Slider
          id="layout-width"
          label="Overlay width"
          value={settings.layout.width}
          min={200}
          max={1200}
          suffix="px"
          onChange={(width) => update({ layout: { width } })}
        />
        <Slider
          id="layout-padding"
          label="Overlay padding"
          value={settings.layout.padding}
          min={0}
          max={48}
          suffix="px"
          onChange={(padding) => update({ layout: { padding } })}
        />
        <Slider
          id="layout-radius"
          label="Corner radius"
          value={settings.layout.borderRadius}
          min={0}
          max={999}
          suffix="px"
          onChange={(borderRadius) => update({ layout: { borderRadius } })}
        />
        <p className="text-xs text-slate-500">
          Single shows one board at a time. Side by side and stacked show all
          active boards simultaneously.
        </p>
      </Section>

      <Section title="Visuals">
        <Slider
          id="visual-opacity"
          label="Opacity"
          value={settings.visuals.opacity}
          min={0}
          max={100}
          suffix="%"
          onChange={(opacity) => update({ visuals: { opacity } })}
        />
        <Slider
          id="visual-font-size"
          label="Font size"
          value={settings.visuals.fontSize}
          min={8}
          max={72}
          suffix="px"
          onChange={(fontSize) => update({ visuals: { fontSize } })}
        />
        <label
          htmlFor="font-family"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Font family</span>
          <Select
            id="font-family"
            value={settings.fontFamily}
            options={FONT_OPTIONS}
            onChange={(value) => update({ fontFamily: value })}
          />
        </label>
        <label
          htmlFor="label-alignment"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Cycle label alignment</span>
          <Select
            id="label-alignment"
            value={settings.labelAlignment}
            options={LABEL_ALIGNMENTS}
            onChange={(value) =>
              update({ labelAlignment: value as "left" | "center" | "right" })}
          />
        </label>
      </Section>

      <Section title="Theme">
        <label
          htmlFor="theme-preset"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Theme preset</span>
          <select
            id="theme-preset"
            value={settings.theme.preset}
            onChange={(event) =>
              update({ theme: { preset: event.target.value as ThemePreset } })}
            className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400"
          >
            {Object.keys(THEMES).map((name) => (
              <option key={name} value={name}>
                {name[0].toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_FIELDS.map((field) => (
            <ColorField
              key={field.key}
              id={`color-${field.key.replace("--lb-", "")}`}
              label={field.label}
              value={settings.theme.overrides[field.key] ?? preset[field.theme]}
              onChange={(value) => setOverride(field.key, value)}
            />
          ))}
        </div>
      </Section>

      <Section title="Rotation">
        <Toggle
          id="rotation-enabled"
          label="Enable rotation"
          checked={settings.rotation.enabled}
          onChange={(enabled) => update({ rotation: { enabled } })}
        />
        <label
          htmlFor="rotation-mode"
          className="block space-y-1 text-sm text-slate-200"
        >
          <span>Rotation mode</span>
          <Select
            id="rotation-mode"
            value={settings.rotationMode}
            options={ROTATION_MODES}
            onChange={(value) =>
              update({ rotationMode: value as "boards" | "windows" | "both" })}
          />
        </label>
        <NumberField
          id="rotation-interval"
          label="Rotation interval (seconds)"
          value={Math.round(settings.rotation.intervalMs / 1000)}
          min={3}
          max={300}
          onChange={(seconds) =>
            update({ rotation: { intervalMs: seconds * 1000 } })}
        />
        <p className="text-xs text-slate-500">
          Cycles through active boards and/or time windows based on rotation mode.
        </p>
      </Section>
    </div>
  );
}



