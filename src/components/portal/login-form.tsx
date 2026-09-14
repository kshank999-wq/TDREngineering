"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Field, TextInput } from "@/components/form-fields";

/**
 * Client sign-in.
 *
 * Identical mechanics to staff sign-in — the difference is entirely in what
 * the database will let the resulting session read. The error message is
 * deliberately the same whether the email is unknown, the password is wrong,
 * or the account exists but has no portal access: distinguishing them tells a
 * stranger which of TDR's clients have accounts.
 */
export function PortalLoginForm() {
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
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/portal") ? next : "/portal");
      router.refresh();
    } catch {
      setError("Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
