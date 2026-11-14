#!/usr/bin/env node
// Builds art/preview.html, a local preview of the CTOad art. No chain or server needed.
//
//   node scripts/preview-art.mjs
//   open art/preview.html
//
// Each layer is stored the way scripts/layer-args.py uploads it (no XML declaration, comments or
// outer <svg>), and stacked the way the CTOad contract's ctoad_svg does, so the preview matches
// what the contract returns. Run it again after changing anything in art/.
//
// It can also preview draft art as PNGs, in a folder laid out like art/ (one subfolder per
// category, 1000×1000 PNGs with transparency). The page is written into that folder:
//
//   node scripts/preview-art.mjs drafts             # writes drafts/preview.html
//   node scripts/preview-art.mjs drafts --watch     # rebuilds whenever a file changes

import { readFileSync, writeFileSync, readdirSync, existsSync, watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(SCRIPT));
const args = process.argv.slice(2);
const WATCH = args.includes('--watch');
const dirArg = args.find((a) => !a.startsWith('--'));
const ART = dirArg ? resolve(dirArg) : join(ROOT, 'art');
const OUT = join(ART, 'preview.html');

if (!existsSync(ART)) {
  console.error(`No folder at ${ART}`);
  process.exit(1);
}

if (WATCH) {
  // Rebuild in a child process on every change, so each build reads the folder fresh.
  const build = () => spawnSync(process.execPath, [SCRIPT, ART], { stdio: 'inherit' });
  build();
  let timer;
  watch(ART, { recursive: true }, (_event, file) => {
    if (!file || file.endsWith('preview.html') || basename(file).startsWith('.')) return;
    clearTimeout(timer);
    timer = setTimeout(() => { console.log(`\n${new Date().toLocaleTimeString()} ${file} changed`); build(); }, 300);
  });
  console.log(`\nWatching ${relative(process.cwd(), ART) || ART}. Refresh the page after a rebuild. Ctrl+C to stop.`);
} else {
  run();
}

function run() {

// Categories in the contract's order, which sets how traits are listed. Must match CATEGORIES in
// contracts/ctoad-nft/src/art.rs.
const CATEGORIES = [
  { key: 'background', label: 'Background' },
  { key: 'body', label: 'Body' },
  { key: 'outfit', label: 'Outfit' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'mouth', label: 'Mouth' },
  { key: 'headwear', label: 'Headwear' },
  { key: 'item', label: 'Item' },
];

// The order layers are stacked in, bottom to top. Must match DRAW_ORDER in
// contracts/ctoad-nft/src/art.rs.
const DRAW_ORDER = ['background', 'body', 'mouth', 'eyes', 'outfit', 'headwear', 'item'];

// Limits from contracts/ctoad-nft/src/art.rs.
const VIEWBOX = '0 0 1000 1000';
const MAX_LAYER_BYTES = 8 * 1024;
const MAX_NAME_LEN = 32;
// Storage costs 1e19 yoctoNEAR per byte, about 0.01 NEAR per KB.
const NEAR_PER_BYTE = 1e-5;

// Same as scripts/layer-args.py.
function strip(svg) {
  const clean = svg.replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>/g, '');
  const m = clean.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/);
  return m ? m[1].trim().replace(/>\s+</g, '><') : null;
}

const viewBoxOf = (svg) => svg.match(/<svg\b[^>]*\bviewBox\s*=\s*"([^"]*)"/)?.[1].trim() ?? null;

// Width, height and whether a PNG can be transparent, from its header.
function pngInfo(buf) {
  if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG') return null;
  const colorType = buf[25];
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    alpha: colorType === 4 || colorType === 6 || buf.includes(Buffer.from('tRNS')),
  };
}

const categories = [];
const warnings = [];
let totalBytes = 0;
let totalLayers = 0;
let pngCount = 0;

for (const cat of CATEGORIES) {
  const dir = join(ART, cat.key);
  const layers = [];
  const all = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
  const files = all.filter((f) => /\.(svg|png)$/i.test(f)).sort();
  for (const f of all) if (!files.includes(f)) warnings.push(`${cat.key}/${f}: not an .svg or .png, so it's skipped.`);
  if (!files.length) warnings.push(`${cat.key}/ has no layers. CTOads will get nothing from ${cat.label}.`);

  files.forEach((file) => {
    const path = `${cat.key}/${file}`;
    if (/\.png$/i.test(file)) {
      const buf = readFileSync(join(dir, file));
      const name = basename(file).replace(/\.png$/i, '');
      const info = pngInfo(buf);
      if (!info) {
        warnings.push(`${path}: not a readable PNG.`);
        return;
      }
      if (info.width !== 1000 || info.height !== 1000) warnings.push(`${path}: ${info.width}×${info.height}, not 1000×1000. It won't line up with the other layers.`);
      if (!info.alpha && cat.key !== 'background') warnings.push(`${path}: no transparency. It will cover every layer under it.`);
      if (Buffer.byteLength(name, 'utf8') > MAX_NAME_LEN) warnings.push(`${path}: name is over ${MAX_NAME_LEN} bytes. The upload would fail.`);
      const svg = `<image width="1000" height="1000" href="data:image/png;base64,${buf.toString('base64')}"/>`;
      totalBytes += buf.length;
      totalLayers += 1;
      pngCount += 1;
      layers.push({ index: layers.length, name, svg, bytes: buf.length, png: true });
      return;
    }
    const raw = readFileSync(join(dir, file), 'utf8');
    const name = basename(file, '.svg');
    const svg = strip(raw);
    if (svg === null) {
      warnings.push(`${path}: no <svg> element. The upload would fail.`);
      return;
    }
    const bytes = Buffer.byteLength(svg, 'utf8');
    const vb = viewBoxOf(raw);
    if (vb !== VIEWBOX) warnings.push(`${path}: viewBox is ${vb ? `"${vb}"` : 'missing'}, not "${VIEWBOX}". It won't line up with the other layers.`);
    if (!svg) warnings.push(`${path}: empty after stripping. The contract rejects empty layers; use <g/> for "none".`);
    if (bytes > MAX_LAYER_BYTES) warnings.push(`${path}: ${bytes} bytes, over the ${MAX_LAYER_BYTES}-byte limit. The upload would fail.`);
    if (Buffer.byteLength(name, 'utf8') > MAX_NAME_LEN) warnings.push(`${path}: name is over ${MAX_NAME_LEN} bytes. The upload would fail.`);
    if (/<image\b/.test(svg)) warnings.push(`${path}: has an <image>. Use flat shapes only.`);
    const fonts = [...svg.matchAll(/font-family\s*[:=]\s*["']?([^"';>]*)/g)].map((m) => m[1].trim());
    if (fonts.some((f) => !/^(sans-serif|serif|monospace|cursive|fantasy)$/.test(f))) warnings.push(`${path}: uses a font that isn't generic. Use sans-serif, serif or monospace.`);
    if (/\b(id|href)\s*=/.test(svg)) warnings.push(`${path}: uses id or href. Ids can clash when layers are stacked into one SVG.`);
    totalBytes += bytes;
    totalLayers += 1;
    layers.push({ index: layers.length, name, svg, bytes });
  });
  categories.push({ ...cat, layers });
}

const data = {
  generatedAt: new Date().toISOString(),
  totalLayers,
  totalBytes,
  maxBytes: MAX_LAYER_BYTES,
  nearPerByte: NEAR_PER_BYTE,
  draft: pngCount > 0,
  drawOrder: DRAW_ORDER,
  folder: basename(ART),
  warnings,
  categories,
};
const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTOads art preview${pngCount ? ' (PNG drafts)' : ''}</title>
<style>
  :root { --bg:#14101c; --panel:#1f1a2b; --line:#332b45; --fg:#ece9f2; --mut:#9a93ab; --accent:#a6e22e; --warn:#ff7a59; --ok:#5ad17a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  header { padding:16px 22px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { font-size:18px; margin:0; }
  .meta { color:var(--mut); font-size:12px; }
  main { padding:22px; max-width:1280px; margin:0 auto; }
  section { margin-bottom:34px; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--mut); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .checker { background-color:#1a1524; background-image:
      linear-gradient(45deg,#2a2338 25%,transparent 25%), linear-gradient(-45deg,#2a2338 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#2a2338 75%), linear-gradient(-45deg,transparent 75%,#2a2338 75%);
    background-size:24px 24px; background-position:0 0,0 12px,12px -12px,-12px 0; }
  svg { display:block; width:100%; height:auto; }
  .counts { display:flex; gap:10px; flex-wrap:wrap; margin:12px 0; }
  .pill { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:6px 12px; }
  .pill b { color:var(--accent); }
  .warnbox { background:#2a1a16; border:1px solid var(--warn); border-radius:8px; padding:12px 16px; }
  .warnbox ul { margin:8px 0 0; padding-left:20px; }
  .warnbox li { color:#ffd2c4; margin:3px 0; }
  .clean { color:var(--ok); }
  .compose { display:grid; grid-template-columns:380px 1fr; gap:28px; align-items:start; }
  @media (max-width:820px) { .compose { grid-template-columns:1fr; } }
  .stage { border:1px solid var(--line); border-radius:10px; overflow:hidden; max-width:640px; }
  .ctl { display:grid; grid-template-columns:1fr auto; gap:4px 8px; align-items:center; margin:10px 0; }
  .ctl > label:first-child { grid-column:1 / -1; color:var(--mut); font-size:12px; }
  select { width:100%; background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:7px 8px; font:inherit; }
  .lock { display:flex; gap:4px; align-items:center; color:var(--mut); font-size:12px; cursor:pointer; white-space:nowrap; }
  .btns { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
  button { background:var(--accent); color:#14101c; border:0; border-radius:6px; padding:9px 14px; font:inherit; font-weight:600; cursor:pointer; }
  button.alt { background:var(--panel); color:var(--fg); border:1px solid var(--line); }
  .total { color:var(--mut); font-size:12px; margin-top:10px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; }
  .cell { border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--panel); cursor:pointer; }
  .cell:hover { border-color:var(--accent); }
  .cell.on { outline:2px solid var(--accent); }
  .cap { padding:6px 8px; font-size:11px; color:var(--mut); border-top:1px solid var(--line); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cap b { color:var(--fg); }
  .cap .big { color:var(--warn); }
  h3 { font-size:13px; margin:18px 0 8px; }
  .hint { color:var(--mut); font-size:12px; margin:6px 0 12px; }
  .order { display:flex; gap:8px; align-items:center; margin:14px 0 4px; cursor:pointer; }
  .trial { display:none; background:#2a1a16; border:1px solid var(--warn); color:#ffd2c4; border-radius:8px; padding:8px 12px; margin:0 0 12px; font-size:12px; }
  body.hatsunder .trial { display:block; }
  body.hatsunder .stage { outline:3px dashed var(--warn); outline-offset:3px; }
</style>
</head>
<body>
<header>
  <h1>🐸 CTOads art preview${pngCount ? ': ' + basename(ART) + ' (PNG drafts)' : ''}</h1>
  <span class="meta" id="meta"></span>
</header>
<main>
  <section>
    <h2>Checks</h2>
    <div class="counts" id="counts"></div>
    <div id="warnings"></div>
  </section>

  <section>
    <h2>Compositor: stacked like ctoad_svg</h2>
    <div class="trial" id="trial">⚠ Trying hats under the eyes. This is not the contract's order: minted CTOads draw the hat over the eyes unless the contract changes.</div>
    <div class="compose">
      <div>
        <div id="controls"></div>
        <div class="btns">
          <button id="rand">🎲 Randomize</button>
          <button id="dl" class="alt">Download SVG</button>
        </div>
        <div class="total" id="total"></div>
        <label class="order"><input type="checkbox" id="hatsunder"> Try hats under the eyes (not the contract's order)</label>
        <p class="hint">Lock a category to keep it while randomizing the rest. The URL keeps the current pick, so you can bookmark or share it.</p>
      </div>
      <div class="stage checker" id="stage"></div>
    </div>
  </section>

  <section>
    <h2>Random combinations</h2>
    <p class="hint">Click one to open it in the compositor. Locked categories stay fixed here too.</p>
    <div class="btns" style="margin:0 0 12px"><button id="reroll" class="alt">🎲 Reroll grid</button></div>
    <div class="grid" id="randgrid"></div>
  </section>

  <section>
    <h2>Layer browser: every layer alone</h2>
    <p class="hint">Click a layer to put it in the compositor.</p>
    <div id="layers"></div>
  </section>
</main>

<script>
const DATA = ${dataJson};
const CATS = DATA.categories;
const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">';
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) n.append(c);
  return n;
};
const kb = (b) => (b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB');

// Same as ctoad_svg in contracts/ctoad-nft/src/art.rs. pick[i] is a layer index, or -1 for none.
// Draw order, as in the contract. With "hats under the eyes" on, headwear moves below the eyes.
let hatsUnder = false;
function order() {
  const keys = DATA.drawOrder.slice();
  if (hatsUnder) {
    keys.splice(keys.indexOf('headwear'), 1);
    keys.splice(keys.indexOf('eyes'), 0, 'headwear');
  }
  return keys.map((k) => CATS.findIndex((c) => c.key === k));
}
function compose(pick) {
  let svg = SVG_OPEN, drawn = false;
  for (const i of order()) { const c = CATS[i]; if (pick[i] >= 0 && c.layers[pick[i]]) { svg += c.layers[pick[i]].svg; drawn = true; } }
  if (!drawn) svg += '<rect width="1000" height="1000" fill="#121a14"/><text x="500" y="530" font-family="sans-serif" font-size="96" fill="#4ade80" text-anchor="middle">CTOad #0</text>';
  return svg + '</svg>';
}

// ---- checks ----
$('#meta').textContent = 'built ' + new Date(DATA.generatedAt).toLocaleString() + ' · ' + DATA.totalLayers + ' layers · '
  + (DATA.draft ? 'PNG drafts, not uploadable yet' : kb(DATA.totalBytes) + ' · about ' + (DATA.totalBytes * DATA.nearPerByte).toFixed(2) + ' NEAR to upload');
for (const c of CATS) $('#counts').append(el('span', { class: 'pill', html: '<b>' + c.layers.length + '</b> ' + c.label }));
$('#counts').append(el('span', { class: 'pill', html: '<b>' + CATS.reduce((n, c) => n * Math.max(1, c.layers.length), 1).toLocaleString() + '</b> combinations' }));
if (!DATA.warnings.length) {
  $('#warnings').append(el('div', { class: 'clean', text: DATA.draft ? '✓ No issues. Every PNG is 1000×1000 and transparent.' : '✓ No issues. Every layer fits the contract\\'s limits.' }));
} else {
  const ul = el('ul');
  for (const w of DATA.warnings) ul.append(el('li', { text: w }));
  $('#warnings').append(el('div', { class: 'warnbox' }, [el('strong', { text: DATA.warnings.length + ' issue(s):' }), ul]));
}

// ---- state ----
const pick = CATS.map((c) => (c.layers.length ? 0 : -1));
const locked = CATS.map(() => false);
const randIndex = (c) => (c.layers.length ? Math.floor(Math.random() * c.layers.length) : -1);
const randomPick = () => CATS.map((c, i) => (locked[i] ? pick[i] : randIndex(c)));

// URL hash: #body=green&eyes=dead ...
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  hatsUnder = h.get('order') === 'hats-under-eyes';
  CATS.forEach((c, i) => {
    if (!h.has(c.key)) return;
    const v = h.get(c.key);
    pick[i] = v === '' ? -1 : c.layers.findIndex((l) => l.name === v);
  });
}
function writeHash() {
  const h = new URLSearchParams();
  CATS.forEach((c, i) => h.set(c.key, pick[i] >= 0 ? c.layers[pick[i]].name : ''));
  if (hatsUnder) h.set('order', 'hats-under-eyes');
  history.replaceState(null, '', '#' + h.toString());
}

// ---- compositor ----
const selects = [];
CATS.forEach((c, i) => {
  const box = el('div', { class: 'ctl' });
  box.append(el('label', { text: c.label }));
  const s = el('select');
  s.append(el('option', { value: '-1', text: '(none)' }));
  c.layers.forEach((l) => s.append(el('option', { value: String(l.index), text: l.name })));
  s.addEventListener('change', () => { pick[i] = +s.value; render(); });
  const lock = el('label', { class: 'lock' });
  const cb = el('input', { type: 'checkbox' });
  cb.addEventListener('change', () => { locked[i] = cb.checked; });
  lock.append(cb, '🔒');
  box.append(s, lock);
  selects.push(s);
  $('#controls').append(box);
});

function render() {
  selects.forEach((s, i) => { s.value = String(pick[i]); });
  const svg = compose(pick);
  $('#stage').innerHTML = svg;
  const bytes = new Blob([svg]).size;
  $('#total').textContent = DATA.draft ? '' : 'This CTOad\\'s SVG: ' + kb(bytes);
  document.querySelectorAll('#layers .cell').forEach((n) => n.classList.toggle('on', pick[+n.dataset.cat] === +n.dataset.idx));
  writeHash();
}

$('#rand').addEventListener('click', () => { randomPick().forEach((v, i) => { pick[i] = v; }); render(); });
$('#dl').addEventListener('click', () => {
  const name = CATS.map((c, i) => (pick[i] >= 0 ? c.layers[pick[i]].name : null)).filter(Boolean).join('_') || 'ctoad';
  const a = el('a', { href: URL.createObjectURL(new Blob([compose(pick)], { type: 'image/svg+xml' })), download: name + '.svg' });
  document.body.append(a); a.click(); a.remove();
});

// ---- random grid ----
let gridPicks = [];
const GRID_SIZE = 12;
// Deal each category like cards: every layer once, shuffled, before any repeats. Independent
// random picks bunch up (12 picks from 7 bodies usually repeat one 3+ times).
function deal(c) {
  const out = [];
  while (out.length < GRID_SIZE) {
    const deck = c.layers.map((_, j) => j);
    for (let j = deck.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }
    out.push(...deck);
  }
  return out;
}
function reroll() {
  const decks = CATS.map((c, i) => (locked[i] || !c.layers.length ? null : deal(c)));
  gridPicks = Array.from({ length: GRID_SIZE }, (_, n) =>
    CATS.map((c, i) => (decks[i] ? decks[i][n] : locked[i] ? pick[i] : -1)));
  drawGrid();
}
function drawGrid() {
  const grid = $('#randgrid');
  grid.innerHTML = '';
  for (const p of gridPicks) {
    const cap = CATS.map((c, i) => (p[i] >= 0 ? c.layers[p[i]].name : null)).filter(Boolean).join(' · ');
    const cell = el('div', { class: 'cell', title: cap }, [el('div', { html: compose(p) }), el('div', { class: 'cap', text: cap })]);
    cell.addEventListener('click', () => { p.forEach((v, i) => { pick[i] = v; }); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    grid.append(cell);
  }
}
$('#reroll').addEventListener('click', reroll);

// ---- layer browser ----
CATS.forEach((c, i) => {
  if (!c.layers.length) return;
  $('#layers').append(el('h3', { html: c.label + ' <span style="color:var(--mut)">(' + c.layers.length + ')</span>' }));
  const grid = el('div', { class: 'grid' });
  for (const l of c.layers) {
    const size = !l.png && l.bytes > DATA.maxBytes ? '<span class="big">' + kb(l.bytes) + '</span>' : kb(l.bytes);
    const cell = el('div', { class: 'cell', 'data-cat': String(i), 'data-idx': String(l.index) }, [
      el('div', { class: 'checker', html: SVG_OPEN + l.svg + '</svg>' }),
      el('div', { class: 'cap', html: '<b>[' + l.index + '] ' + l.name + '</b> · ' + size }),
    ]);
    cell.addEventListener('click', () => { pick[i] = l.index; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    grid.append(cell);
  }
  $('#layers').append(grid);
});

// ---- order trial ----
const hatsBox = $('#hatsunder');
function applyOrder() {
  hatsBox.checked = hatsUnder;
  document.body.classList.toggle('hatsunder', hatsUnder);
}
hatsBox.addEventListener('change', () => { hatsUnder = hatsBox.checked; applyOrder(); render(); drawGrid(); });

readHash();
applyOrder();
render();
reroll();
</script>
</body>
</html>
`;

writeFileSync(OUT, html);

console.log(`Wrote ${relative(process.cwd(), OUT) || OUT}`);
console.log(pngCount ? `${totalLayers} layers (${pngCount} PNG drafts)` : `${totalLayers} layers · ${(totalBytes / 1024).toFixed(1)} KB · about ${(totalBytes * NEAR_PER_BYTE).toFixed(2)} NEAR to upload`);
for (const c of categories) console.log(`  ${c.label.padEnd(11)} ${c.layers.length}`);
if (warnings.length) {
  console.log(`\n${warnings.length} issue(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
} else {
  console.log('\nNo issues.');
}
}
