"use client";

import { useRef, useState } from "react";
import { Field, TextInput, TextArea, Honeypot } from "@/components/form-fields";
import { Turnstile } from "@/components/turnstile";

/**
 * General contact form (spec §11 `website_inquiries`).
 *
 * Deliberately short. Anything project-specific belongs on the Request a
 * Proposal form, which captures the structured data TDR actually needs.
 */
export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const startedAt = useRef<number>(Date.now());
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    subject: "",
    message: "",
  });
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const next: Record<string, string> = {};
    if (!values.firstName.trim()) next.firstName = "First name is required";
    if (!values.email.trim()) next.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address";
    if (!values.message.trim()) next.message = "Please enter a message";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const turnstileInput = formRef.current?.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      );

      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          website: honeypot,
          elapsedMs: Date.now() - startedAt.current,
          turnstileToken: turnstileInput?.value ?? "",
          sourcePage: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok || !data.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setFormError("We could not reach the server. Please call TDR directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-10 shadow-panel">
        <h2 className="text-2xl font-bold text-ink-900">Message sent</h2>
        <p className="mt-3 text-ink-600">
          Thank you — a member of the TDR team will respond shortly. A
          confirmation is on its way to {values.email}.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-ink-100 bg-white p-6 shadow-panel md:p-10"
    >
      {formError ? (
        <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {formError}
        </p>
      ) : null}

      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                autoComplete="given-name"
                value={values.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName}>
            {({ id, invalid }) => (
              <TextInput
                id={id}
                autoComplete="family-name"
                value={values.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Email" required error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              />
            )}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {({ id, invalid }) => (
              <TextInput
                id={id}
                type="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <Field label="Company" error={errors.company}>
          {({ id, invalid }) => (
            <TextInput
              id={id}
              autoComplete="organization"
              value={values.company}
              onChange={(e) => set("company", e.target.value)}
              invalid={invalid}
            />
          )}
        </Field>

        <Field label="Subject" error={errors.subject}>
          {({ id, invalid }) => (
            <TextInput
              id={id}
              value={values.subject}
              onChange={(e) => set("subject", e.target.value)}
              invalid={invalid}
            />
          )}
        </Field>

        <Field label="Message" required error={errors.message}>
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              value={values.message}
              onChange={(e) => set("message", e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Honeypot value={honeypot} onChange={setHoneypot} />

      <div className="mt-8 border-t border-ink-100 pt-6">
        <Turnstile siteKey={turnstileSiteKey} />
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-brand-600 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
