"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Fieldset,
  Field,
  TextInput,
  TextArea,
  Select,
  CheckboxCard,
  RadioRow,
  Honeypot,
} from "@/components/form-fields";
import { Turnstile } from "@/components/turnstile";
import {
  requestableServices,
  propertyTypes,
  timeframes,
  contactMethods,
  type ConditionalQuestion,
} from "@/content/services";
import { referralSources, professionalReferralCodes } from "@/content/referrals";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  formatBytes,
  validateFile,
} from "@/lib/uploads";

/**
 * Request for Proposal form (spec §7, §8, §9).
 *
 * Design constraints from the spec:
 *   * No login. Many TDR jobs are one-off residential, boundary, architectural
 *     or referral-based projects and a login requirement would lose them.
 *   * Conditional questions keyed to the selected services, so the form stays
 *     concise while still collecting enough to prepare a proposal.
 *   * Referral source captured as a relationship: when a professional referred
 *     the work, the referring person and company are collected too.
 */

type Values = {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  preferredContact: string;
  projectAddress: string;
  city: string;
  state: string;
  zip: string;
  apn: string;
  propertyType: string;
  approximateSize: string;
  projectDescription: string;
  timeframe: string;
  referralSource: string;
  referringName: string;
  referringCompany: string;
  referringEmail: string;
  referringPhone: string;
  referralOther: string;
};

const initialValues: Values = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  preferredContact: "",
  projectAddress: "",
  city: "",
  state: "",
  zip: "",
  apn: "",
  propertyType: "",
  approximateSize: "",
  projectDescription: "",
  timeframe: "",
  referralSource: "",
  referringName: "",
  referringCompany: "",
  referringEmail: "",
  referringPhone: "",
  referralOther: "",
};

export function ProposalForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(Date.now());

  const [values, setValues] = useState<Values>(initialValues);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [serviceDetails, setServiceDetails] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ opportunityNumber: string } | null>(null);

  // Deep link from a service page: /request-a-proposal?service=boundary-survey
  useEffect(() => {
    const preset = searchParams.get("service");
    if (preset && requestableServices.some((s) => s.code === preset)) {
      setSelectedServices((current) =>
        current.includes(preset) ? current : [...current, preset],
      );
    }
  }, [searchParams]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const toggleService = (code: string, checked: boolean) => {
    setSelectedServices((current) =>
      checked ? [...current, code] : current.filter((item) => item !== code),
    );
  };

  /** Conditional questions for the currently selected services (spec §7). */
  const activeQuestions = useMemo(() => {
    const seen = new Set<string>();
    const out: { serviceName: string; question: ConditionalQuestion }[] = [];
    for (const code of selectedServices) {
      const service = requestableServices.find((s) => s.code === code);
      if (!service?.questions) continue;
      for (const question of service.questions) {
        if (seen.has(question.name)) continue;
        seen.add(question.name);
        out.push({ serviceName: service.requestLabel ?? service.name, question });
      }
    }
    return out;
  }, [selectedServices]);

  const referralIsProfessional = professionalReferralCodes.has(values.referralSource);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next: File[] = [...files];
    const problems: string[] = [];

    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        problems.push(`Only ${MAX_FILES} files can be attached.`);
        break;
      }
      if (next.some((existing) => existing.name === file.name && existing.size === file.size)) {
        continue;
      }
      const check = validateFile(file);
      if (!check.ok) {
        problems.push(check.error);
        continue;
      }
      next.push(file);
    }

    const nextTotal = next.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_BYTES) {
      problems.push(
        `Attachments total more than ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB. Send the largest files to TDR separately.`,
      );
    } else {
      setFiles(next);
    }

    setErrors((current) => ({ ...current, files: problems.join(" ") }));
  };

  /** Client-side pre-check. The server re-validates everything (spec §15). */
  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!values.firstName.trim()) next.firstName = "First name is required";
    if (!values.lastName.trim()) next.lastName = "Last name is required";
    if (!values.email.trim()) next.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
      next.email = "Enter a valid email address";
    if (!values.projectAddress.trim()) next.projectAddress = "Project address is required";
    if (!values.city.trim()) next.city = "City is required";
    if (!values.propertyType) next.propertyType = "Select the property type";
    if (!values.projectDescription.trim())
      next.projectDescription = "Tell us what you need so we can scope it";
    if (selectedServices.length === 0) next.services = "Select at least one service";
    if (!values.referralSource) next.referralSource = "Let us know how you heard about TDR";
    if (referralIsProfessional && !values.referringName.trim())
      next.referringName = "Please tell us who referred you so we can thank them";
    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      errorSummaryRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const turnstileInput = formRef.current?.querySelector<HTMLInputElement>(
        'input[name="cf-turnstile-response"]',
      );

      const payload = {
        ...values,
        preferredContact: values.preferredContact || undefined,
        timeframe: values.timeframe || undefined,
        services: selectedServices,
        serviceDetails,
        website: honeypot,
        elapsedMs: Date.now() - startedAt.current,
        turnstileToken: turnstileInput?.value ?? "",
        sourcePage: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
      };

      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      for (const file of files) formData.append("files", file);

      const response = await fetch("/api/proposals", { method: "POST", body: formData });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        fields?: Record<string, string>;
        opportunityNumber?: string;
      };

      if (!response.ok || !data.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "Something went wrong. Please try again.");
        errorSummaryRef.current?.focus();
        return;
      }

      setResult({ opportunityNumber: data.opportunityNumber ?? "" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError(
        "We could not reach the server. Please check your connection and try again, or contact TDR directly.",
      );
      errorSummaryRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-10 shadow-panel">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/15">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#0f3d5c"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-bold text-ink-900">
          Your request is with TDR
        </h2>
        <p className="mt-3 text-lg text-ink-600">
          Reference{" "}
          <span className="font-semibold text-ink-900">{result.opportunityNumber}</span>. A
          confirmation is on its way to {values.email}.
        </p>
        <p className="mt-4 text-ink-600">
          A member of the team will review the project and follow up
          {values.preferredContact ? ` by ${values.preferredContact.toLowerCase()}` : ""}. If
          we need anything else to prepare an accurate proposal, we will ask
          directly.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-500"
          >
            Back to home
          </Link>
          <Link
            href="/questions"
            className="inline-flex rounded-md border border-ink-200 px-5 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50"
          >
            Browse common questions
          </Link>
        </div>
      </div>
    );
  }

  const errorList = Object.entries(errors).filter(([, message]) => message);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-ink-100 bg-white p-6 shadow-panel md:p-10"
    >
      <div
        ref={errorSummaryRef}
        tabIndex={-1}
        aria-live="assertive"
        className="focus:outline-none"
      >
        {formError || errorList.length > 0 ? (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-800">
              {formError || "Please correct the following before submitting:"}
            </p>
            {errorList.length > 0 ? (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-700">
                {errorList.map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-10">
        {/* ---------------------------------------------- Contact info --- */}
        <Fieldset
          legend="Your information"
          description="How TDR reaches you about this project."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="First name" required error={errors.firstName}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="firstName"
                  autoComplete="given-name"
                  value={values.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="lastName"
                  autoComplete="family-name"
                  value={values.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <Field
            label="Company"
            help="If you are requesting on behalf of a firm or business."
            error={errors.company}
          >
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="company"
                autoComplete="organization"
                value={values.company}
                onChange={(e) => set("company", e.target.value)}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Email" required error={errors.email}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="email"
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
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <Field label="Preferred contact method" error={errors.preferredContact}>
            {() => (
              <RadioRow
                name="preferredContact"
                options={contactMethods}
                value={values.preferredContact}
                onChange={(value) => set("preferredContact", value)}
              />
            )}
          </Field>
        </Fieldset>

        {/* -------------------------------------------------- Property --- */}
        <Fieldset
          legend="Project location"
          description="Where the work is. The APN helps but is not required."
        >
          <Field label="Project address" required error={errors.projectAddress}>
            {({ id, describedBy, invalid }) => (
              <TextInput
                id={id}
                name="projectAddress"
                autoComplete="street-address"
                placeholder="123 Main Street"
                value={values.projectAddress}
                onChange={(e) => set("projectAddress", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              />
            )}
          </Field>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field label="City" required error={errors.city}>
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="city"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="State" error={errors.state}>
              {({ id, invalid }) => (
                <TextInput
                  id={id}
                  name="state"
                  value={values.state}
                  onChange={(e) => set("state", e.target.value)}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field label="ZIP" error={errors.zip}>
              {({ id, invalid }) => (
                <TextInput
                  id={id}
                  name="zip"
                  inputMode="numeric"
                  value={values.zip}
                  onChange={(e) => set("zip", e.target.value)}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="APN"
              help="Assessor's Parcel Number, if you have it."
              error={errors.apn}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="apn"
                  value={values.apn}
                  onChange={(e) => set("apn", e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
            <Field
              label="Approximate building or site size"
              help="Square feet, acres, or number of units."
              error={errors.approximateSize}
            >
              {({ id, describedBy, invalid }) => (
                <TextInput
                  id={id}
                  name="approximateSize"
                  value={values.approximateSize}
                  onChange={(e) => set("approximateSize", e.target.value)}
                  aria-describedby={describedBy}
                  invalid={invalid}
                />
              )}
            </Field>
          </div>

          <Field label="Property type" required error={errors.propertyType}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                name="propertyType"
                value={values.propertyType}
                onChange={(e) => set("propertyType", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              >
                <option value="">Select a property type…</option>
                {propertyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Fieldset>

        {/* -------------------------------------------------- Services --- */}
        <Fieldset
          legend="What do you need?"
          description="Select everything that might apply. If you are not sure, choose “Other” and describe the situation — TDR will recommend the right scope."
        >
          <Field label="Services requested" required error={errors.services}>
            {() => (
              <div className="grid gap-3 sm:grid-cols-2">
                {requestableServices.map((service) => (
                  <CheckboxCard
                    key={service.code}
                    name="services"
                    value={service.code}
                    label={service.requestLabel ?? service.name}
                    checked={selectedServices.includes(service.code)}
                    onChange={(checked) => toggleService(service.code, checked)}
                  />
                ))}
              </div>
            )}
          </Field>

          {/* Conditional questions, revealed only for the selected services. */}
          {activeQuestions.length > 0 ? (
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-6">
              <h3 className="text-sm font-semibold text-ink-800">
                A few details about what you selected
              </h3>
              <p className="mt-1 text-sm text-ink-500">
                Optional, but each answer makes the proposal more accurate.
              </p>
              <div className="mt-5 space-y-5">
                {activeQuestions.map(({ serviceName, question }) => (
                  <Field
                    key={question.name}
                    label={`${question.label}`}
                    help={question.help ?? `For: ${serviceName}`}
                  >
                    {({ id, describedBy }) =>
                      question.type === "textarea" ? (
                        <TextArea
                          id={id}
                          name={question.name}
                          value={serviceDetails[question.name] ?? ""}
                          onChange={(e) =>
                            setServiceDetails((c) => ({ ...c, [question.name]: e.target.value }))
                          }
                          aria-describedby={describedBy}
                        />
                      ) : question.type === "select" ? (
                        <Select
                          id={id}
                          name={question.name}
                          value={serviceDetails[question.name] ?? ""}
                          onChange={(e) =>
                            setServiceDetails((c) => ({ ...c, [question.name]: e.target.value }))
                          }
                          aria-describedby={describedBy}
                        >
                          <option value="">Select…</option>
                          {(question.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <TextInput
                          id={id}
                          name={question.name}
                          value={serviceDetails[question.name] ?? ""}
                          onChange={(e) =>
                            setServiceDetails((c) => ({ ...c, [question.name]: e.target.value }))
                          }
                          aria-describedby={describedBy}
                        />
                      )
                    }
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          <Field label="Project description" required error={errors.projectDescription}>
            {({ id, describedBy, invalid }) => (
              <TextArea
                id={id}
                name="projectDescription"
                placeholder="Tell us what you are trying to accomplish, who else is involved, and anything specific the survey or engineering has to capture."
                value={values.projectDescription}
                onChange={(e) => set("projectDescription", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              />
            )}
          </Field>

          <Field label="Requested timeframe" error={errors.timeframe}>
            {({ id, invalid }) => (
              <Select
                id={id}
                name="timeframe"
                value={values.timeframe}
                onChange={(e) => set("timeframe", e.target.value)}
                invalid={invalid}
              >
                <option value="">Select a timeframe…</option>
                {timeframes.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </Fieldset>

        {/* --------------------------------------------------- Uploads --- */}
        <Fieldset
          legend="Supporting documents"
          description="Optional. Anything you already have makes the proposal more accurate."
        >
          <Field
            label="Attach files"
            help={`Existing surveys, architectural drawings, PDFs, site photographs or title information. Up to ${MAX_FILES} files, ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB each.`}
            error={errors.files}
          >
            {({ id, describedBy }) => (
              <div>
                <input
                  id={id}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  aria-describedby={describedBy}
                  className="block w-full cursor-pointer rounded-md border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-sm text-ink-600 file:mr-4 file:rounded-md file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-500"
                />
                {files.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {files.map((file) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="flex items-center justify-between gap-4 rounded-md border border-ink-100 bg-white px-4 py-3 text-sm"
                      >
                        <span className="truncate text-ink-800">{file.name}</span>
                        <span className="flex shrink-0 items-center gap-3 text-ink-500">
                          {formatBytes(file.size)}
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((current) => current.filter((f) => f !== file))
                            }
                            className="font-semibold text-red-600 hover:text-red-700"
                          >
                            Remove
                            <span className="sr-only"> {file.name}</span>
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {files.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-500">
                    {files.length} of {MAX_FILES} files · {formatBytes(totalBytes)} of{" "}
                    {formatBytes(MAX_TOTAL_BYTES)}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-ink-500">
                  Large CAD, BIM or point-cloud datasets should not be sent
                  through this form — mention them in the description and TDR
                  will arrange a transfer.
                </p>
              </div>
            )}
          </Field>
        </Fieldset>

        {/* -------------------------------------------------- Referral --- */}
        <Fieldset
          legend="How did you hear about TDR?"
          description="If a professional referred you, we would like to thank them."
        >
          <Field label="Referral source" required error={errors.referralSource}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                name="referralSource"
                value={values.referralSource}
                onChange={(e) => set("referralSource", e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                invalid={invalid}
              >
                <option value="">Select…</option>
                {referralSources.map((source) => (
                  <option key={source.code} value={source.code}>
                    {source.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {referralIsProfessional ? (
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-6">
              <h3 className="text-sm font-semibold text-ink-800">
                Who referred you?
              </h3>
              <p className="mt-1 text-sm text-ink-500">
                TDR keeps track of the professionals who send work our way.
              </p>
              <div className="mt-5 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Their name" required error={errors.referringName}>
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        name="referringName"
                        value={values.referringName}
                        onChange={(e) => set("referringName", e.target.value)}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                  <Field label="Their company" error={errors.referringCompany}>
                    {({ id, invalid }) => (
                      <TextInput
                        id={id}
                        name="referringCompany"
                        value={values.referringCompany}
                        onChange={(e) => set("referringCompany", e.target.value)}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Their email" help="If you know it." error={errors.referringEmail}>
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        name="referringEmail"
                        type="email"
                        value={values.referringEmail}
                        onChange={(e) => set("referringEmail", e.target.value)}
                        aria-describedby={describedBy}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                  <Field label="Their phone" help="If you know it." error={errors.referringPhone}>
                    {({ id, describedBy, invalid }) => (
                      <TextInput
                        id={id}
                        name="referringPhone"
                        type="tel"
                        value={values.referringPhone}
                        onChange={(e) => set("referringPhone", e.target.value)}
                        aria-describedby={describedBy}
                        invalid={invalid}
                      />
                    )}
                  </Field>
                </div>
              </div>
            </div>
          ) : values.referralSource === "other" ? (
            <Field label="Tell us more" error={errors.referralOther}>
              {({ id, invalid }) => (
                <TextInput
                  id={id}
                  name="referralOther"
                  value={values.referralOther}
                  onChange={(e) => set("referralOther", e.target.value)}
                  invalid={invalid}
                />
              )}
            </Field>
          ) : null}
        </Fieldset>
      </div>

      <Honeypot value={honeypot} onChange={setHoneypot} />

      <div className="mt-10 border-t border-ink-100 pt-8">
        <Turnstile siteKey={turnstileSiteKey} />
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-500">
            TDR uses your information only to prepare and follow up on your
            proposal.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Submit proposal request"}
          </button>
        </div>
      </div>
    </form>
  );
}
