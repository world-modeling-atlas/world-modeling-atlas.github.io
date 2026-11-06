(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pageLink = (id, anchor) => `#/article/${id}${anchor ? '@' + anchor : ''}`;
const STATUS = {draft: 'Draft', outline: 'Outline', index: 'Index', stub: 'Stub'};
const SITE = 'Atlas of World Modeling in the Brain';
const main = $('#main'), sidebar = $('#sidebar'), nav = $('#atlas-nav'), searchInput = $('#global-search');
let pages = {}, groups = {}, groupList = [], chapters = [], searchPromise = null, renderToken = 0, lastArticle = null;
const expanded = new Set();   // nav nodes the reader has open

// ---- the catalog -------------------------------------------------------------------------------
const groupOf = p => groups[p.group];
const chapterOf = g => chapters.find(c => c.id === g.chapter);
const sectionsOf = g => g.landing ? pages[g.landing].children : g.roots;
const landingHref = g => g.landing ? pageLink(g.landing) : `#/group/${g.id}`;
function ancestorsOf(p) {
  const out = [];
  for (let q = p; q.parent; q = pages[q.parent]) out.unshift(pages[q.parent]);
  return out;
}
const subtreeOf = id => [id, ...pages[id].children.flatMap(subtreeOf)];

// ---- navigation ----------------------------------------------------------------------------------
function navTree() {
  const pageNode = id => ({kind: 'page', key: 'p:' + id, title: pages[id].title, href: pageLink(id), uc: !!pages[id].construction, kids: pages[id].children.map(pageNode)});
  const groupNode = g => ({kind: 'group', key: 'g:' + g.id, title: g.title, href: landingHref(g), uc: !!g.construction, kids: sectionsOf(g).map(pageNode)});
  return chapters.map(c => c.groups.length === 1
    ? groupNode(groups[c.groups[0]])
    : {kind: 'chapter', key: 'c:' + c.id, title: c.title, href: `#/chapter/${c.id}`, kids: c.groups.map(g => groupNode(groups[g]))});
}
// Keys of the nav nodes from the chapter down to this page.
function pathKeys(p) {
  const g = groupOf(p), c = chapterOf(g), keys = [];
  if (c.groups.length > 1) keys.push('c:' + c.id);
  keys.push('g:' + g.id);
  for (const a of ancestorsOf(p)) if (a.id !== g.landing) keys.push('p:' + a.id);
  if (p.id !== g.landing) keys.push('p:' + p.id);
  return keys;
}
function navNode(n, depth, current, parentUc = false) {
  const open = expanded.has(n.key), has = n.kids.length > 0;
  const toggle = has
    ? `<button type="button" class="nav-toggle" data-key="${esc(n.key)}" aria-expanded="${open}" aria-label="${esc(n.title)}: show sections"></button>`
    : '<span class="nav-spacer"></span>';
  return `<div class="nav-node kind-${n.kind} depth-${Math.min(depth, 4)}${open ? ' open' : ''}"><div class="nav-row">${toggle}` +
    `<a class="nav-link${n.key === current ? ' current' : ''}" href="${esc(n.href)}">${esc(n.title)}${n.uc && !parentUc ? ucTag : ''}</a></div>` +
    (has ? `<div class="nav-kids"${open ? '' : ' hidden'}>${n.kids.map(k => navNode(k, depth + 1, current, n.uc || parentUc)).join('')}</div>` : '') + '</div>';
}
function navRender(keys = []) {
  const scroll = sidebar.scrollTop;
  keys.forEach(k => expanded.add(k));
  nav.innerHTML = navTree().map(n => navNode(n, 0, keys[keys.length - 1])).join('');
  sidebar.scrollTop = scroll;
  const current = $('.nav-link.current', nav);
  if (current) {
    const box = sidebar.getBoundingClientRect(), at = current.getBoundingClientRect();
    if (at.top < box.top || at.bottom > box.bottom) current.scrollIntoView({block: 'center'});
  }
}
nav.addEventListener('click', e => {
  const b = e.target.closest('.nav-toggle');
  if (!b) return;
  const open = b.getAttribute('aria-expanded') === 'true';
  open ? expanded.delete(b.dataset.key) : expanded.add(b.dataset.key);
  b.setAttribute('aria-expanded', String(!open));
  b.closest('.nav-node').classList.toggle('open', !open);
  b.closest('.nav-row').nextElementSibling.hidden = open;
});

// ---- shared pieces -----------------------------------------------------------------------------
function tabs(selected = 'atlas') {
  const tab = (id, href, label) => `<a class="${selected === id ? 'active' : ''}" href="${href}">${label}</a>`;
  return `<nav class="page-tabs" aria-label="Site">${tab('about', '#/', 'Home')}${tab('atlas', '#/atlas', 'Atlas')}${tab('export', '#/export', 'Export')}${tab('contribute', '#/contribute', 'Contribute')}</nav>`;
}
function crumbs(trail) {
  return `<div class="breadcrumbs">${trail.map((t, i) => (i ? '<span>/</span>' : '') + (t.href ? `<a href="${esc(t.href)}">${esc(t.title)}</a>` : esc(t.title))).join('')}</div>`;
}
function trailFor(p) {
  const g = groupOf(p), c = chapterOf(g), landing = p.id === g.landing;
  const trail = [{title: 'Atlas', href: '#/atlas'}];
  if (c.groups.length > 1) trail.push({title: c.title, href: `#/chapter/${c.id}`});
  trail.push(landing ? {title: g.title} : {title: g.title, href: landingHref(g)});
  for (const a of ancestorsOf(p)) if (a.id !== g.landing) trail.push({title: a.title, href: pageLink(a.id)});
  if (!landing) trail.push({title: p.title});
  return trail;
}
function sectionList(ids, status = false) {
  return `<ul>${ids.map(id => pages[id]).filter(Boolean).map(p => `<li><a href="${pageLink(p.id)}">${esc(p.title)}</a>` +
    `${status ? `<span class="status">${statusText(p)}</span>` : ''}${status && p.children.length ? sectionList(p.children, true) : ''}</li>`).join('')}</ul>`;
}
const statusText = p => p.construction ? 'Under construction' : STATUS[p.status] || '';
const ucTag = '<span class="uc-tag">Under construction</span>';

// ---- the atlas, chapters and groups ------------------------------------------------------------
function home() {
  navRender();
  document.title = SITE;
  main.innerHTML = `${tabs()}<div class="content-body"><h1 class="page-title">${SITE}</h1><div class="home-index">${chapters.map(c => {
    const gs = c.groups.map(id => groups[id]);
    const body = gs.length === 1 ? sectionList(sectionsOf(gs[0]))
      : gs.map(g => `<h3><a href="${landingHref(g)}">${esc(g.title)}</a>${g.construction ? ucTag : ''}</h3>${sectionList(sectionsOf(g))}`).join('');
    const href = gs.length === 1 ? landingHref(gs[0]) : `#/chapter/${c.id}`;
    const uc = gs.length === 1 && gs[0].construction ? ucTag : '';
    return `<section><h2><span class="chapter-number">${esc(c.number)}</span><a href="${href}">${esc(c.title)}</a>${uc}</h2>${body}</section>`;
  }).join('')}</div></div>`;
}
function chapterPage(id) {
  const c = chapters.find(x => x.id === id);
  if (!c) return notFound();
  if (c.groups.length === 1) return location.replace(landingHref(groups[c.groups[0]]));
  navRender(['c:' + c.id]);
  document.title = `${c.title} – ${SITE}`;
  main.innerHTML = `${tabs()}<div class="content-body">${crumbs([{title: 'Atlas', href: '#/atlas'}, {title: c.title}])}<h1 class="page-title">${esc(c.title)}</h1>` +
    `<p class="lead">${esc(c.description)}</p>${c.groups.map(gid => {
      const g = groups[gid];
      return `<section class="group-summary"><h2><a href="${landingHref(g)}">${esc(g.title)}</a></h2><p>${esc(g.description)}</p>${sectionList(sectionsOf(g))}</section>`;
    }).join('')}</div>`;
}
function groupPage(id) {
  const g = groups[id];
  if (!g) return notFound();
  if (g.landing) return location.replace(pageLink(g.landing));
  const c = chapterOf(g);
  navRender([...(c.groups.length > 1 ? ['c:' + c.id] : []), 'g:' + g.id]);
  document.title = `${g.title} – ${SITE}`;
  const trail = [{title: 'Atlas', href: '#/atlas'}, ...(c.groups.length > 1 ? [{title: c.title, href: `#/chapter/${c.id}`}] : []), {title: g.title}];
  main.innerHTML = `${tabs()}<div class="content-body">${crumbs(trail)}<h1 class="page-title">${esc(g.title)}</h1><p class="lead">${esc(g.description)}</p>` +
    `<div class="group-list">${sectionList(g.roots, true)}</div></div>`;
}

// ---- an article --------------------------------------------------------------------------------
function refHTML(p, prefix = '') {
  if (!p.references.length) return '';
  return `<section class="references" id="${prefix}references"><h2>References</h2>${p.references.map((r, i) => {
    const record = p.referenceDetails?.[i];
    const authors = record?.authors?.length ? `${esc(record.authors.join(', '))}. ` : '<span class="missing-authors">Authors unavailable. </span>';
    const year = record?.year ? `(${esc(record.year)}). ` : '';
    const journal = record?.journal ? ` <i>${esc(record.journal)}</i>.` : '';
    const url = record?.doi ? 'https://doi.org/' + encodeURIComponent(record.doi).replaceAll('%2F', '/') : record?.url || 'https://scholar.google.com/scholar?q=' + encodeURIComponent(r);
    return `<div class="reference" id="${prefix}ref-${i + 1}"><span>${i + 1}.</span><div>${authors}${year}<a href="${esc(url)}" target="_blank" rel="noopener">${esc(r)}</a>.${journal}</div></div>`;
  }).join('')}</section>`;
}
async function loadPage(id) {
  const r = await fetch(`data/${id}.json`, {cache: 'no-cache'});
  if (!r.ok) throw new Error(`Unable to load ${id}`);
  return r.json();
}
async function article(id, token) {
  const meta = pages[id];
  if (!meta) return notFound();
  navRender(pathKeys(meta));
  main.innerHTML = `${tabs()}<p class="loading">Loading…</p>`;
  let p;
  try { p = await loadPage(id); }
  catch { if (token === renderToken) main.innerHTML = `${tabs()}<p>Unable to load this section.</p>`; return; }
  if (token !== renderToken) return;
  lastArticle = id;
  document.title = `${p.title} – ${SITE}`;
  const kids = p.children.map(c => pages[c]).filter(Boolean);
  const sections = kids.length
    ? `<section class="subpages" id="subpages"><h2>Sections</h2>${kids.map(q => `<a class="subpage-link" href="${pageLink(q.id)}">${esc(q.title)}<small>${statusText(q)}</small></a>`).join('')}</section>` : '';
  const related = p.seeAlso?.length
    ? `<section class="see-also" id="see-also"><h2>See also</h2><ul>${p.seeAlso.map(r => pages[r]).filter(Boolean).map(q =>
      `<li><a href="${pageLink(q.id)}">${esc(q.title)}</a><small>${esc(q.context.slice(0, -1).join(' › '))}</small></li>`).join('')}</ul></section>` : '';
  const toc = p.toc.map(t => `<a class="${t.level === 3 ? 'toc-sub' : ''}" href="#" data-anchor="${esc(t.id)}">${esc(t.title)}</a>`).join('');
  const meta2 = [statusText(p), p.references.length ? p.references.length + ' references' : ''].filter(Boolean).join(' · ');
  main.innerHTML = `${tabs()}<div class="article-layout"><article class="article-main">${crumbs(trailFor(p))}` +
    `<header class="article-header"><h1 class="page-title">${esc(p.title)}</h1><div class="article-meta">${meta2}</div></header>` +
    (p.construction ? '<p class="uc-note">This section is under construction. Its content is incomplete (perhaps only future citations / interesting-looking papers) and may change substantially.</p>' : '') +
    `<div class="article-body">${p.html || (!kids.length && !p.references.length ? '<p class="empty-page">In progress.</p>' : '')}</div>${sections}${related}${refHTML(p)}</article>` +
    `<aside class="article-aside"><div class="aside-title">Contents</div><div class="toc">${toc}` +
    `${kids.length ? '<a href="#" data-scroll="subpages">Sections</a>' : ''}${related ? '<a href="#" data-scroll="see-also">See also</a>' : ''}` +
    `${p.references.length ? '<a href="#" data-scroll="references">References</a>' : ''}</div></aside></div>`;
}

// ---- about, export, search ---------------------------------------------------------------------
let homeFigure;
function loadHomeFigure() {
  homeFigure ||= Promise.all([
    fetch('assets/home-overview.svg').then(r => r.ok ? r.text() : '').catch(() => ''),
    fetch('assets/world/credits.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
  homeFigure.then(([svg, credits]) => {
    const el = $('#home-figure');
    if (!el) return;
    if (!svg) { el.remove(); return; }
    const labels = {egocentric: 'First-person view', hearing: 'Hearing', touch: 'Touch', proprioception: 'Proprioception', interoception: 'Interoception'};
    const credit = Object.entries(credits).map(([k, c]) => `${esc(labels[k] || k)}: <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.artist.replace(/^https?:\/\/\S+\s*/, '').replace(/^username:/, ''))}</a>, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" target="_blank" rel="noopener">${esc(c.license)}</a>` : esc(c.license)}`).join('; ');
    el.innerHTML = svg + '<a class="home-figure-full" href="assets/home-overview.svg" target="_blank" rel="noopener">Open the figure full size</a>' +
      (credit ? `<p class="home-figure-credit">Photographs from Wikimedia Commons (artist, licence). ${credit}.</p>` : '');
  });
}
// Chapter figures shown under the overview on the Home page, in atlas order (drawn by scripts/fig_*.py).
const CHAPTER_FIGURES = [
  ['fig-fundamentals', 'The Fundamentals'],
  ['fig-architecture', 'Systems-Level Architecture and Dynamics'],
  ['fig-development', 'Data and Skill Progression'],
  ['fig-theories', 'Theories of Cognitive Development'],
];
const chapterFigures = {};
function loadChapterFigures() {
  for (const [name] of CHAPTER_FIGURES) {
    chapterFigures[name] ||= fetch(`assets/${name}.svg`).then(r => r.ok ? r.text() : '').catch(() => '');
    chapterFigures[name].then(svg => {
      const el = document.getElementById(name);
      if (!el) return;
      if (!svg) { el.remove(); return; }
      el.innerHTML = svg + `<a class="home-figure-full" href="assets/${name}.svg" target="_blank" rel="noopener">Open the figure full size</a>`;
    });
  }
}
function about() {
  navRender();
  document.title = SITE;
  const fig = ([name, title]) => `<figure class="home-figure" id="${name}" aria-label="${esc(title)}"></figure>`;
  const overview = '<figure class="home-figure" id="home-figure" aria-label="Objectives and Optimization Architecture"></figure>';
  // Fundamentals and Architecture first, then the overview (objectives and optimization), then the rest.
  const chapters = CHAPTER_FIGURES.slice(0, 2).map(fig).join('') + overview + CHAPTER_FIGURES.slice(2).map(fig).join('');
  main.innerHTML = `${tabs('about')}<div class="content-body"><p class="home-intro">This is a live document that describes the brain as an ML system. It is a work in progress, but much of its content is complete (especially the <a href="#/chapter/learning">Learning</a> section, which is likely the most interesting and far-reaching of all).</p>${chapters}<p class="placeholder">[Placeholder: guide readers through how to read these notes.]</p><p class="placeholder">[Placeholder: describe the methodology.]</p></div>`;
  loadHomeFigure();
  loadChapterFigures();
}
function contribute() {
  navRender();
  document.title = `Contribute – ${SITE}`;
  main.innerHTML = `${tabs('contribute')}<div class="content-body"><p>Coming soon!</p></div>`;
}
function exportPage() {
  navRender();
  document.title = `Export – ${SITE}`;
  const depth = p => ancestorsOf(p).length;
  const options = groupList.map(g => `<optgroup label="${esc(g.title)}">${g.pages.map(id => pages[id]).filter(Boolean).map(p =>
    `<option value="${esc(p.id)}" ${p.id === lastArticle ? 'selected' : ''}>${' '.repeat(depth(p))}${esc(p.title)}</option>`).join('')}</optgroup>`).join('');
  main.innerHTML = `${tabs('export')}<div class="content-body"><div class="export-controls"><div><label for="export-choice">Section</label>` +
    `<select id="export-choice"><option value="all" ${lastArticle ? '' : 'selected'}>Entire atlas</option>${options}</select></div>` +
    `<label class="export-option"><input type="checkbox" id="export-children" checked> Include subsections</label>` +
    `<button type="button" id="download-html">Download HTML</button><button type="button" id="print-export">Print / PDF</button></div><p class="export-status" aria-live="polite"></p></div>`;
  $('#download-html').addEventListener('click', () => exportAtlas(false));
  $('#print-export').addEventListener('click', () => exportAtlas(true));
}
const dataUrl = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
async function exportAtlas(print) {
  const choice = $('#export-choice').value, withKids = $('#export-children').checked;
  const status = $('.export-status'), buttons = [...document.querySelectorAll('.export-controls button')];
  let win = null;
  if (print) {
    win = window.open('', '_blank');
    if (!win) { status.textContent = 'Allow pop-ups to open the print view.'; return; }
    win.document.write('<title>Export</title><p>Preparing…</p>');
  }
  buttons.forEach(b => b.disabled = true);
  status.textContent = 'Preparing…';
  try {
    const ids = choice === 'all' ? groupList.flatMap(g => g.pages) : withKids ? subtreeOf(choice) : [choice];
    const out = new Array(ids.length);
    let next = 0;
    await Promise.all(Array.from({length: Math.min(8, ids.length)}, async () => { while (next < ids.length) { const n = next++; out[n] = await loadPage(ids[n]); } }));
    const exported = new Set(ids), images = {};
    const sources = [...new Set(out.flatMap(p => [...p.html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1])))];
    await Promise.all(sources.map(async src => {
      const res = await fetch(src);
      if (!res.ok) throw Error('Figure unavailable');
      images[src] = await dataUrl(await res.blob());
    }));
    const body = out.map((p, n) => {
      const prefix = `s${n}-`, fragment = document.createElement('div');
      fragment.innerHTML = p.html || '';
      fragment.querySelectorAll('[id]').forEach(el => el.id = prefix + el.id);
      fragment.querySelectorAll('img').forEach(img => { img.src = images[img.getAttribute('src')] || img.src; });
      fragment.querySelectorAll('a.figure-image').forEach(a => a.removeAttribute('href'));
      fragment.querySelectorAll('a[href^="#"]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href.startsWith('#/')) return a.setAttribute('href', '#' + prefix + href.slice(1));
        const target = href.startsWith('#/article/') ? href.slice(10).split('@')[0] : '';
        if (exported.has(target)) a.setAttribute('href', '#section-' + target.replaceAll('/', '-'));
        else a.replaceWith(...a.childNodes);
      });
      return `<section id="section-${esc(p.id.replaceAll('/', '-'))}"><h1>${esc(p.title)}</h1><p>${esc(statusText(p))}</p>${fragment.innerHTML}${refHTML(p, prefix)}</section>`;
    }).join('');
    const title = choice === 'all' ? SITE : pages[choice].title;
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:16px/1.7 Georgia,serif;color:#202122;max-width:850px;margin:2em auto;padding:0 1em}h1,h2{border-bottom:1px solid #aaa}section{break-before:page}section:first-child{break-before:auto}figure{max-width:560px;margin:2em 0;}.figure-row{display:flex;gap:12px;align-items:flex-start;margin:2em 0}.figure-row figure{flex:1 1 0;margin:0;max-width:none}figure{padding:8px;border:1px solid #aaa;break-inside:avoid}figure img{max-width:100%}figcaption{font:12px/1.5 Arial,sans-serif}.source-caption{margin:6px 0;color:#444}.hatnote{font-style:italic;font-size:14px}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #aaa;padding:6px}.reference{display:flex;gap:8px}a{color:#202122}</style></head><body>${body}</body></html>`;
    if (print) {
      win.document.open(); win.document.write(doc); win.document.close(); win.focus();
      let printed = false;
      const startPrint = () => { if (!printed) { printed = true; win.print(); } };
      win.onload = startPrint;
      if (win.document.readyState === 'complete') startPrint();
    } else {
      const url = URL.createObjectURL(new Blob([doc], {type: 'text/html;charset=utf-8'}));
      const a = document.createElement('a');
      a.href = url;
      a.download = (choice === 'all' ? 'world-modeling-atlas' : choice.split('/').pop()) + '.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    status.textContent = 'Ready.';
  } catch (e) {
    if (win) win.close();
    status.textContent = 'Export failed. Please try again.';
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

const ALIASES = [['pfc', 'prefrontal', 'prefrontal cortex'], ['bg', 'basal ganglia', 'basalganglia'], ['hpc', 'hippocampus', 'hippocampal'], ['btsp', 'behavioral timescale', 'behavioural timescale'], ['rl', 'reinforcement learning'], ['rpe', 'reward prediction error'], ['wm', 'working memory'], ['ach', 'acetylcholine'], ['ne', 'norepinephrine', 'noradrenaline'], ['cortex', 'cortical'], ['neurons', 'neuron', 'neuronal'], ['synapse', 'synaptic', 'synapses'], ['cerebellum', 'cerebellar']];
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'with', 'from', 'by', 'how', 'what', 'is', 'are']);
const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
function termOptions(term) {
  const opts = new Set([term]);
  for (const set of ALIASES) if (set.includes(term)) set.forEach(s => opts.add(s));
  return [...opts];
}
function fieldMatches(field, option) {
  if (option.includes(' ')) return field.includes(option);
  return new RegExp('(?:^| )' + option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (option.length >= 5 ? '[a-z]*' : '') + '(?: |$)').test(field);
}
async function getSearch() {
  if (!searchPromise) searchPromise = fetch('data/search.json').then(r => { if (!r.ok) throw Error(); return r.json(); })
    .then(data => data.map(x => ({...x, nTitle: norm(x.title), nText: norm(x.text), nRefs: norm(x.references.join(' '))})));
  return searchPromise;
}
function matchResults(data, query) {
  const phrase = norm(query);
  const expanded = phrase.replace(/\bprefrontal cortex\b/g, 'pfc').replace(/\bbasal ganglia\b/g, 'bg').replace(/\bworking memory\b/g, 'wm').replace(/\breward prediction error\b/g, 'rpe').replace(/\breinforcement learning\b/g, 'rl');
  let terms = expanded.split(' ').filter(t => t && !STOP.has(t));
  if (!terms.length) terms = phrase.split(' ').filter(Boolean);
  if (!terms.length) return [];
  return data.map(x => {
    let score = 0;
    for (const term of terms) {
      const matches = termOptions(term);
      const inTitle = matches.some(a => fieldMatches(x.nTitle, a)), inBody = matches.some(a => fieldMatches(x.nText, a)), inRefs = matches.some(a => fieldMatches(x.nRefs, a));
      if (!inTitle && !inBody && !inRefs) return null;
      score += inTitle ? 30 : inBody ? 5 : 2;
      if (inBody) {
        const match = matches.find(a => fieldMatches(x.nText, a));
        if (match && match.length > 2) {
          let at = -1, count = 0;
          while (count < 16 && (at = x.nText.indexOf(match, at + 1)) !== -1) count++;
          score += Math.min(4, Math.floor(Math.log2(count + 1)));
        }
      }
    }
    if (x.nTitle === phrase) score += 150; else if (x.nTitle.includes(phrase)) score += 75; else if (x.nText.includes(phrase)) score += 10;
    const needle = termOptions(terms[0]).find(a => x.text.toLowerCase().includes(a)) || terms[0], pos = x.text.toLowerCase().indexOf(needle);
    const snip = pos >= 0 ? x.text.slice(Math.max(0, pos - 85), pos + 165) : x.references.find(r => termOptions(terms[0]).some(a => r.toLowerCase().includes(a))) || '';
    return {item: x, score, snip};
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
}
async function searchPage(query, token) {
  navRender();
  searchInput.value = query;
  document.title = `Search – ${SITE}`;
  main.innerHTML = `${tabs()}<div class="content-body"><h1 class="page-title">Search</h1><p>Searching…</p></div>`;
  try {
    const data = await getSearch();
    if (token !== renderToken) return;
    const results = matchResults(data, query);
    main.innerHTML = `${tabs()}<div class="content-body"><h1 class="page-title">Search</h1><p class="results-count">${results.length} results for “${esc(query)}”</p>` +
      results.slice(0, 60).map(({item, snip}) => `<article class="search-result"><h2><a href="${pageLink(item.id)}">${esc(item.title)}</a></h2>` +
        `<div class="result-group">${esc((item.context || []).join(' › '))}</div><p>${snip ? '…' + esc(snip) + '…' : ''}</p></article>`).join('') + '</div>';
  } catch { if (token === renderToken) main.innerHTML = `${tabs()}<p>Unable to load search.</p>`; }
}
function notFound() { main.innerHTML = `${tabs()}<h1 class="page-title">Not found</h1>`; }

// ---- routing -----------------------------------------------------------------------------------
function scrollToAnchor(id) {
  const target = document.getElementById(id);
  if (!target) return false;
  for (let d = target.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
  target.scrollIntoView({behavior: 'smooth', block: 'start'});
  return true;
}
async function router() {
  const token = ++renderToken, route = location.hash.replace(/^#\/?/, '');
  let anchor = '';
  if (route.startsWith('article/')) {
    const [id, a] = decodeURI(route.slice(8)).split('@');
    anchor = a || '';
    await article(id, token);
  } else if (route.startsWith('chapter/')) chapterPage(decodeURI(route.slice(8)));
  else if (route.startsWith('group/')) groupPage(decodeURI(route.slice(6)));
  else if (route === '' || route === 'about' || route === 'methodology') about();
  else if (route === 'export') exportPage();
  else if (route.startsWith('search/')) await searchPage(decodeURIComponent(route.slice(7)), token);
  else if (route === 'contribute') contribute();
  else if (route === 'atlas') home();
  else about();
  if (token !== renderToken) return;
  if (anchor) requestAnimationFrame(() => scrollToAnchor(anchor)); else window.scrollTo(0, 0);
  sidebar.classList.remove('open');
  $('.mobile-scrim').hidden = true;
  $('.menu-button').setAttribute('aria-expanded', 'false');
}
$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  const path = '#/search/' + encodeURIComponent(q);
  if (location.hash === path) router(); else location.hash = path;
});
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInput.focus(); } });
$('.menu-button').addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  $('.mobile-scrim').hidden = !open;
  $('.menu-button').setAttribute('aria-expanded', String(open));
});
$('.mobile-scrim').addEventListener('click', () => $('.menu-button').click());
document.addEventListener('click', e => {
  const jump = e.target.closest('[data-anchor], [data-scroll]');
  if (jump) {
    e.preventDefault();
    scrollToAnchor(jump.dataset.anchor || jump.dataset.scroll);
    return;
  }
  // links to an id within the page (citations, table references); site links start with "#/"
  const local = e.target.closest('a[href^="#"]');
  if (local && !local.getAttribute('href').startsWith('#/')) {
    e.preventDefault();
    scrollToAnchor(decodeURIComponent(local.getAttribute('href').slice(1)));
  }
});
window.addEventListener('hashchange', router);
fetch('data/catalog.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(data => {
  pages = Object.fromEntries(data.pages.map(p => [p.id, p]));
  groupList = data.groups;
  groups = Object.fromEntries(data.groups.map(g => [g.id, g]));
  chapters = data.chapters;
  router();
}).catch(() => main.innerHTML = '<p>Unable to load the atlas.</p>');
})();
