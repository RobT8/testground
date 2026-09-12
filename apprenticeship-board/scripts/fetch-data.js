#!/usr/bin/env node
/**
 * fetch-data.js
 * ---------------------------------------------------------------------------
 * Orchestrates every configured data source (see sources.config.json) into a
 * single data/vacancies.json for the front end. gov.uk's "Find an
 * apprenticeship" service is the backbone, since it's the largest single
 * free, legal source - but it doesn't cover everything: some large
 * employers (e.g. Dyson) only ever advertise apprenticeships on their own
 * careers site. So this script also pulls from:
 *
 *   TIER 1 (sanctioned, documented, free APIs built for aggregation):
 *     - gov.uk Display Vacancy Advert API
 *     - Greenhouse Job Board API
 *     - Lever Postings API
 *
 *   TIER 2 (gray area, opt-in per employer - see sources.config.json):
 *     - Workday-hosted careers sites (e.g. Dyson)
 *
 *   TIER 3 (no automation at all):
 *     - A curated list of link-out cards for employers with neither of the
 *       above (rendered as a separate section, never mixed into the
 *       aggregated vacancy list, since we're not extracting their content).
 *
 * See README.md for the reasoning behind each tier, and connectors.js for
 * the per-source fetch logic.
 *
 * Usage:
 *   export APPRENTICESHIP_API_KEY="your-gov.uk-key"   # optional but recommended
 *   node scripts/fetch-data.js
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const {
  govukVacancies,
  greenhouseVacancies,
  leverVacancies,
  workableVacancies,
  smartRecruitersVacancies,
  workdayVacancies,
} = require('./connectors');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'vacancies.json');
const SAMPLE_PATH = path.join(__dirname, '..', 'data', 'vacancies.sample.json');
const CONFIG_PATH = path.join(__dirname, '..', 'sources.config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

async function main() {
  const config = loadConfig();
  const apiKey = process.env.APPRENTICESHIP_API_KEY;
  const results = [];

  if (config.govuk?.enabled) {
    results.push(...await govukVacancies({ apiKey }));
  }

  for (const gh of config.atsConnectors?.greenhouse || []) {
    if (gh.enabled) results.push(...await greenhouseVacancies(gh));
  }

  for (const lv of config.atsConnectors?.lever || []) {
    if (lv.enabled) results.push(...await leverVacancies(lv));
  }

  for (const wk of config.atsConnectors?.workable || []) {
    if (wk.enabled) results.push(...await workableVacancies(wk));
  }

  for (const sr of config.atsConnectors?.smartrecruiters || []) {
    if (sr.enabled) results.push(...await smartRecruitersVacancies(sr));
  }

  for (const wd of config.grayAreaConnectors?.workday || []) {
    results.push(...await workdayVacancies(wd));
  }

  const employerLinks = config.directoryLinks?.employers || [];

  if (!apiKey && results.length === 0) {
    console.warn(
      '\nNo live sources returned data (no APPRENTICESHIP_API_KEY, and no ' +
      'ATS connectors enabled in sources.config.json) - keeping sample data ' +
      'so the board still works. See README.md to wire up real sources.\n'
    );
    if (!fs.existsSync(OUTPUT_PATH)) fs.copyFileSync(SAMPLE_PATH, OUTPUT_PATH);
    return;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'multi-source (see README.md)',
    note: 'Aggregated from gov.uk plus any ATS/employer connectors enabled in sources.config.json.',
    vacancies: results,
    employerLinks,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${results.length} vacancies and ${employerLinks.length} employer links to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch(err => {
  console.error('fetch-data.js failed:', err);
  process.exitCode = 1;
});
