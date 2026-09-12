/**
 * connectors.js
 * ---------------------------------------------------------------------------
 * One function per data source. Each returns an array of normalized
 * vacancy objects (see the shape in normalizeVacancy-style output below) and
 * NEVER throws past its own boundary - a broken/rate-limited source should
 * not take down the whole fetch run, it should just log and return [].
 *
 * TIER 1 - govukVacancies(), greenhouseVacancies(), leverVacancies():
 *   Official, documented, public APIs meant for third-party aggregation.
 *   Free to use, no special permission needed beyond (for gov.uk) a free
 *   API key sign-up.
 *
 * TIER 2 - workdayVacancies():
 *   Calls the same JSON endpoint a Workday-hosted careers site's own search
 *   box calls. It's unauthenticated and public in the sense that any visitor's
 *   browser loads it, but Workday does not document or sanction third-party
 *   reuse - whether it's fine depends on the EMPLOYER's own site terms, not
 *   Workday's. That's why every entry needs `confirmedTermsChecked: true` in
 *   sources.config.json before this connector will call it, and why calls
 *   are kept low-volume (single page, no aggressive pagination/polling).
 * ---------------------------------------------------------------------------
 */

const APPRENTICE_WORDS = /apprentice/i;

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') return obj[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// TIER 1: gov.uk Display Vacancy Advert API
// ---------------------------------------------------------------------------
async function govukVacancies({ apiKey, apiVersion = '2', pageSize = 100, maxPages = 50 }) {
  if (!apiKey) {
    console.warn('[gov.uk] No APPRENTICESHIP_API_KEY set - skipping this source.');
    return [];
  }

  const API_BASE = 'https://api.apprenticeships.education.gov.uk/vacancies';
  const all = [];
  let page = 1;

  try {
    while (page <= maxPages) {
      const url = new URL(API_BASE);
      url.searchParams.set('pageNumber', String(page));
      url.searchParams.set('pageSize', String(pageSize));

      const res = await fetch(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'X-Version': apiVersion,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      const items = data.vacancies || data.results || data.items || (Array.isArray(data) ? data : []);
      if (!items.length) break;
      all.push(...items.map(normalizeGovukVacancy));

      const totalPages = data.totalPages || data.pageCount;
      if ((totalPages && page >= totalPages) || items.length < pageSize) break;
      page += 1;
    }
  } catch (err) {
    console.error(`[gov.uk] Failed to fetch page ${page}: ${err.message}`);
  }

  console.log(`[gov.uk] Fetched ${all.length} vacancies.`);
  return all;
}

function normalizeGovukVacancy(raw) {
  const address = raw.address || raw.location || {};
  const wage = raw.wage || {};
  return {
    id: `govuk-${pick(raw, 'vacancyReference', 'id', 'reference') ?? Math.random().toString(36).slice(2)}`,
    source: 'Find an apprenticeship (gov.uk)',
    title: pick(raw, 'title', 'vacancyTitle', 'courseTitle') || 'Apprenticeship vacancy',
    employerName: pick(raw, 'employerName', 'organisationName', 'trainingProviderName') || 'Employer not stated',
    sector: pick(raw, 'sector', 'category', 'subCategory', 'routeName') || 'Uncategorised',
    level: pick(raw, 'apprenticeshipLevel', 'level') || 'Not stated',
    town: pick(address, 'town', 'addressLine3', 'city') || pick(raw, 'town') || 'Location not stated',
    postcode: pick(address, 'postcode') || pick(raw, 'postcode') || '',
    wageAmount: pick(wage, 'wageAmount', 'amount') ?? pick(raw, 'wageAmount'),
    wageUnit: pick(wage, 'wageUnit', 'wageType', 'unit') || pick(raw, 'wageUnit') || 'per year',
    duration: pick(raw, 'expectedDuration', 'duration') || 'Not stated',
    closingDate: pick(raw, 'closingDate', 'applicationClosingDate') || null,
    startDate: pick(raw, 'startDate', 'expectedStartDate') || null,
    vacancyUrl: pick(raw, 'vacancyUrl', 'url', 'applicationUrl') || 'https://www.gov.uk/apply-apprenticeship',
  };
}

// ---------------------------------------------------------------------------
// TIER 1: Greenhouse public Job Board API
// Docs: https://docs.greenhouse.io/job-board.html - no auth required to read.
// ---------------------------------------------------------------------------
async function greenhouseVacancies({ employer, boardToken }) {
  if (!boardToken || boardToken === 'REPLACE_ME') return [];

  try {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    const jobs = (data.jobs || []).filter(j => APPRENTICE_WORDS.test(j.title) || APPRENTICE_WORDS.test(j.content || ''));

    console.log(`[greenhouse:${employer}] Fetched ${jobs.length} apprenticeship postings.`);
    return jobs.map(j => ({
      id: `greenhouse-${j.id}`,
      source: `${employer} (careers site)`,
      title: j.title,
      employerName: employer,
      sector: (j.departments || []).map(d => d.name).join(', ') || 'Uncategorised',
      level: 'See listing',
      town: (j.offices || []).map(o => o.name).join(', ') || 'Location not stated',
      postcode: '',
      wageAmount: undefined,
      wageUnit: '',
      duration: 'Not stated',
      closingDate: null,
      startDate: null,
      vacancyUrl: j.absolute_url,
    }));
  } catch (err) {
    console.error(`[greenhouse:${employer}] Failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// TIER 1: Lever public postings API
// Docs: https://github.com/lever/postings-api - no auth required to read.
// ---------------------------------------------------------------------------
async function leverVacancies({ employer, company }) {
  if (!company || company === 'REPLACE_ME') return [];

  try {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const jobs = await res.json();
    const filtered = jobs.filter(j => APPRENTICE_WORDS.test(j.text || '') || APPRENTICE_WORDS.test(j.descriptionPlain || ''));

    console.log(`[lever:${employer}] Fetched ${filtered.length} apprenticeship postings.`);
    return filtered.map(j => ({
      id: `lever-${j.id}`,
      source: `${employer} (careers site)`,
      title: j.text,
      employerName: employer,
      sector: j.categories?.team || j.categories?.department || 'Uncategorised',
      level: 'See listing',
      town: j.categories?.location || 'Location not stated',
      postcode: '',
      wageAmount: undefined,
      wageUnit: '',
      duration: 'Not stated',
      closingDate: null,
      startDate: null,
      vacancyUrl: j.hostedUrl,
    }));
  } catch (err) {
    console.error(`[lever:${employer}] Failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// TIER 2 (gray area, opt-in only): Workday-hosted careers sites.
// Calls the same POST endpoint the site's own search UI uses. Kept to a
// single request (no pagination loop) to stay low-volume.
// ---------------------------------------------------------------------------
async function workdayVacancies({ employer, hostname, tenant, site, searchText = 'apprentice', confirmedTermsChecked }) {
  if (!confirmedTermsChecked) {
    console.warn(`[workday:${employer}] Skipped - set confirmedTermsChecked:true in sources.config.json after checking ${employer}'s own site terms.`);
    return [];
  }

  try {
    const url = `https://${hostname}/wday/cxs/${tenant}/${site}/jobs`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    const postings = data.jobPostings || [];

    console.log(`[workday:${employer}] Fetched ${postings.length} apprenticeship postings.`);
    return postings.map(p => ({
      id: `workday-${p.bulletFields?.[0] || p.title}`,
      source: `${employer} (careers site)`,
      title: p.title,
      employerName: employer,
      sector: 'See listing',
      level: 'See listing',
      town: p.locationsText || 'Location not stated',
      postcode: '',
      wageAmount: undefined,
      wageUnit: '',
      duration: 'Not stated',
      closingDate: p.endDate || null,
      startDate: p.startDate || null,
      vacancyUrl: `https://${hostname}${p.externalPath || ''}`,
    }));
  } catch (err) {
    console.error(`[workday:${employer}] Failed: ${err.message}`);
    return [];
  }
}

module.exports = {
  govukVacancies,
  greenhouseVacancies,
  leverVacancies,
  workdayVacancies,
};
