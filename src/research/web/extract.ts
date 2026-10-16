import { neutraliseActionBlocks } from "../../tools/proposals";
import type { SourceKind } from "./types";

/**
 * Turn fetched HTML into text this app is willing to quote.
 *
 * Two rules govern everything here:
 *
 * 1. **Nothing is executed and nothing is inserted.** The document is parsed with
 *    `DOMParser`, which produces an inert tree: scripts are never run, images and
 *    frames are never loaded, and the result is never assigned to the live
 *    document. What is *counted* as removed is reported, not hidden.
 * 2. **Untrusted text stays data.** Extracted text is passed through
 *    `neutraliseActionBlocks`, the same routine the tool layer uses, so a page
 *    that contains a `<blackletter-action>` block cannot smuggle an instruction
 *    back into the app through retrieved content.
 */

/** Text kept per source. Longer pages are cut, and the record says so. */
export const MAX_SOURCE_CHARS = 60_000;

const STRIPPED_SELECTOR = "script, style, noscript, iframe, object, embed, svg, canvas, template, form, link, meta";

const BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, pre, td, th, figcaption, summary";

/** Elements that must not influence the text even if a page nests them oddly. */
export interface Extraction {
  title: string;
  text: string;
  author: string | null;
  publisher: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  sanitisedElements: number;
  linksNotFollowed: number;
  textTruncated: boolean;
}

function metaContent(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    const content = element?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

function normaliseIso(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // A bare year is a legitimate publication statement; do not invent a month.
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  return parsed.toISOString();
}

function collapse(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visibleText(root: Element): string {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SELECTOR)).filter((element) => {
    // Skip a block nested inside another block, so a `p` inside an `li` is not
    // emitted twice.
    const nearest = element.closest(BLOCK_SELECTOR);
    return nearest === element;
  });

  const pieces = blocks
    .map((element) => collapse(element.textContent ?? ""))
    .filter((piece) => piece.length > 0);

  if (pieces.length > 0) return pieces.join("\n\n");
  return collapse(root.textContent ?? "");
}

export function extractPage(html: string, pageUrl: string): Extraction {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Metadata is read *before* anything is stripped: `<meta>` and `<link>` carry
  // the publication facts, and a page's claims about itself are still data even
  // when the elements themselves are removed from the text.
  const title =
    collapse(doc.querySelector("title")?.textContent ?? "") ||
    collapse(doc.querySelector("h1")?.textContent ?? "") ||
    "(untitled page)";

  const author =
    metaContent(doc, [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="citation_author"]',
    ]) ?? null;

  const publisher = metaContent(doc, ['meta[property="og:site_name"]', 'meta[name="application-name"]']);

  const publishedAt = normaliseIso(
    metaContent(doc, [
      'meta[property="article:published_time"]',
      'meta[name="citation_publication_date"]',
      'meta[name="date"]',
      'meta[name="dc.date"]',
    ]) ??
      doc.querySelector("time[datetime]")?.getAttribute("datetime") ??
      null,
  );

  const canonicalRaw =
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() ??
    metaContent(doc, ['meta[property="og:url"]']);

  const links = doc.querySelectorAll("a[href]").length;

  const stripped = Array.from(doc.querySelectorAll(STRIPPED_SELECTOR));
  const sanitisedElements = stripped.length;
  for (const element of stripped) element.remove();

  const root =
    doc.querySelector("article") ?? doc.querySelector("main") ?? doc.querySelector("body") ?? doc.documentElement;
  const raw = visibleText(root);
  const neutralised = neutraliseActionBlocks(raw);
  const truncated = neutralised.length > MAX_SOURCE_CHARS;

  return {
    title,
    text: truncated ? neutralised.slice(0, MAX_SOURCE_CHARS) : neutralised,
    author,
    publisher,
    publishedAt,
    canonicalUrl: canonicalRaw ? resolveUrl(canonicalRaw, pageUrl) : null,
    sanitisedElements,
    linksNotFollowed: links,
    textTruncated: truncated,
  };
}

/** Resolve a possibly-relative URL, returning `null` when it is unusable. */
export function resolveUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|ref_src$|igshid$)/i;

/**
 * Canonical form of a URL, used for identity and for deduplication.
 *
 * Deliberately conservative: the scheme and host are lower-cased, the fragment
 * and tracking parameters are dropped, and a trailing slash is removed. Nothing
 * is rewritten that could point at different content — `?page=2` stays.
 */
export function canonicaliseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    const keep: Array<[string, string]> = [];
    url.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAM.test(key)) keep.push([key, value]);
    });
    keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    url.search = "";
    for (const [key, value] of keep) url.searchParams.append(key, value);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

/** The host a source would be attributed to, or `null` when unreadable. */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const PRIMARY_DOMAIN = /\.(gov|mil)(\.[a-z]{2})?$|\.(edu|ac\.[a-z]{2})$|\.int$/;
const PRIMARY_HOSTS = [
  "doi.org",
  "arxiv.org",
  "zenodo.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "ieee.org",
  "acm.org",
  "nature.com",
  "science.org",
  "springer.com",
  "link.springer.com",
  "wiley.com",
  "tandfonline.com",
  "jstor.org",
  "ssrn.com",
  "oecd.org",
  "un.org",
  "who.int",
  "europa.eu",
  "imf.org",
  "worldbank.org",
];
const NEWS_HOSTS = ["reuters.com", "apnews.com", "bbc.co.uk", "bbc.com", "nytimes.com", "theguardian.com", "aljazeera.com", "bloomberg.com", "ft.com", "wsj.com", "economist.com", "npr.org"];
const COMMUNITY_HOSTS = ["medium.com", "substack.com", "reddit.com", "quora.com", "facebook.com", "x.com", "twitter.com", "linkedin.com", "wordpress.com", "blogspot.com", "tumblr.com"];

function matchesHost(host: string, entries: string[]): boolean {
  return entries.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/**
 * Classify a source's *kind* by host and path.
 *
 * This is a stated heuristic, not a verification, and the returned basis is the
 * reason a reader can check. Nothing else in the app treats `likely-primary` as
 * proof of anything: it adjusts a ranking prior and is shown as a label.
 */
export function classifySource(url: string): { kind: SourceKind; basis: string } {
  const host = hostOf(url) ?? "";
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (PRIMARY_DOMAIN.test(host) || matchesHost(host, PRIMARY_HOSTS)) {
    return {
      kind: "likely-primary",
      basis: `the host "${host}" is a state, academic, standards or publisher domain`,
    };
  }
  if (/\/(report|publication|whitepaper|policy-brief|statistics)\b/.test(path)) {
    return { kind: "likely-primary", basis: `the path "${path}" looks like a published document` };
  }
  if (host === "wikipedia.org" || host.endsWith(".wikipedia.org") || host.endsWith(".fandom.com")) {
    return { kind: "secondary", basis: "a community-edited reference work, which summarises sources rather than being one" };
  }
  if (matchesHost(host, NEWS_HOSTS)) {
    return { kind: "secondary", basis: `"${host}" is a news organisation, which reports on a record rather than issuing it` };
  }
  if (matchesHost(host, COMMUNITY_HOSTS) || /\/(blog|opinion|commentary)\b/.test(path)) {
    return { kind: "commentary", basis: `"${host}" is a self-published or discussion platform` };
  }
  return { kind: "unknown", basis: "no domain or path rule matched, so the kind is unclassified" };
}
