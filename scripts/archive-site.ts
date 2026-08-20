/**
 * Phase 1A — legacy website archive and inventory (spec §3).
 *
 * Crawls the existing TDREngineering.com site and writes an independent,
 * offline copy plus a migration inventory, BEFORE any DNS change or cutover.
 *
 *   npm run archive:crawl
 *   LEGACY_SITE_URL=https://tdrengineering.com npm run archive:crawl
 *
 * What it produces under ARCHIVE_OUTPUT_DIR (default ./archive):
 *
 *   pages/<slug>.html      Raw HTML of every discovered page
 *   assets/<path>          Every referenced image, PDF, video and download
 *   inventory.csv          One row per page — the migration table from spec §3
 *   assets.csv             One row per downloaded asset
 *   links.csv              Every internal link found, for redirect mapping
 *   crawl-log.txt          Errors and skipped URLs
 *
 * The inventory's `disposition` column is intentionally left blank: a human
 * fills it in with KEEP / REFRESH / REBUILD / ARCHIVE after review.
 *
 * Deliberately dependency-free (node: builtins + fetch only) so it can be run
 * from any machine without installing the whole web project, including after
 * the new site has replaced the old one — as long as a copy of the old site is
 * still reachable somewhere.
 */

import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";

const LEGACY_SITE_URL = process.env.LEGACY_SITE_URL ?? "https://www.tdrengineering.com";
const OUTPUT_DIR = process.env.ARCHIVE_OUTPUT_DIR ?? "./archive";
const MAX_PAGES = Number(process.env.ARCHIVE_MAX_PAGES ?? 500);
const DELAY_MS = Number(process.env.ARCHIVE_DELAY_MS ?? 400);
const USER_AGENT =
  "TDR-Engineering-Archive/1.0 (Phase 1A site preservation; contact info@tdrengineering.com)";

type PageRecord = {
  url: string;
  status: number;
  title: string;
  metaDescription: string;
  h1: string;
  wordCount: number;
  assetCount: number;
  localFile: string;
  category: string;
  disposition: string;
  newDestination: string;
  notes: string;
};

type AssetRecord = {
  pageUrl: string;
  assetUrl: string;
  kind: string;
  bytes: number;
  localFile: string;
};

const pages: PageRecord[] = [];
const assets: AssetRecord[] = [];
const links: { fromUrl: string; toUrl: string; anchorText: string }[] = [];
const visited = new Set<string>();
const seenAssets = new Set<string>();
const queue: string[] = [];

const origin = new URL(LEGACY_SITE_URL).origin;

function log(message: string) {
  console.log(message);
  void appendFile(join(OUTPUT_DIR, "crawl-log.txt"), `${message}\n`).catch(() => {});
}

/** Strips the fragment and trailing slash so /about and /about/ are one page. */
function normalizeUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.origin !== origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function slugFor(url: string): string {
  const { pathname, search } = new URL(url);
  const base = pathname === "/" ? "index" : pathname.replace(/^\//, "").replace(/\//g, "__");
  const suffix = search ? `__${search.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
  return `${base}${suffix}`.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150) || "page";
}

function textBetween(html: string, pattern: RegExp): string {
  const match = html.match(pattern);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Rough page categorisation to pre-sort the inventory for review. */
function categorize(url: string, title: string): string {
  const haystack = `${url} ${title}`.toLowerCase();
  if (/\/$|index|home/.test(new URL(url).pathname) && new URL(url).pathname.length <= 1)
    return "Homepage";
  if (/service|survey|engineer|scan|lidar|bim|revit|alta|boundary|topo/.test(haystack))
    return "Service";
  if (/project|portfolio|case|gallery/.test(haystack)) return "Project";
  if (/about|team|staff|history|company/.test(haystack)) return "About";
  if (/contact|quote|estimate|request/.test(haystack)) return "Contact / Quote";
  if (/blog|news|article|post/.test(haystack)) return "News";
  if (/faq|question/.test(haystack)) return "FAQ";
  return "Other";
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        redirect: "follow",
      });
      return response;
    } catch (error) {
      if (attempt === attempts) {
        log(`  ! fetch failed after ${attempts} attempts: ${url} (${String(error)})`);
        return null;
      }
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function saveFile(relativePath: string, data: Buffer | string) {
  const full = join(OUTPUT_DIR, relativePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}

async function downloadAsset(pageUrl: string, assetUrl: string, kind: string) {
  if (seenAssets.has(assetUrl)) return;
  seenAssets.add(assetUrl);

  const response = await fetchWithRetry(assetUrl);
  if (!response || !response.ok) {
    log(`  ! asset ${response?.status ?? "ERR"}: ${assetUrl}`);
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const { pathname } = new URL(assetUrl);
  const relative = join("assets", pathname.replace(/^\//, "") || "asset");
  const withExtension = extname(relative) ? relative : `${relative}.bin`;

  await saveFile(withExtension, buffer);
  assets.push({
    pageUrl,
    assetUrl,
    kind,
    bytes: buffer.byteLength,
    localFile: withExtension,
  });
}

function extractAttributes(html: string, tag: string, attribute: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) out.push(match[1]);
  return out;
}

async function crawlPage(url: string) {
  visited.add(url);
  log(`→ ${url}`);

  const response = await fetchWithRetry(url);
  if (!response) return;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    await downloadAsset(url, url, "document");
    return;
  }

  const html = await response.text();
  const slug = slugFor(url);
  const localFile = join("pages", `${slug}.html`);
  await saveFile(localFile, html);

  const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    html.match(
      /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i,
    )?.[1] ??
    html.match(
      /<meta\s+[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i,
    )?.[1] ??
    "";
  const h1 = textBetween(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // --- assets -----------------------------------------------------------
  const images = extractAttributes(html, "img", "src");
  const sources = extractAttributes(html, "source", "src");
  const videos = extractAttributes(html, "video", "src");
  const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  let assetCount = 0;

  for (const src of [...images, ...sources, ...videos]) {
    const resolved = normalizeUrl(src, url);
    if (!resolved) continue;
    assetCount += 1;
    await downloadAsset(url, resolved, /\.(mp4|webm|mov)$/i.test(resolved) ? "video" : "image");
    await sleep(50);
  }

  // --- links ------------------------------------------------------------
  for (const [, href, anchorHtml] of anchors) {
    const resolved = normalizeUrl(href, url);
    if (!resolved) continue;

    const anchorText = decodeEntities(anchorHtml.replace(/<[^>]+>/g, "").trim()).slice(0, 120);
    links.push({ fromUrl: url, toUrl: resolved, anchorText });

    // Downloads (PDFs, CAD samples, plan sheets) are archived, not crawled.
    if (/\.(pdf|zip|dwg|dxf|rvt|doc|docx|xls|xlsx)$/i.test(new URL(resolved).pathname)) {
      assetCount += 1;
      await downloadAsset(url, resolved, "download");
      continue;
    }

    if (!visited.has(resolved) && !queue.includes(resolved)) queue.push(resolved);
  }

  pages.push({
    url,
    status: response.status,
    title,
    metaDescription,
    h1,
    wordCount: bodyText.split(/\s+/).filter(Boolean).length,
    assetCount,
    localFile,
    category: categorize(url, title),
    // Filled in by a human during review (spec §3).
    disposition: "",
    newDestination: "",
    notes: "",
  });
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ].join("\r\n");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    join(OUTPUT_DIR, "crawl-log.txt"),
    `TDR Engineering legacy archive\nStarted: ${new Date().toISOString()}\nSource: ${LEGACY_SITE_URL}\n\n`,
  );

  log(`Archiving ${LEGACY_SITE_URL} → ${OUTPUT_DIR}`);
  log(`Limits: ${MAX_PAGES} pages, ${DELAY_MS}ms between requests\n`);

  queue.push(normalizeUrl(LEGACY_SITE_URL, LEGACY_SITE_URL) ?? LEGACY_SITE_URL);

  // Sitemaps are the best source of indexed URLs — seed from them when present.
  for (const candidate of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]) {
    const response = await fetchWithRetry(`${origin}${candidate}`);
    if (!response?.ok) continue;
    const xml = await response.text();
    const found = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    log(`Found ${found.length} URLs in ${candidate}`);
    for (const entry of found) {
      const resolved = normalizeUrl(entry, origin);
      if (resolved && !queue.includes(resolved)) queue.push(resolved);
    }
  }

  // robots.txt is archived too — it may reveal paths nothing links to.
  const robots = await fetchWithRetry(`${origin}/robots.txt`);
  if (robots?.ok) await saveFile("robots.txt", await robots.text());

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    await crawlPage(next);
    await sleep(DELAY_MS);
  }

  if (queue.length > 0) {
    log(`\n! Stopped at the ${MAX_PAGES}-page limit with ${queue.length} URLs still queued.`);
    log(`  Re-run with ARCHIVE_MAX_PAGES set higher to finish the crawl.`);
  }

  await saveFile(
    "inventory.csv",
    toCsv(pages as unknown as Record<string, unknown>[], [
      "url",
      "status",
      "title",
      "metaDescription",
      "h1",
      "wordCount",
      "assetCount",
      "category",
      "localFile",
      "disposition",
      "newDestination",
      "notes",
    ]),
  );
  await saveFile(
    "assets.csv",
    toCsv(assets as unknown as Record<string, unknown>[], [
      "pageUrl",
      "assetUrl",
      "kind",
      "bytes",
      "localFile",
    ]),
  );
  await saveFile(
    "links.csv",
    toCsv(links as unknown as Record<string, unknown>[], ["fromUrl", "toUrl", "anchorText"]),
  );

  const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);

  log(`\nDone.`);
  log(`  Pages archived : ${pages.length}`);
  log(`  Assets saved   : ${assets.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  log(`  Internal links : ${links.length}`);
  log(`\nNext steps (spec §3, §14):`);
  log(`  1. Review inventory.csv and set disposition to KEEP / REFRESH / REBUILD / ARCHIVE.`);
  log(`  2. Set newDestination for every URL that must keep its search equity.`);
  log(`  3. Copy those pairs into src/content/redirects.ts as 301 redirects.`);
  log(`  4. Store a copy of ${OUTPUT_DIR} somewhere TDR controls, off this machine.`);
}

main().catch((error) => {
  console.error("Archive failed:", error);
  process.exit(1);
});
