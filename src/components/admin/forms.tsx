"use client";
import { useActionState, useState } from "react";
import { type ActionState, FormMessage, SubmitButton } from "@/components/ui/form";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Admin form bound to a permission-checked server action. */
export function AForm({ action, children, className = "space-y-3", submit = "Save", submitClass = "btn-primary btn-sm", confirm, hidden }: {
  action: Action;
  children?: React.ReactNode;
  className?: string;
  submit?: string | null;
  submitClass?: string;
  confirm?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <FormMessage state={state} />
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {submit && <SubmitButton className={submitClass}>{submit}</SubmitButton>}
    </form>
  );
}

/** Single-button action (e.g. check in, release block) with optional confirmation. */
export function ActionButton({ action, hidden, label, className = "btn-outline btn-sm", confirm }: { action: Action; hidden: Record<string, string>; label: string; className?: string; confirm?: string }) {
  return <AForm action={action} hidden={hidden} submit={label} submitClass={className} confirm={confirm} className="inline-block space-y-2" />;
}

export function F({ label, name, type = "text", defaultValue, required, hint, ...rest }: { label: string; name: string; type?: string; defaultValue?: string | number | null; required?: boolean; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="block">
      <span className="field-label">
        {label}
        {required && " *"}
      </span>
      <input className="field" name={name} type={type} defaultValue={defaultValue ?? ""} required={required} {...rest} />
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function S({ label, name, options, defaultValue, required }: { label: string; name: string; options: [string, string][]; defaultValue?: string | null; required?: boolean }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select className="field" name={name} defaultValue={defaultValue ?? ""} required={required}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TA({ label, name, defaultValue, rows = 4, required, hint }: { label: string; name: string; defaultValue?: string | null; rows?: number; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea className="field" name={name} rows={rows} defaultValue={defaultValue ?? ""} required={required} />
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function CB({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}

export function Disclosure({ label, children, className = "btn-outline btn-sm" }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className={className} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div className="mt-3 rounded-md border border-sand bg-cream-50 p-4">{children}</div>}
    </div>
  );
}
