"use client";

type Props = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

export function Toggle({ id, label, checked, onChange }: Props) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-200"
    >
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-indigo-400"
      />
    </label>
  );
}
