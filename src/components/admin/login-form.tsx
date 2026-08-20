"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Field, TextInput } from "@/components/form-fields";

/**
 * Staff sign-in. Supabase email/password auth; role is checked server-side
 * against `app_users` after the session exists.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const supabase = supabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("That email and password did not match an account.");
        return;
      }
      router.push(searchParams.get("next") || "/admin/proposals");
      router.refresh();
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-ink-200 bg-white p-7 shadow-panel"
    >
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}

      <Field label="Email" required>
        {({ id }) => (
          <TextInput
            id={id}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        )}
      </Field>

      <Field label="Password" required>
        {({ id }) => (
          <TextInput
            id={id}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
