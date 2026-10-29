"use client";

type Props = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
};

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: Props) {
  return (
    <div className="space-y-1 text-sm text-slate-200">
      <div className="flex items-center justify-between">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums text-slate-400">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-indigo-400"
      />
    </div>
  );
}
