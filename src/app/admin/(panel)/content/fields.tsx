export function ContentFields({ values }: { values: Record<string, string> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(values).map(([k, v]) => {
        const long = v.length > 90 || /body|intro|subtitle|description/i.test(k);
        const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        return (
          <label key={k} className={long ? "md:col-span-2" : ""}>
            <span className="field-label">{label}</span>
            {long ? <textarea name={k} defaultValue={v} rows={/body/i.test(k) ? 6 : 2} className="field" /> : <input name={k} defaultValue={v} className="field" />}
          </label>
        );
      })}
    </div>
  );
}
