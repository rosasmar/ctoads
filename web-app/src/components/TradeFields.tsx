// Inputs and rows shared by the trade box and a CTOad's backpack.

export function AmountInput(props: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onMax?: () => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-ink/65">
        <span>{props.label}</span>
        {props.hint && <span>{props.hint}</span>}
      </span>
      <span className="mt-1 flex items-center gap-2 rounded-xl border-2 border-ink bg-white px-3 py-2">
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-full bg-transparent text-2xl outline-none"
        />
        {props.onMax && (
          <button type="button" onClick={props.onMax} className="rounded bg-ink/10 px-2 py-0.5 text-xs">
            Max
          </button>
        )}
        <span className="text-ink/65">{props.unit}</span>
      </span>
    </label>
  );
}

/** One line of a `<dl>`: a label, its value, and an optional note under the value. */
export function Row(props: { label: string; value: string; valueClass?: string; note?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/65">{props.label}</dt>
      <dd className={`text-right ${props.valueClass ?? ""}`}>
        {props.value}
        {props.note && <span className="block text-xs text-ink/65">{props.note}</span>}
      </dd>
    </div>
  );
}

/** A wallet or contract error, short enough to show. */
export function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/reject|cancel/i.test(text)) return "Cancelled in the wallet.";
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
