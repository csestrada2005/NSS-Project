/**
 * Unsplash image search — server-only.
 *
 * The Implementer used to invent images.unsplash.com IDs it had never seen,
 * producing wrong photos (source code in a bakery's "About" section). This
 * module queries the real Unsplash API from the server so the scaffold can hand
 * the model a pool of REAL, described photos to choose from.
 *
 * The access key lives ONLY on the server (UNSPLASH_ACCESS_KEY) and is passed in
 * — it never appears here, in the repo, or in the client.
 *
 * Contract: searchUnsplash NEVER throws. On any failure (no key, bad keywords,
 * network/timeouts, non-2xx, malformed JSON) it degrades to { images: [] } so
 * the endpoint can always answer without a 500.
 */

const UNSPLASH_SEARCH_URL = 'https://api.unsplash.com/search/photos';

/**
 * Append the Unsplash-required attribution UTM params to an author link,
 * preserving any query params the link already has. Empty input stays empty
 * — never invent a URL for an author link Unsplash didn't provide.
 */
function withUtmParams(authorLink) {
  if (!authorLink) return '';
  const url = new URL(authorLink);
  url.searchParams.set('utm_source', 'wyrd_forge');
  url.searchParams.set('utm_medium', 'referral');
  return url.toString();
}

/**
 * Search a single keyword. Returns an array of { id, value } candidates.
 * A per-request AbortController enforces the timeout. Any error is swallowed
 * (returns []) so one bad keyword never sinks the whole search.
 *
 * @returns {Promise<Array<{ id: string, value: { url: string, description: string, author_name: string, author_link: string, download_location: string } }>>}
 */
async function searchOneKeyword(keyword, { accessKey, fetchImpl, timeoutMs, perPage }) {
  const url = new URL(UNSPLASH_SEARCH_URL);
  url.searchParams.set('query', keyword);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    });
    if (!res || !res.ok) return [];

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results
      .filter((r) => r && typeof r.id === 'string' && r.urls?.regular)
      .map((r) => ({
        id: r.id,
        value: {
          url: r.urls.regular,
          // Prefer the human alt text, then the longer description, then the
          // keyword itself so the description column is never empty.
          description: r.alt_description ?? r.description ?? keyword,
          author_name: r.user?.name ?? 'Unknown',
          author_link: withUtmParams(r.user?.links?.html ?? ''),
          download_location: r.links?.download_location ?? '',
        },
      }));
  } catch {
    // Timeout, network error, bad JSON — treat as "no results for this keyword".
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consolidated Unsplash search across several keywords.
 *
 * @param {Object}   opts
 * @param {string[]} opts.keywords            search terms (invalid entries are dropped)
 * @param {string}   opts.accessKey           UNSPLASH_ACCESS_KEY (server env)
 * @param {Function} [opts.fetchImpl=fetch]   injectable fetch (for tests)
 * @param {number}   [opts.timeoutMs=5000]    per-request timeout
 * @param {number}   [opts.perPage=4]         results requested per keyword
 * @param {number}   [opts.maxItems=12]       hard cap on returned images
 * @returns {Promise<{ images: Array<{ url: string, description: string, author_name: string, author_link: string, download_location: string }> }>}
 */
export async function searchUnsplash({
  keywords,
  accessKey,
  fetchImpl = fetch,
  timeoutMs = 5000,
  perPage = 4,
  maxItems = 12,
}) {
  try {
    const safeKeywords = Array.isArray(keywords)
      ? keywords.filter((k) => typeof k === 'string' && k.trim().length > 0).map((k) => k.trim())
      : [];

    if (!accessKey || safeKeywords.length === 0) return { images: [] };

    // Dedupe by Unsplash photo id — the same photo can surface for several
    // keywords, and the pool must not list it twice.
    const byId = new Map();

    for (const keyword of safeKeywords) {
      if (byId.size >= maxItems) break;
      const candidates = await searchOneKeyword(keyword, {
        accessKey,
        fetchImpl,
        timeoutMs,
        perPage,
      });
      for (const candidate of candidates) {
        if (!byId.has(candidate.id)) byId.set(candidate.id, candidate.value);
        if (byId.size >= maxItems) break;
      }
    }

    return { images: [...byId.values()].slice(0, maxItems) };
  } catch {
    // Belt-and-suspenders: nothing above should throw, but the endpoint must
    // never see an exception bubble up into a 500.
    return { images: [] };
  }
}

/**
 * Fire the Unsplash download-trigger GET for each given download_location URL,
 * as required by the Unsplash API guidelines when a photo is actually used.
 *
 * The URLs come from Unsplash already fully formed (including ixid and any
 * other query params) — they are used AS-IS, never rebuilt, per the terms.
 *
 * Contract: same as searchUnsplash — NEVER throws. This is telemetry toward
 * Unsplash; a failure here must never affect a generation.
 *
 * @param {Object}   opts
 * @param {string[]} opts.downloadLocations   download_location URLs (already deduped by caller)
 * @param {string}   opts.accessKey           UNSPLASH_ACCESS_KEY (server env)
 * @param {Function} [opts.fetchImpl=fetch]   injectable fetch (for tests)
 * @param {number}   [opts.timeoutMs=5000]    per-request timeout
 * @returns {Promise<{ triggered: number, failed: number }>}
 */
export async function triggerUnsplashDownloads({
  downloadLocations,
  accessKey,
  fetchImpl = fetch,
  timeoutMs = 5000,
}) {
  try {
    const safeLocations = Array.isArray(downloadLocations)
      ? downloadLocations.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : [];

    if (!accessKey || safeLocations.length === 0) return { triggered: 0, failed: 0 };

    let triggered = 0;
    let failed = 0;

    for (const location of safeLocations) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(location, {
          headers: { Authorization: `Client-ID ${accessKey}` },
          signal: controller.signal,
        });
        if (res && res.ok) {
          triggered += 1;
        } else {
          failed += 1;
        }
      } catch {
        // Timeout, network error — count as failed, never propagate.
        failed += 1;
      } finally {
        clearTimeout(timer);
      }
    }

    return { triggered, failed };
  } catch {
    // Belt-and-suspenders: this must never throw into the caller.
    return { triggered: 0, failed: 0 };
  }
}
