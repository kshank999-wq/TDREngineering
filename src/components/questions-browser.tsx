"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { faqs, faqCategories, type FaqCategory } from "@/content/faqs";

/**
 * Searchable Questions / Knowledge Center (spec §6).
 *
 * Search runs client-side over the structured FAQ content — question text,
 * keywords and answer body — so results are instant and the page needs no API.
 * The content itself lives in src/content/faqs.ts in a shape a future approved
 * -knowledge AI assistant can consume directly; the assistant is out of scope
 * for Phase 1 (spec §17).
 */
export function QuestionsBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqCategory | "All">("All");

  const results = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    return faqs.filter((faq) => {
      if (category !== "All" && faq.category !== category) return false;
      if (terms.length === 0) return true;

      const haystack = [
        faq.question,
        faq.category,
        ...faq.keywords,
        ...faq.answer,
      ]
        .join(" ")
        .toLowerCase();

      return terms.every((term) => haystack.includes(term));
    });
  }, [query, category]);

  return (
    <div>
      <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-panel">
        <label htmlFor="faq-search" className="text-sm font-semibold text-ink-800">
          Search questions
        </label>
        <div className="relative mt-2">
          <svg
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-400"
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.75" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “ALTA”, “point cloud”, “how long”, “APN”…"
            className="w-full rounded-md border border-ink-200 py-3 pr-4 pl-11 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["All", ...faqCategories] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                category === item
                  ? "bg-brand-600 text-white"
                  : "bg-ink-50 text-ink-700 hover:bg-ink-100"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-500" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? "question" : "questions"}
        {query ? ` matching “${query}”` : ""}
      </p>

      {results.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50 p-8 text-center">
          <p className="text-ink-700">
            No questions matched that search.
          </p>
          <p className="mt-2 text-sm text-ink-600">
            Ask TDR directly —{" "}
            <Link href="/contact" className="font-semibold text-brand-600">
              send a message
            </Link>{" "}
            or{" "}
            <Link href="/request-a-proposal" className="font-semibold text-brand-600">
              request a proposal
            </Link>{" "}
            and describe your project.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {results.map((faq) => (
            <details
              key={faq.id}
              id={faq.id}
              className="group scroll-mt-28 rounded-xl border border-ink-100 bg-white shadow-panel open:shadow-lift"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-6">
                <span>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                    {faq.category}
                  </span>
                  <span className="mt-1.5 block text-lg font-semibold text-ink-900">
                    {faq.question}
                  </span>
                </span>
                <svg
                  className="mt-1 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 8l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <div className="prose-tdr border-t border-ink-100 px-6 py-6">
                {faq.answer.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
