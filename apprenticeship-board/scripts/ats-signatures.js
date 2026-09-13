/**
 * ats-signatures.js
 * ---------------------------------------------------------------------------
 * Shared platform-detection logic used by both detect-platform.js (check one
 * URL) and bulk-add-employers.js (check a whole list and wire up the config
 * automatically). Kept in one place so the two never drift apart.
 * ---------------------------------------------------------------------------
 */

const SIGNATURES = [
  { platform: 'Greenhouse', tier: 1, connector: 'greenhouse', pattern: /greenhouse\.io|job-boards\.greenhouse/i },
  { platform: 'Lever', tier: 1, connector: 'lever', pattern: /jobs\.lever\.co/i },
  { platform: 'Workable', tier: 1, connector: 'workable', pattern: /apply\.workable\.com|\.workable\.com/i },
  { platform: 'SmartRecruiters', tier: 1, connector: 'smartrecruiters', pattern: /smartrecruiters\.com/i },
  { platform: 'Workday', tier: 2, connector: 'workday', pattern: /myworkdayjobs\.com/i },
  { platform: 'SuccessFactors', tier: 2, connector: null, pattern: /sapsf\.(eu|com)|successfactors/i },
  { platform: 'Avature', tier: 2, connector: null, pattern: /avature\.net/i },
  { platform: 'Beamery', tier: 2, connector: null, pattern: /beamery\.com/i },
  { platform: 'Eightfold', tier: 2, connector: null, pattern: /eightfold\.ai/i },
  { platform: 'Taleo', tier: 2, connector: null, pattern: /taleo\.net/i },
  { platform: 'iCIMS', tier: 2, connector: null, pattern: /icims\.com/i },
];

/**
 * Classify a URL. Tries the cheap, reliable route first: these ATS vendors
 * always serve from a predictable hostname (boards.greenhouse.io,
 * jobs.lever.co, *.myworkdayjobs.com, etc.), so if the URL itself matches,
 * we already know the answer with zero network calls - and zero risk of the
 * bot-protection false-negative below.
 *
 * Only if the URL's own hostname doesn't match anything do we fall back to
 * fetching the page and sniffing its HTML for a signature (e.g. a custom
 * careers domain that embeds an ATS via script/iframe). That fallback can
 * itself get 403'd by bot-protection on the page being checked - found while
 * building this, even some ATS-hosted marketing pages block a plain fetch -
 * so a failure there is reported as "unknown", not "definitely Tier 3".
 */
async function classifyUrl(url) {
  const hostHits = SIGNATURES.filter(s => s.pattern.test(url));
  if (hostHits.length) {
    hostHits.sort((a, b) => a.tier - b.tier);
    const best = hostHits[0];
    return { url, tier: best.tier, platform: hostHits.map(h => h.platform).join(' + '), connector: best.connector };
  }

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'apprenticeship-board-detector/1.0 (+read-only, single page)' } });
    if (!res.ok) return { url, error: `${res.status} ${res.statusText}`, uncertain: true };
    const html = await res.text();

    const hits = SIGNATURES.filter(s => s.pattern.test(html));
    if (!hits.length) return { url, tier: 3, platform: null, connector: null };

    hits.sort((a, b) => a.tier - b.tier);
    const best = hits[0];
    return { url, tier: best.tier, platform: hits.map(h => h.platform).join(' + '), connector: best.connector };
  } catch (err) {
    return { url, error: err.message, uncertain: true };
  }
}

/**
 * Pull the platform-specific identifier (board token / account slug /
 * Workday tenant+site) out of a URL that's already been classified. Returns
 * null if the URL doesn't match the expected shape for that connector - the
 * caller should fall back to a Tier 3 directory link and say why.
 */
function extractIdentifier(connector, url) {
  try {
    const u = new URL(url);
    switch (connector) {
      case 'greenhouse': {
        // job-boards.greenhouse.io/<token> or boards.greenhouse.io/<token>
        const seg = u.pathname.split('/').filter(Boolean)[0];
        return seg || null;
      }
      case 'lever': {
        // jobs.lever.co/<company>
        const seg = u.pathname.split('/').filter(Boolean)[0];
        return seg || null;
      }
      case 'workable': {
        // apply.workable.com/<accountSlug>/...
        const seg = u.pathname.split('/').filter(Boolean)[0];
        return seg || null;
      }
      case 'smartrecruiters': {
        // jobs.smartrecruiters.com/<companyId>/...
        const seg = u.pathname.split('/').filter(Boolean)[0];
        return seg || null;
      }
      case 'workday': {
        // <tenant>.wdN.myworkdayjobs.com/<site>/...
        const hostMatch = u.hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i);
        const site = u.pathname.split('/').filter(Boolean)[0];
        if (!hostMatch || !site) return null;
        return { hostname: u.hostname, tenant: hostMatch[1], site };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

module.exports = { SIGNATURES, classifyUrl, extractIdentifier };
