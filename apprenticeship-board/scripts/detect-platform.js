#!/usr/bin/env node
/**
 * detect-platform.js
 * ---------------------------------------------------------------------------
 * Answers "can we add this employer?" for any careers page, without scraping
 * or extracting any vacancy content. It fetches ONE public page (the same
 * request a browser makes when a person visits that URL) and looks at what
 * job-board platform it loads, then tells you which tier that puts it in:
 *
 *   TIER 1 (sanctioned free API - safe to enable immediately)
 *     Greenhouse, Lever, Workable, SmartRecruiters
 *
 *   TIER 2 (gray area - works technically, needs YOU to check that
 *   employer's own site terms before enabling `confirmedTermsChecked`)
 *     Workday, SuccessFactors, Avature, Beamery, Eightfold, Taleo, iCIMS
 *
 *   TIER 3 (nothing detected - add as a plain directory link instead)
 *
 * For checking a whole list of employers at once and having Tier 1/2 hits
 * wired into sources.config.json automatically, use bulk-add-employers.js
 * instead - this script is for a single ad-hoc check.
 *
 * IMPORTANT LIMITATION, found while building this: most big employers' own
 * *marketing* careers pages (careers.company.com) sit behind bot-protection
 * (Cloudflare/Akamai) that 403s a plain server-side fetch outright - even
 * with a browser User-Agent. That's the protection working as intended, and
 * this script won't try to defeat it. The underlying ATS itself is usually
 * on a separate, unprotected subdomain (e.g. Workday's
 * *.myworkdayjobs.com, Greenhouse's boards.greenhouse.io, etc.) that IS
 * reachable - you just can't discover it by fetching the marketing page
 * server-side. To find it: open the employer's "Apprenticeships" or
 * "Apply" page in a normal browser and copy the URL you land on (or check
 * your browser's Network tab for an XHR request) - THAT's the URL to feed
 * this script and, if it's Tier 1, the connectors.
 *
 * Usage:
 *   node scripts/detect-platform.js "https://rollsroyce.wd3.myworkdayjobs.com/Apprentice"
 *   node scripts/detect-platform.js --file employers.txt   (one URL per line)
 * ---------------------------------------------------------------------------
 */

const { classifyUrl } = require('./ats-signatures');

async function main() {
  const args = process.argv.slice(2);
  let urls = [];

  if (args[0] === '--file') {
    const fs = require('fs');
    urls = fs.readFileSync(args[1], 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
  } else {
    urls = args;
  }

  if (!urls.length) {
    console.error('Usage: node scripts/detect-platform.js <url> [<url> ...]\n   or: node scripts/detect-platform.js --file employers.txt');
    process.exit(1);
  }

  for (const url of urls) {
    const result = await classifyUrl(url);
    if (result.error) {
      console.log(`${url}\n  -> could not check (${result.error})\n`);
    } else if (result.tier === 3) {
      console.log(`${url}\n  -> Tier 3: no known ATS found. Add as a Tier 3 directory link.\n`);
    } else {
      console.log(`${url}\n  -> Tier ${result.tier}: ${result.platform}${result.tier === 1 ? ' (safe to enable now in sources.config.json)' : ' (check that employer\'s own site terms before enabling)'}\n`);
    }
  }
}

main();
