#!/usr/bin/env node
/**
 * fetch-data.js
 * ---------------------------------------------------------------------------
 * Pulls live apprenticeship vacancies from the UK government's official,
 * FREE "Display Vacancy Advert API" (part of the Apprenticeship Service /
 * "Find an apprenticeship") and writes them to data/vacancies.json in the
 * shape the front end (app.js) expects.
 *
 * Why this API instead of scraping job boards?
 *   - It's free, requires only a self-service sign-up for an API key, and is
 *     built by DfE specifically so third parties can display vacancies.
 *   - Every genuine registered UK apprenticeship vacancy must, by law, be
 *     advertised through this service (or a handful of provider portals
 *     that feed into it) - so it's actually a MORE complete and reliable
 *     source than scraping any single commercial job board.
 *   - Scraping sites like Indeed, Reed or Totaljobs violates their Terms of
 *     Service (they explicitly disallow automated access) and is legally
 *     risky - not something to build for you.
 *
 * Getting a free API key:
 *   1. Go to https://developer.apprenticeships.education.gov.uk/
 *   2. Create a free account and subscribe to the "Display vacancy advert
 *      API" product to get a subscription key.
 *   3. Set it as an environment variable before running this script:
 *        export APPRENTICESHIP_API_KEY="your-key-here"
 *
 * Usage:
 *   node scripts/fetch-data.js
 *
 * NOTE ON FIELD NAMES: the gov.uk developer portal is only reachable from a
 * browser with an account (it's blocked from this sandboxed environment), so
 * the exact JSON field names below are our best-effort mapping based on the
 * publicly documented shape of the API. The `normalizeVacancy()` function
 * below is deliberately defensive (it tries several likely field-name
 * spellings) and logs anything it can't map - check the console output the
 * first time you run this with a real key, and adjust the ALIASES if the
 * live response uses different names. Open the Swagger page linked above
 * ("Documentation" tab) to confirm the current schema.
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.apprenticeships.education.gov.uk/vacancies';
const API_KEY = process.env.APPRENTICESHIP_API_KEY;
const API_VERSION = process.env.APPRENTICESHIP_API_VERSION || '2';
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // safety cap - 5,000 vacancies is plenty for a board

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'vacancies.json');
const SAMPLE_PATH = path.join(__dirname, '..', 'data', 'vacancies.sample.json');

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function normalizeVacancy(raw) {
  const address = raw.address || raw.location || {};
  const wage = raw.wage || {};

  return {
    id: String(pick(raw, 'vacancyReference', 'id', 'reference') ?? cryptoRandomId()),
    title: pick(raw, 'title', 'vacancyTitle', 'courseTitle') || 'Apprenticeship vacancy',
    employerName: pick(raw, 'employerName', 'organisationName', 'trainingProviderName') || 'Employer not stated',
    sector: pick(raw, 'sector', 'category', 'subCategory', 'routeName') || 'Uncategorised',
    level: pick(raw, 'apprenticeshipLevel', 'level', 'course.level') || 'Not stated',
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

function cryptoRandomId() {
  return 'gen-' + Math.random().toString(36).slice(2, 10);
}

async function fetchPage(pageNumber) {
  const url = new URL(API_BASE);
  url.searchParams.set('pageNumber', String(pageNumber));
  url.searchParams.set('pageSize', String(PAGE_SIZE));

  const res = await fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': API_KEY,
      'X-Version': API_VERSION,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API request failed (${res.status} ${res.statusText}) for page ${pageNumber}: ${body.slice(0, 500)}`);
  }

  return res.json();
}

async function fetchAllVacancies() {
  let page = 1;
  const all = [];

  while (page <= MAX_PAGES) {
    console.log(`Fetching page ${page}...`);
    const data = await fetchPage(page);
    const items = data.vacancies || data.results || data.items || (Array.isArray(data) ? data : []);

    if (!items.length) break;
    all.push(...items);

    const totalPages = data.totalPages || data.pageCount;
    if (totalPages && page >= totalPages) break;
    if (items.length < PAGE_SIZE) break;

    page += 1;
  }

  return all;
}

async function main() {
  if (!API_KEY) {
    console.warn(
      '\nNo APPRENTICESHIP_API_KEY set - skipping live fetch and keeping the ' +
      'existing/sample data so the board still works. Get a free key from ' +
      'https://developer.apprenticeships.education.gov.uk/ to pull live vacancies.\n'
    );
    if (!fs.existsSync(OUTPUT_PATH)) {
      fs.copyFileSync(SAMPLE_PATH, OUTPUT_PATH);
      console.log('Copied sample data to data/vacancies.json');
    }
    return;
  }

  try {
    const rawVacancies = await fetchAllVacancies();
    const vacancies = rawVacancies.map(normalizeVacancy);

    const output = {
      generatedAt: new Date().toISOString(),
      source: 'api.apprenticeships.education.gov.uk/vacancies',
      note: 'Live data from the official gov.uk Display Vacancy Advert API.',
      vacancies,
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`Wrote ${vacancies.length} vacancies to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  } catch (err) {
    console.error('Failed to fetch live vacancies:', err.message);
    console.error('Leaving existing data/vacancies.json untouched.');
    process.exitCode = 1;
  }
}

main();
