"use client";

type Props = {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
};

export function NumberField({
  id,
  label,
  value,
  min = 0,
  max,
  onChange,
}: Props) {
  return (
    <label htmlFor={id} className="block space-y-1 text-sm text-slate-200">
      <span>{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-indigo-400"
      />
    </label>
  );
}
