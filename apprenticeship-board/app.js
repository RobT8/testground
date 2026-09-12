/**
 * app.js - renders the apprenticeship board from data/vacancies.json.
 * No build step, no framework, no server required - open index.html or
 * host the folder as a static site (e.g. GitHub Pages) for free.
 */

const state = {
  all: [],
  filtered: [],
};

const els = {
  updatedLine: document.getElementById('updated-line'),
  stats: document.getElementById('stats'),
  search: document.getElementById('search'),
  sector: document.getElementById('sector'),
  location: document.getElementById('location'),
  level: document.getElementById('level'),
  sort: document.getElementById('sort'),
  results: document.getElementById('results'),
  emptyState: document.getElementById('empty-state'),
};

async function load() {
  try {
    const res = await fetch('data/vacancies.json', { cache: 'no-store' });
    const data = await res.json();
    state.all = data.vacancies || [];
    renderUpdatedLine(data);
    populateFilterOptions(state.all);
    applyFilters();
  } catch (err) {
    els.updatedLine.textContent = 'Could not load vacancy data.';
    console.error(err);
  }
}

function renderUpdatedLine(data) {
  const when = data.generatedAt ? new Date(data.generatedAt).toLocaleString('en-GB') : 'unknown time';
  const sourceNote = data.source === 'sample-data'
    ? ' (showing sample data - run scripts/fetch-data.js with a free API key for live vacancies)'
    : '';
  els.updatedLine.textContent = `Last updated: ${when} · ${data.vacancies?.length ?? 0} vacancies${sourceNote}`;
}

function populateFilterOptions(vacancies) {
  fillSelect(els.sector, uniqueSorted(vacancies.map(v => v.sector)));
  fillSelect(els.location, uniqueSorted(vacancies.map(v => v.town)));
  fillSelect(els.level, uniqueSorted(vacancies.map(v => v.level)));
}

function uniqueSorted(list) {
  return [...new Set(list.filter(Boolean))].sort();
}

function fillSelect(select, values) {
  const current = select.value;
  select.length = 1; // keep the "All …" option
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  select.value = current;
}

function applyFilters() {
  const q = els.search.value.trim().toLowerCase();
  const sector = els.sector.value;
  const location = els.location.value;
  const level = els.level.value;

  let list = state.all.filter(v => {
    if (sector && v.sector !== sector) return false;
    if (location && v.town !== location) return false;
    if (level && v.level !== level) return false;
    if (q) {
      const haystack = `${v.title} ${v.employerName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  list = sortVacancies(list, els.sort.value);
  state.filtered = list;
  renderStats(list);
  renderResults(list);
}

function sortVacancies(list, mode) {
  const copy = [...list];
  if (mode === 'newest') {
    copy.sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
  } else if (mode === 'wage-desc') {
    copy.sort((a, b) => (b.wageAmount || 0) - (a.wageAmount || 0));
  } else {
    copy.sort((a, b) => new Date(a.closingDate || Infinity) - new Date(b.closingDate || Infinity));
  }
  return copy;
}

function renderStats(list) {
  const sectors = new Set(list.map(v => v.sector)).size;
  const locations = new Set(list.map(v => v.town)).size;
  const avgWage = Math.round(
    list.filter(v => v.wageAmount).reduce((sum, v) => sum + v.wageAmount, 0) /
    (list.filter(v => v.wageAmount).length || 1)
  );

  els.stats.innerHTML = `
    ${statTile(list.length, 'Vacancies shown')}
    ${statTile(sectors, 'Sectors')}
    ${statTile(locations, 'Locations')}
    ${statTile(avgWage ? `£${avgWage.toLocaleString('en-GB')}` : '—', 'Avg. wage')}
  `;
}

function statTile(num, label) {
  return `<div class="stat-tile"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

function renderResults(list) {
  els.emptyState.hidden = list.length > 0;
  els.results.innerHTML = list.map(cardHtml).join('');
}

function cardHtml(v) {
  const days = daysUntil(v.closingDate);
  let closingClass = '';
  if (days !== null) {
    if (days <= 3) closingClass = 'soon';
    else if (days <= 10) closingClass = 'warn';
  }
  const closingText = v.closingDate
    ? `Closes ${new Date(v.closingDate).toLocaleDateString('en-GB')}${days !== null && days >= 0 ? ` (${days}d left)` : ''}`
    : 'Closing date not stated';

  const wageText = v.wageAmount
    ? `£${Number(v.wageAmount).toLocaleString('en-GB')} ${v.wageUnit || ''}`.trim()
    : 'Wage not stated';

  return `
    <article class="card">
      <h3>${escapeHtml(v.title)}</h3>
      <div class="employer">${escapeHtml(v.employerName)}</div>
      <div class="tags">
        <span class="tag">${escapeHtml(v.level)}</span>
        <span class="tag">${escapeHtml(v.sector)}</span>
      </div>
      <div class="meta">
        <span>📍 ${escapeHtml(v.town)}${v.postcode ? ' · ' + escapeHtml(v.postcode) : ''}</span>
        <span>💷 ${escapeHtml(wageText)}</span>
        <span>⏳ ${escapeHtml(v.duration || 'Duration not stated')}</span>
        <span class="closing ${closingClass}">📅 ${escapeHtml(closingText)}</span>
      </div>
      <a class="apply" href="${escapeAttr(v.vacancyUrl)}" target="_blank" rel="noopener">View & apply</a>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

[els.search, els.sector, els.location, els.level, els.sort].forEach(el => {
  el.addEventListener('input', applyFilters);
  el.addEventListener('change', applyFilters);
});

load();
