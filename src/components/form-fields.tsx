"use client";

import { useId, type ReactNode } from "react";

/**
 * Shared form primitives. Every control is label-associated, reports its error
 * through aria-describedby, and marks invalid state with aria-invalid so the
 * forms are usable with a screen reader (spec §14: responsive, accessible
 * web basics).
 */

export function Fieldset({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-ink-100 pt-8">
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-8 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-12">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{legend}</h2>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>
          ) : null}
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </fieldset>
  );
}

type FieldProps = {
  label: string;
  error?: string;
  help?: string;
  required?: boolean;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
};

export function Field({ label, error, help, required, children }: FieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? <span className="ml-1 text-signal-500">*</span> : null}
      </label>
      {help ? (
        <p id={helpId} className="mt-1 text-sm text-ink-500">
          {help}
        </p>
      ) : null}
      <div className="mt-2">{children({ id, describedBy, invalid: Boolean(error) })}</div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClasses = (invalid: boolean) =>
  `w-full rounded-md border bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:ring-2 focus:outline-none ${
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
      : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20"
  }`;

export function TextInput({
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={controlClasses(Boolean(invalid))} />;
}

export function TextArea({
  invalid,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea {...props} className={`${controlClasses(Boolean(invalid))} min-h-32 resize-y`} />
  );
}

export function Select({
  invalid,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...props} className={controlClasses(Boolean(invalid))}>
      {children}
    </select>
  );
}

export function CheckboxCard({
  checked,
  onChange,
  label,
  name,
  value,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
        checked
          ? "border-brand-500 bg-brand-600/5 ring-1 ring-brand-500"
          : "border-ink-200 bg-white hover:border-ink-300"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="text-sm font-medium text-ink-800">{label}</span>
    </label>
  );
}

export function RadioRow({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option}
          className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
            value === option
              ? "border-brand-500 bg-brand-600 text-white"
              : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {option}
        </label>
      ))}
    </div>
  );
}

/**
 * Honeypot. Hidden from sighted users and from assistive technology, so only a
 * bot filling every input will populate it (spec §9 step 2).
 */
export function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website-url-field">Leave this field empty</label>
      <input
        id="website-url-field"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
