"use client";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
};

export function ColorField({ id, label, value, onChange }: Props) {
  return (
    <label htmlFor={id} className="block space-y-1 text-sm text-slate-200">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <input
          aria-hidden
          tabIndex={-1}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-slate-700/60 bg-transparent"
        />
        <input
          id={id}
          type="text"
          value={value}
          placeholder="#000000"
          onChange={(event) => onChange(event.target.value.trim())}
          className="w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-indigo-400"
        />
      </div>
    </label>
  );
}
