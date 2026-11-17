/**
 * Render the README mockups for dsh-context-compaction-meter.
 *
 * The images under `docs/images/` are mockups, not screenshots: this script
 * draws the composer dock and the merged context panel exactly as `client.js`
 * renders them (the CSS below is a verbatim translation of that file's STYLE
 * with the DSH theme tokens resolved to the literal values shipped in
 * `@deepseek-ai/dsh-client-ui-theme`), then asks headless Chrome for a 2x
 * screenshot, crops it to the content box and box-filters it back down.
 *
 * The numbers on screen are the plugin's real arithmetic, not decoration:
 *   capacity 1,000,000  reserved 128,000  headroom 65,536  ratio 0.8
 *   → line = floor(min(1e6 * 0.8, (1e6 - 128000) - 65536)) = 800,000  (80%)
 *   used   412,300 → 41% of the window, 0.515 × line → yellow band
 *
 * Requirements: Node 20+, Google Chrome (or set CHROME_PATH).
 *
 *   node docs/mockups/generate.cjs
 *
 * The HTML scratch files and the 2x renders land in `docs/mockups/.build/`
 * (git-ignored); the final PNGs replace `docs/images/*.png`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, '.build');
const IMAGES = path.join(ROOT, 'docs', 'images');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(IMAGES, { recursive: true });

/* --- Theme tokens, resolved from dsh-client-ui-theme ---------------------- */
const DARK = {
  base: '#151517',
  composer: '#232324',
  composerBorder: '#ffffff14',
  labelPrimary: '#f9fafb',
  labelSecondary: '#cfd3d6',
  labelTertiary: '#adb2b8',
  borderL1: '#ffffff0f',
  borderL3: '#ffffff29',
  hover: '#ffffff14',
  menu: '#303136',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#f25a5a',
  ring: '#ffffff29',
  draft: '#ededed',
  caret: '#ededed',
};
const LIGHT = {
  base: '#ffffff',
  composer: '#ffffff',
  composerBorder: '#0000001f',
  labelPrimary: '#0f1115',
  labelSecondary: '#61666b',
  labelTertiary: '#81858c',
  borderL1: '#0000000a',
  borderL3: '#0000001f',
  hover: '#2631480f',
  menu: '#f8f9fa',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ec1313',
  ring: '#0000001f',
  draft: '#202124',
  caret: '#202124',
};

/* --- Mock data: the plugin's own numbers --------------------------------- */
const CAPACITY = 1_000_000;
const RESERVED = 128_000;
const HEADROOM = 65_536;
const RATIO = 0.8;
const LINE = Math.floor(Math.min(CAPACITY * RATIO, CAPACITY - RESERVED - HEADROOM));
const USED = 412_300;
const PERCENT = Math.round((USED / CAPACITY) * 100);
const BREAKDOWN = { system: 12_400, tools: 48_900, messages: 351_000 };
const HISTORY = [
  { ordinal: 1, threshold: LINE },
  { ordinal: 2, threshold: LINE },
  { ordinal: 3, threshold: LINE },
];

/** Compact token count using K / M, matching client.js `formatTokens`. */
function formatTokens(value) {
  const magnitude = Math.abs(value);
  if (magnitude < 1000) return String(Math.round(magnitude));
  const scaled = (candidate, unit) => {
    const text = candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
    return `${text}${unit}`;
  };
  if (magnitude < 1000000) {
    const k = magnitude / 1000;
    const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
    if (rounded >= 1000) return scaled(magnitude / 1000000, 'M');
    return `${rounded}K`;
  }
  return scaled(magnitude / 1000000, 'M');
}

/** Proximity band of `used` relative to the line, matching client.js `levelOf`. */
function levelOf(used, line) {
  const ratio = used / line;
  if (ratio < 0.5) return 'green';
  if (ratio <= 0.75) return 'yellow';
  return 'red';
}

/** Band colour, matching client.js LEVEL_COLOR. */
function bandColor(T, level) {
  return level === 'green' ? T.success : level === 'yellow' ? T.warn : T.error;
}

const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ring(percent, color, track) {
  const dash = (RING_CIRCUMFERENCE * percent) / 100;
  return `<svg viewBox="0 0 14 14" width="14" height="14" class="ring" aria-hidden="true">`
    + `<circle cx="7" cy="7" r="${RING_RADIUS}" fill="none" stroke="${track}" stroke-width="2"/>`
    + `<circle cx="7" cy="7" r="${RING_RADIUS}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"`
    + ` stroke-dasharray="${dash.toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}" transform="rotate(-90 7 7)"/>`
    + `</svg>`;
}

/** The dock trigger: ring + reading, exactly `client.js`'s markup. */
function trigger(T, percent, color, open) {
  return `<button class="ccm-trigger${open ? ' open' : ''}" style="color:${T.labelTertiary}">`
    + ring(percent, color, T.ring)
    + `<span class="ccm-pct" style="color:${color}">${percent}%</span>`
    + `</button>`;
}

const CHEV = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 6.4 8 10.2l3.8-3.8"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>';
const MIC = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="6" y="1.8" width="4" height="7.2" rx="2"/><path d="M3.8 7.4a4.2 4.2 0 0 0 8.4 0M8 11.6v2.4"/></svg>';
const SEND = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.4V4M4.2 7.6 8 3.8l3.8 3.8"/></svg>';
const INFO = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v4" stroke-linecap="round"/><circle cx="8" cy="5.1" r=".75" fill="currentColor" stroke="none"/></svg>';

/* --- The plugin's stylesheet, tokens inlined ------------------------------ */
function stylesheet(T) {
  return `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:transparent;font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
.page{display:inline-flex;flex-direction:column;align-items:stretch;gap:10px;padding:16px 14px;background:${T.base};}
.panelwrap{position:relative;height:300px;}
.panelwrap .ccm-panel{position:absolute;right:118px;bottom:0;}

.composer{align-self:stretch;background:${T.composer};border:1px solid ${T.composerBorder};border-radius:18px;padding:12px 10px 8px 12px;display:flex;flex-direction:column;gap:10px;}
.draft{font-size:14px;line-height:22px;color:${T.draft};white-space:pre-wrap;}
.caret{display:inline-block;width:1px;height:15px;background:${T.caret};vertical-align:-2px;margin-left:1px;}
.bar{display:flex;align-items:center;justify-content:space-between;white-space:nowrap;}
.left,.right{display:flex;align-items:center;gap:4px;white-space:nowrap;}
.iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;color:${T.labelTertiary};}
.perm{display:inline-flex;align-items:center;gap:5px;color:${T.error};font-size:13px;line-height:20px;padding:0 8px 0 4px;}
.model{display:inline-flex;align-items:center;gap:5px;color:${T.labelPrimary};font-size:13px;line-height:20px;padding:4px 6px;}
.send{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:${T.labelPrimary};color:${T.base};margin-left:6px;}

/* --- the plugin's own rules, verbatim from client.js STYLE --------------- */
.ccm-trigger{display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border:none;border-radius:8px;background:transparent;font-family:inherit;font-size:13px;font-variant-numeric:tabular-nums;line-height:20px;white-space:nowrap;}
.ccm-trigger.open{background:${T.hover};}
.ccm-pct{font-variant-numeric:tabular-nums;}
.ring{display:block;overflow:visible;}

.ccm-panel{width:264px;padding:12px;border-radius:16px;background:${T.menu};box-shadow:0 0 0 .5px ${T.borderL3},0 3px 8px 0 #0000000a,0 0 20px 0 #0000000d;font-size:12px;line-height:20px;color:${T.labelSecondary};}
.ccm-head{display:flex;align-items:center;gap:6px;}
.ccm-headline{color:${T.labelTertiary};}
.ccm-big{font-weight:500;}
.ccm-figures{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums;}
.ccm-close{width:16px;height:16px;border:none;background:transparent;color:${T.labelTertiary};font-size:16px;line-height:16px;padding:0;text-align:center;border-radius:4px;}
.ccm-barbox{position:relative;margin:10px 0 12px;}
.ccm-bar{display:flex;gap:1px;height:4px;border-radius:999px;background:${T.hover};overflow:hidden;}
.ccm-seg{flex:none;min-width:2px;height:100%;border-radius:1px;}
.ccm-line{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;background:${T.warn};box-shadow:0 0 0 1px ${T.menu};}
.ccm-rows{margin:0;}
.ccm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0;}
.ccm-row dt{color:${T.labelSecondary};}
.ccm-row dd{margin:0;font-variant-numeric:tabular-nums;color:${T.labelPrimary};}
.ccm-swatch{display:inline-block;margin-right:6px;width:8px;height:8px;border-radius:2px;vertical-align:baseline;}
.ccm-divider{height:1px;margin:8px 0 4px;background:${T.borderL1};}
.ccm-recordtitle{margin-top:6px;color:${T.labelTertiary};}
.ccm-record{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1px 0;}
.ccm-recordv{font-variant-numeric:tabular-nums;color:${T.labelPrimary};}
`;
}

/* --- Scene pieces -------------------------------------------------------- */
function panel(T) {
  const level = levelOf(USED, LINE);
  const color = bandColor(T, level);
  const linePct = (LINE / CAPACITY) * 100;
  const total = BREAKDOWN.system + BREAKDOWN.tools + BREAKDOWN.messages;
  const segments = [
    ['system', T.chartSystem],
    ['tools', T.chartTools],
    ['messages', T.chartMessages],
  ].map(([key, tint]) => `<div class="ccm-seg" style="width:${(PERCENT * BREAKDOWN[key]) / total}%;background:${tint}"></div>`)
    .join('');
  const rows = [
    ['system', '系统提示词', T.chartSystem],
    ['tools', '工具定义', T.chartTools],
    ['messages', '对话消息', T.chartMessages],
  ].map(([key, label, tint]) => `<div class="ccm-row"><dt><span class="ccm-swatch" style="background:${tint}"></span>${label}</dt>`
    + `<dd>~${formatTokens(BREAKDOWN[key])}</dd></div>`).join('');
  const records = HISTORY.map(entry => `<div class="ccm-record"><span>第 ${entry.ordinal} 次</span>`
    + `<span class="ccm-recordv">${formatTokens(entry.threshold)}</span></div>`).join('');

  return `<div class="ccm-panel">
  <div class="ccm-head">
    <span class="ccm-headline">上下文已用</span>
    <span class="ccm-big" style="color:${color}">${PERCENT}%</span>
    <span class="ccm-figures" style="color:${color}">~${formatTokens(USED)} / ${formatTokens(CAPACITY)}</span>
    <button class="ccm-close" aria-label="关闭">×</button>
  </div>
  <div class="ccm-barbox">
    <div class="ccm-bar">${segments}</div>
    <div class="ccm-line" style="left:${linePct}%"></div>
  </div>
  <dl class="ccm-rows">${rows}</dl>
  <div class="ccm-divider"></div>
  <dl class="ccm-rows">
    <div class="ccm-row"><dt>压缩线</dt><dd>${formatTokens(LINE)}</dd></div>
    <div class="ccm-row"><dt>已压缩</dt><dd>${HISTORY.length} 次</dd></div>
  </dl>
  <div class="ccm-recordtitle">压缩记录</div>
  <div>${records}</div>
</div>`;
}

function composer(T, open) {
  const color = bandColor(T, levelOf(USED, LINE));
  return `<div class="composer">
    <div class="draft">把这段日志压一下，看看压缩线还有多远<span class="caret"></span></div>
    <div class="bar">
      <div class="left"><span class="iconbtn">${PLUS}</span><span class="perm">${INFO}允许完全访问${CHEV}</span></div>
      <div class="right">
        ${trigger(T, PERCENT, color, open)}
        <span class="model">DeepSeek-V4.1-Flash${CHEV}</span>
        <span class="iconbtn">${MIC}</span>
        <span class="send">${SEND}</span>
      </div>
    </div>
  </div>`;
}

/* --- Scenes -------------------------------------------------------------- */
function panelScene(T, w) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stylesheet(T)}</style></head><body>
<div class="page" style="width:${w}px">
  <div class="panelwrap">${panel(T)}</div>
  ${composer(T, true)}
</div></body></html>`;
}

function statesScene(T, w) {
  const cells = [
    ['green', 120_000, '绿色 · 用量 < 压缩线 50%'],
    ['yellow', 412_300, '黄色 · 压缩线 50%–75%'],
    ['red', 742_000, '红色 · 用量 > 压缩线 75%'],
  ].map(([level, used, label]) => {
    const pct = Math.round((used / CAPACITY) * 100);
    const color = bandColor(T, level);
    return `<div class="cell">
      <div class="cellchip">${trigger(T, pct, color, false)}</div>
      <div class="cellpct" style="color:${color}">~${formatTokens(used)} / ${formatTokens(CAPACITY)}</div>
      <div class="celllabel">${label}</div>
    </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stylesheet(T)}
.page{flex-direction:row;align-items:stretch;gap:14px;padding:16px;}
.cell{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:196px;padding:14px 10px;border-radius:12px;background:${T.composer};border:1px solid ${T.composerBorder};}
.cellchip{transform:scale(1.3);transform-origin:center;margin-bottom:4px;}
.cellpct{font-size:12px;font-variant-numeric:tabular-nums;}
.celllabel{font-size:11px;color:${T.labelTertiary};text-align:center;line-height:16px;}
</style></head><body>
<div class="page" style="width:${w}px">${cells}</div>
</body></html>`;
}

const SCENES = [
  { file: 'panel-dark', out: 'panel-dark.png', T: DARK, w: 486, h: 620, build: panelScene },
  { file: 'panel-light', out: 'panel-light.png', T: LIGHT, w: 486, h: 620, build: panelScene },
  { file: 'trigger-states', out: 'trigger-states.png', T: DARK, w: 660, h: 160, build: statesScene },
];

/* --- Chrome + crop + downscale ------------------------------------------- */
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found === undefined) throw new Error('generate.cjs: set CHROME_PATH to a Chrome or Edge executable');
  return found;
}

/* pngjs is not a dependency of this plugin; use the profile copy if present. */
function pngjs() {
  const candidates = [
    'pngjs',
    path.join(process.env.DSH_PROFILE_DIR || '', 'node_modules', 'pngjs'),
    'D:/DeepSeekHarness/home/profiles/desktop/node_modules/pngjs',
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try the next one */ }
  }
  throw new Error('generate.cjs: pngjs is required to downscale the 2x render (npm i -D pngjs)');
}

/**
 * Crop the transparent margin Chrome leaves around the `.page` box, then
 * box-filter 2x downscale, so the README gets a 1x image with 2x detail.
 */
function cropAndHalve(inPath, outPath) {
  const { PNG } = pngjs();
  const img = PNG.sync.read(fs.readFileSync(inPath));
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(img.width * y + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('generate.cjs: nothing was drawn for ' + path.basename(inPath));
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const w = Math.round(cw / 2), h = Math.round(ch / 2);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (w * y + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const sx = Math.min(img.width - 1, x0 + x * 2 + dx);
        const sy = Math.min(img.height - 1, y0 + y * 2 + dy);
        const si = (img.width * sy + sx) * 4;
        r += img.data[si]; g += img.data[si + 1]; b += img.data[si + 2]; a += img.data[si + 3];
      }
      out.data[di] = Math.round(r / 4);
      out.data[di + 1] = Math.round(g / 4);
      out.data[di + 2] = Math.round(b / 4);
      out.data[di + 3] = Math.round(a / 4);
    }
  }
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(path.basename(outPath) + '  ' + w + 'x' + h + '  ' + fs.statSync(outPath).size + ' bytes');
}

console.log(`line = floor(min(${CAPACITY} * ${RATIO}, (${CAPACITY} - ${RESERVED}) - ${HEADROOM})) = ${LINE}  (${(LINE / CAPACITY * 100).toFixed(1)}% of window)`);
console.log(`used ${USED} = ${PERCENT}%  →  band ${levelOf(USED, LINE)}`);

const chrome = chromePath();
for (const scene of SCENES) {
  const htmlPath = path.join(BUILD, scene.file + '.html');
  const shotPath = path.join(BUILD, scene.file + '.png');
  fs.writeFileSync(htmlPath, scene.build(scene.T, scene.w, scene.h));
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--force-device-scale-factor=2',
    '--window-size=' + scene.w + ',' + scene.h,
    '--screenshot=' + shotPath,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  cropAndHalve(shotPath, path.join(IMAGES, scene.out));
}

