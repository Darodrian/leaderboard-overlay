"use client";

type Option = { key: string; label: string };

type Props = {
  id: string;
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
};

export function Select({
  id,
  label,
  value,
  options,
  onChange,
  className,
}: Props) {
  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 ${className ?? ""}`}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
