"use client";

import { useState } from "react";
import { ColorField } from "./controls/ColorField";
import { NumberField } from "./controls/NumberField";
import { Slider } from "./controls/Slider";
import { Toggle } from "./controls/Toggle";
import { applySettings, THEMES, type DeepPartial } from "@/lib/settings";
import type {
  OverlaySettings,
  PointConfig,
  ThemePreset,
} from "@/lib/types";

const POINT_FIELDS: { key: keyof PointConfig; label: string }[] = [
  { key: "tip", label: "Points per dollar" },
  { key: "bit", label: "Points per bit" },
  { key: "sub", label: "Points per sub" },
  { key: "gift", label: "Points per gifted sub" },
  { key: "raid", label: "Points per raider" },
];

const COLOR_FIELDS: { key: string; label: string; theme: keyof (typeof THEMES)["midnight"] }[] = [
  { key: "--lb-bg", label: "Background color", theme: "background" },
  { key: "--lb-text", label: "Text color", theme: "text" },
  { key: "--lb-accent", label: "Accent color", theme: "accent" },
  { key: "--lb-bar", label: "Bar track color", theme: "bar" },
  { key: "--lb-rank", label: "Rank color", theme: "accent" },
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
              onChange={(value) =>
                update({ pointConfig: { [field.key]: value } })
              }
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
              update({ anonymousMaskName: event.target.value || null })
            }
            className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400"
          />
        </label>
      </Section>

      <Section title="Layout">
        <Slider
          id="layout-width"
          label="Width"
          value={settings.layout.width}
          min={200}
          max={800}
          suffix="px"
          onChange={(width) => update({ layout: { width } })}
        />
        <Slider
          id="layout-padding"
          label="Padding"
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
              update({ theme: { preset: event.target.value as ThemePreset } })
            }
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
          label="Rotate windows"
          checked={settings.rotation.enabled}
          onChange={(enabled) => update({ rotation: { enabled } })}
        />
        <NumberField
          id="rotation-interval"
          label="Rotation interval (seconds)"
          value={Math.round(settings.rotation.intervalMs / 1000)}
          min={3}
          max={300}
          onChange={(seconds) =>
            update({ rotation: { intervalMs: seconds * 1000 } })
          }
        />
        <p className="text-xs text-slate-500">
          Cycles This Stream → 7 Days → 30 Days → All-Time.
        </p>
      </Section>
    </div>
  );
}
