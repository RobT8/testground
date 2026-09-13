#!/usr/bin/env node
/**
 * bulk-add-employers.js
 * ---------------------------------------------------------------------------
 * Takes a whole list of employer URLs at once and wires up sources.config.json
 * automatically - the bulk version of detect-platform.js.
 *
 * For each line it:
 *   1. Classifies the platform (Tier 1 / 2 / 3 - see connectors.js / README).
 *   2. Tier 1 (Greenhouse/Lever/Workable/SmartRecruiters): extracts the
 *      board token/slug and adds it to sources.config.json with
 *      "enabled": true. Safe to do automatically - these are sanctioned,
 *      documented, public APIs built for exactly this.
 *   3. Tier 2 with a connector (currently: Workday): adds it to
 *      sources.config.json with "confirmedTermsChecked": false. It will NOT
 *      be fetched until a human reads that employer's own site terms and
 *      flips that flag - this script never does that for you.
 *   4. Tier 2 without a connector yet (SuccessFactors, Avature, Beamery,
 *      Eightfold, Taleo, iCIMS) and Tier 3 (nothing detected, or blocked):
 *      added as a plain directory link instead, with a note explaining why.
 *   5. Never overwrites an entry that's already configured for that
 *      employer/slug - re-running on the same list is safe.
 *
 * Input format - a text file, one employer per line, tab/comma/pipe
 * separated name and URL (name is optional - falls back to the hostname):
 *
 *   Dyson, https://dyson.wd3.myworkdayjobs.com/dyson_careers
 *   https://boards.greenhouse.io/somecompany
 *   # lines starting with # are ignored
 *
 * Usage:
 *   node scripts/bulk-add-employers.js employers.txt
 *   node scripts/bulk-add-employers.js employers.txt --dry-run   (report only, don't write config)
 * ---------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const { classifyUrl, extractIdentifier } = require('./ats-signatures');

const CONFIG_PATH = path.join(__dirname, '..', 'sources.config.json');

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = trimmed.split(/\t|\||,(?=\s*https?:\/\/)/).map(s => s.trim()).filter(Boolean);
  let name, url;
  if (parts.length >= 2) {
    [name, url] = parts;
  } else {
    url = parts[0];
  }
  if (!/^https?:\/\//i.test(url || '')) return { error: `Not a URL: "${trimmed}"`, line: trimmed };

  if (!name) {
    try { name = new URL(url).hostname.replace(/^www\./, ''); } catch { name = url; }
  }
  return { name, url };
}

function ensureArray(obj, ...pathSegs) {
  let cur = obj;
  for (let i = 0; i < pathSegs.length - 1; i++) {
    cur[pathSegs[i]] = cur[pathSegs[i]] || {};
    cur = cur[pathSegs[i]];
  }
  const last = pathSegs[pathSegs.length - 1];
  cur[last] = cur[last] || [];
  return cur[last];
}

function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const dryRun = args.includes('--dry-run');

  if (!filePath) {
    console.error('Usage: node scripts/bulk-add-employers.js <employers.txt> [--dry-run]');
    process.exit(1);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const entries = lines.map(parseLine).filter(Boolean);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const report = [];

  (async () => {
    for (const entry of entries) {
      if (entry.error) {
        report.push({ name: '(unparsed line)', url: entry.line, tier: 'n/a', platform: '-', action: `skipped - ${entry.error}` });
        continue;
      }

      const { name, url } = entry;
      const result = await classifyUrl(url);

      if (result.error) {
        const added = addDirectoryLink(config, name, url, `Could not verify automatically (${result.error}) - the page may be behind bot-protection. Check by hand.`);
        report.push({ name, url, tier: '?', platform: '-', action: `could not check (${result.error}) -> ${added ? 'added as directory link, needs a manual look' : 'already configured'}` });
        continue;
      }

      if (result.tier === 1) {
        const id = extractIdentifier(result.connector, url);
        if (!id) {
          addDirectoryLink(config, name, url, `Detected ${result.platform} but the URL shape was unexpected - add manually to atsConnectors.${result.connector}.`);
          report.push({ name, url, tier: 1, platform: result.platform, action: `matched but could not parse an identifier -> added as directory link` });
          continue;
        }
        const added = addTier1(config, result.connector, name, id);
        report.push({ name, url, tier: 1, platform: result.platform, action: added ? `enabled in atsConnectors.${result.connector}` : 'already configured (no change)' });
        continue;
      }

      if (result.tier === 2 && result.connector === 'workday') {
        const id = extractIdentifier('workday', url);
        if (!id) {
          addDirectoryLink(config, name, url, 'Detected Workday but the URL shape was unexpected - add manually to grayAreaConnectors.workday.');
          report.push({ name, url, tier: 2, platform: 'Workday', action: 'matched but could not parse tenant/site -> added as directory link' });
          continue;
        }
        const added = addWorkday(config, name, id);
        report.push({ name, url, tier: 2, platform: 'Workday', action: added ? 'added to grayAreaConnectors.workday, DISABLED pending your terms check' : 'already configured (no change)' });
        continue;
      }

      if (result.tier === 2) {
        const added = addDirectoryLink(config, name, url, `Runs ${result.platform} - no connector built for this platform yet. Build one following the Workday connector's pattern if you want to pursue it, after checking this employer's terms.`);
        report.push({ name, url, tier: 2, platform: result.platform, action: added ? `no connector built yet for ${result.platform} -> added as directory link` : 'already configured (no change)' });
        continue;
      }

      const added = addDirectoryLink(config, name, url, 'No known ATS signature found.');
      report.push({ name, url, tier: 3, platform: '-', action: added ? 'no known ATS found -> added as directory link' : 'already configured (no change)' });
    }

    printReport(report);

    if (dryRun) {
      console.log('\n--dry-run set: sources.config.json was NOT modified.');
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
      console.log(`\nWrote changes to ${path.relative(process.cwd(), CONFIG_PATH)}.`);
      console.log('Tier 1 entries are enabled and will be fetched on the next run of fetch-data.js.');
      console.log('Tier 2 (Workday) entries were added but left DISABLED - see the README before flipping confirmedTermsChecked.');
    }
  })();
}

function addTier1(config, connector, employer, identifier) {
  const list = ensureArray(config, 'atsConnectors', connector);
  const idField = { greenhouse: 'boardToken', lever: 'company', workable: 'accountSlug', smartrecruiters: 'companyId' }[connector];
  if (list.some(e => e[idField] === identifier)) return false; // already configured
  list.push({ employer, [idField]: identifier, enabled: true });
  return true;
}

function addWorkday(config, employer, { hostname, tenant, site }) {
  const list = ensureArray(config, 'grayAreaConnectors', 'workday');
  if (list.some(e => e.hostname === hostname && e.site === site)) return false; // already configured
  list.push({
    employer,
    hostname,
    tenant,
    site,
    searchText: '',
    confirmedTermsChecked: false,
    _note: `Added by bulk-add-employers.js. Check ${employer}'s own site terms of use before flipping confirmedTermsChecked to true.`,
  });
  return true;
}

function addDirectoryLink(config, employer, url, note) {
  const list = ensureArray(config, 'directoryLinks', 'employers');
  if (list.some(e => e.url === url)) return false; // already configured
  list.push({ employer, programme: 'View apprenticeships', url, _note: note });
  return true;
}

function printReport(report) {
  console.log(`\nChecked ${report.length} employer(s):\n`);
  for (const r of report) {
    console.log(`${r.name}\n  ${r.url || ''}\n  Tier ${r.tier}${r.platform && r.platform !== '-' ? ` (${r.platform})` : ''} -> ${r.action}\n`);
  }
}

main();
