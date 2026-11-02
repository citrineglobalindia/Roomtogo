"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; data?: Record<string, unknown> } | null;

export function SubmitButton({ children, className = "btn-primary", pendingText = "Please wait…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.error || state?.message) ref.current?.focus();
  }, [state]);
  if (!state || (!state.error && !state.message)) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={state.error ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-sm ${state.error ? "border-red-300 bg-red-50 text-danger" : "border-forest-600/40 bg-forest-100 text-forest-800"}`}
    >
      {state.error ?? state.message}
    </div>
  );
}

/** Wraps a server action with pending state + accessible messages. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: ActionState) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const renderedRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedRef.current && !renderedRef.current.value) renderedRef.current.value = String(Date.now());
  }, []);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <form ref={formRef} action={formAction} className={className} noValidate={false}>
      <input ref={renderedRef} type="hidden" name="_rendered" defaultValue="" />
      <FormMessage state={state} />
      {children}
      {state?.fieldErrors && (
        <ul className="sr-only" aria-live="polite">
          {Object.entries(state.fieldErrors).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** Honeypot field: hidden from people, filled by naive bots. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
