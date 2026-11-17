/**
 * Render the README mockups for dsh-context-compaction-meter.
 *
 * The images under `docs/images/` are mockups, not screenshots: this script
 * redraws the DSH window chrome (attached-file cards, the message action row,
 * the composer, the status bar) and this plugin's merged context popover with
 * the theme tokens of `@deepseek-ai/dsh-client-ui-theme` resolved to the
 * literal values that package ships, then asks headless Chrome for a 2x
 * screenshot, crops the transparent margin and box-filters it back down.
 *
 * Geometry and colors are taken from the shipped UI, not invented:
 *   850px window → cards at x=51 (314×59, gap 11), composer at x=32 (r 20),
 *   status bar 28px tall with a 1px top border, the 264px popover aligned to
 *   the chip's right edge, 12px above it.
 *
 * The figures on screen are the plugin's own arithmetic:
 *   capacity 1,000,000  reserved 128,000  headroom 65,536  ratio 0.8
 *   → line = floor(min(1e6 * 0.8, (1e6 - 128000) - 65536)) = 800,000  (80%)
 *   light scene: 145K used → 14%  (9.8K + 20.6K + 116K), band green
 *   dark scene:  580K used → 58%  (38K + 82K + 460K), band yellow, 2 compactions
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
const LIGHT = {
  page: '#ffffff',
  card: '#fafafa',
  cardBorder: '#f0f0f0',
  tile: '#ffffff',
  tileBorder: '#ececec',
  composer: '#ffffff',
  composerBorder: '#ececec',
  statusBg: '#fafafa',
  statusBorder: '#e9e9e9',
  labelPrimary: '#0f1115',
  labelSecondary: '#61666b',
  labelTertiary: '#81858c',
  placeholder: '#adb2b8',
  borderL1: '#0000000a',
  borderL3: '#e9e9e9',
  hover: '#2631480f',
  chipBg: '#f5f6f7',
  menu: '#ffffff',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ec1313',
  ring: '#e5e5e5',
  track: '#f0f0f0',
  warnIcon: '#ec1313',
  sendBg: '#0f1115',
  sendFg: '#ffffff',
};
const DARK = {
  page: '#151517',
  card: '#212123',
  cardBorder: '#2c2c2e',
  tile: '#2c2c2e',
  tileBorder: '#353638',
  composer: '#232324',
  composerBorder: '#2c2c2e',
  statusBg: '#1b1b1c',
  statusBorder: '#2c2c2e',
  labelPrimary: '#f9fafb',
  labelSecondary: '#cfd3d6',
  labelTertiary: '#adb2b8',
  placeholder: '#81858c',
  borderL1: '#ffffff0f',
  borderL3: '#353638',
  hover: '#ffffff14',
  chipBg: '#2c2c2e',
  menu: '#2c2c2e',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#f25a5a',
  ring: '#43454a',
  track: '#353638',
  warnIcon: '#f25a5a',
  sendBg: '#f9fafb',
  sendFg: '#151517',
};

/* --- Mock data ----------------------------------------------------------- */
const CAPACITY = 1_000_000;
const RESERVED = 128_000;
const HEADROOM = 65_536;
const RATIO = 0.8;
const LINE = Math.floor(Math.min(CAPACITY * RATIO, CAPACITY - RESERVED - HEADROOM));

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

/* --- Icons --------------------------------------------------------------- */
const I = {
  image: c => `<svg viewBox="0 0 20 20" width="20" height="20" fill="${c}" aria-hidden="true"><path d="M5.6 2.5h5.3l4.1 4.1v10.9H5.6a1.6 1.6 0 0 1-1.6-1.6V4.1a1.6 1.6 0 0 1 1.6-1.6Z" opacity=".95"/><circle cx="8.4" cy="8.2" r="1.5" fill="#fff"/><path d="M4.9 15.1l3.6-4 2.3 2.4 1.7-1.6 2.6 3.2Z" fill="#fff"/></svg>`,
  folder: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M1.9 4.2h4l1.4 1.7h6.8v6.2a1 1 0 0 1-1 1H2.9a1 1 0 0 1-1-1Z"/></svg>`,
  chev: c => `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.4 6.4 8 10l3.6-3.6"/></svg>`,
  copy: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="2.2" y="2.2" width="8.4" height="8.4" rx="1.6"/><path d="M5.4 13.8h7a1.4 1.4 0 0 0 1.4-1.4v-7"/></svg>`,
  up: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.6 14V7.2M4.6 7.2h2.1l2.5-4.4a1.5 1.5 0 0 1 1.9 1.9l-.7 2.5h2.2a1.2 1.2 0 0 1 1.2 1.5l-.9 4a1.2 1.2 0 0 1-1.2 1H4.6"/></svg>`,
  down: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.6 2v6.8M4.6 8.8h2.1l2.5 4.4a1.5 1.5 0 0 0 1.9-1.9l-.7-2.5h2.2a1.2 1.2 0 0 0 1.2-1.5l-.9-4a1.2 1.2 0 0 0-1.2-1H4.6"/></svg>`,
  share: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12.4" cy="3.6" r="1.9"/><circle cx="3.6" cy="8" r="1.9"/><circle cx="12.4" cy="12.4" r="1.9"/><path d="M5.3 7.1 10.7 4.5M5.3 8.9l5.4 2.6"/></svg>`,
  gauge: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2.4 11.6a6 6 0 1 1 11.2 0"/><path d="M8 8.4 10.6 6"/></svg>`,
  clock: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.4 1.6"/></svg>`,
  spin: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M13.4 8a5.4 5.4 0 1 1-2.2-4.3"/><path d="M13.6 2.4v3h-3"/></svg>`,
  db: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" aria-hidden="true"><ellipse cx="8" cy="3.9" rx="4.6" ry="1.9"/><path d="M3.4 3.9v8.2c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9V3.9"/><path d="M3.4 8c0 1 2.1 1.9 4.6 1.9s4.6-.9 4.6-1.9"/></svg>`,
  battery: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" aria-hidden="true"><rect x="1.4" y="4.6" width="11.2" height="6.8" rx="1.6"/><rect x="2.6" y="5.8" width="5.6" height="4.4" rx=".8" fill="${c}" stroke="none"/><path d="M14.2 6.6v2.8" stroke-linecap="round"/></svg>`,
  plus: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>`,
  warn: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.4 14.2 13H1.8Z"/><path d="M8 6.4v3"/><circle cx="8" cy="11.3" r=".7" fill="${c}" stroke="none"/></svg>`,
  sparkle: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="${c}" aria-hidden="true"><path d="M6.2 1.6c.28 2.3 1.38 3.4 3.68 3.68-2.3.28-3.4 1.38-3.68 3.68-.28-2.3-1.38-3.4-3.68-3.68 2.3-.28 3.4-1.38 3.68-3.68Z"/><path d="M12.2 8.6c.16 1.26.75 1.85 2.01 2.01-1.26.16-1.85.75-2.01 2.01-.16-1.26-.75-1.85-2.01-2.01 1.26-.16 1.85-.75 2.01-2.01Z"/></svg>`,
  mic: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="6" y="1.8" width="4" height="7.2" rx="2"/><path d="M3.8 7.4a4.2 4.2 0 0 0 8.4 0M8 11.6v2.4"/></svg>`,
  send: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.4V4M4.2 7.6 8 3.8l3.8 3.8"/></svg>`,
};

/* --- The plugin's stylesheet, tokens inlined ------------------------------ */
function stylesheet(T) {
  return `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:transparent;font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}
.win{position:relative;background:${T.page};overflow:hidden;}

/* --- attached-file cards ------------------------------------------------- */
.cards{position:absolute;left:51px;top:22px;display:flex;gap:11px;}
.card{position:relative;width:314px;height:59px;border-radius:12px;background:${T.card};border:1px solid ${T.cardBorder};}
.tile{position:absolute;left:10px;top:9px;width:41px;height:41px;border-radius:10px;background:${T.tile};border:1px solid ${T.tileBorder};display:flex;align-items:center;justify-content:center;}
.js{font:600 13px/1 "Segoe UI",system-ui,sans-serif;color:#1f1f1f;background:#f7df1e;width:24px;height:24px;border-radius:4px;display:flex;align-items:center;justify-content:center;}
.fname{position:absolute;left:62px;top:11px;font-size:14px;line-height:19px;font-weight:600;color:${T.labelPrimary};}
.fdesc{position:absolute;left:62px;top:33px;font-size:12px;line-height:17px;color:${T.labelTertiary};}
.cardctl{position:absolute;right:10px;top:16px;display:flex;align-items:center;height:27px;border:1px solid ${T.cardBorder};border-radius:7px;background:${T.tile};overflow:hidden;color:${T.labelSecondary};}
.cardctl .ico{padding:0 7px;display:flex;align-items:center;height:100%;}
.cardctl .sep{width:1px;height:100%;background:${T.cardBorder};}
.cardctl .chev{padding:0 5px;display:flex;align-items:center;height:100%;}

/* --- message action row -------------------------------------------------- */
.actions{position:absolute;left:51px;top:103px;display:flex;align-items:center;gap:20px;color:${T.labelSecondary};}
.act{display:flex;align-items:center;justify-content:center;width:16px;height:16px;}
.meta{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:${T.labelTertiary};}

/* --- composer ------------------------------------------------------------ */
.composer{position:absolute;left:32px;right:32px;top:130px;height:106px;border-radius:20px;background:${T.composer};border:1px solid ${T.composerBorder};}
.ph{position:absolute;left:24px;top:20px;font-size:14px;line-height:20px;color:${T.placeholder};}
.cbar{position:absolute;left:14px;right:14px;bottom:9px;height:32px;display:flex;align-items:center;gap:10px;}
.plus{width:28px;height:28px;border-radius:999px;background:${T.chipBg};color:${T.labelSecondary};display:flex;align-items:center;justify-content:center;}
.perm{display:flex;align-items:center;gap:5px;font-size:13px;line-height:20px;color:${T.labelPrimary};}
.perm .w{color:${T.warnIcon};display:flex;}
.perm .c{color:${T.labelTertiary};display:flex;}
.spacer{flex:1;}
.toolico{color:${T.labelTertiary};display:flex;align-items:center;}
.model{font-size:13px;line-height:20px;color:${T.labelPrimary};white-space:nowrap;}
.cmic{color:${T.labelTertiary};display:flex;align-items:center;}
.send{width:28px;height:28px;border-radius:999px;background:${T.sendBg};color:${T.sendFg};display:flex;align-items:center;justify-content:center;}

/* --- status bar ---------------------------------------------------------- */
.status{position:absolute;left:0;right:0;bottom:0;height:32px;background:${T.statusBg};border-top:1px solid ${T.statusBorder};display:flex;align-items:center;justify-content:flex-end;gap:16px;padding:0 32px;font-size:12px;line-height:18px;color:${T.labelTertiary};font-variant-numeric:tabular-nums;}
.sitem{display:flex;align-items:center;gap:5px;white-space:nowrap;}

/* --- the plugin's own rules, verbatim from client.js STYLE --------------- */
.ccm-root{display:inline-flex;flex:none;}
.ccm-trigger{display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border:none;border-radius:8px;background:transparent;font-family:inherit;font-size:13px;font-variant-numeric:tabular-nums;line-height:20px;white-space:nowrap;}
.ccm-trigger.open{background:${T.chipBg};}
.ccm-pct{font-variant-numeric:tabular-nums;font-weight:600;}
.ring{display:block;overflow:visible;}

.ccm-panel{position:absolute;right:32px;bottom:40px;border-radius:12px;width:264px;padding:12px;background:${T.menu};border:1px solid ${T.borderL3};box-shadow:0 3px 8px 0 #0000000a,0 0 20px 0 #0000000d;font-size:12px;line-height:20px;color:${T.labelSecondary};}
.ccm-head{display:flex;align-items:center;gap:6px;}
.ccm-headline{color:${T.labelSecondary};}
.ccm-big{font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;}
.ccm-figures{margin-left:auto;font-weight:600;font-size:13px;font-variant-numeric:tabular-nums;}
.ccm-close{width:16px;height:16px;border:none;background:transparent;color:${T.labelTertiary};font-size:15px;line-height:16px;padding:0;text-align:center;border-radius:4px;}
.ccm-barbox{position:relative;margin:10px 0 12px;}
.ccm-bar{display:flex;gap:1px;height:4px;border-radius:999px;background:${T.track};overflow:hidden;}
.ccm-seg{flex:none;min-width:2px;height:100%;border-radius:1px;}
.ccm-line{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;background:${T.warn};box-shadow:0 0 0 1px ${T.menu};}
.ccm-rows{margin:0;}
.ccm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0;}
.ccm-row dt{color:${T.labelSecondary};}
.ccm-row dd{margin:0;font-variant-numeric:tabular-nums;color:${T.labelPrimary};}
.ccm-swatch{display:inline-block;margin-right:8px;width:8px;height:8px;border-radius:2px;vertical-align:baseline;}
.ccm-divider{height:1px;margin:8px 0 4px;background:${T.borderL1};}
.ccm-recordtitle{margin-top:6px;color:${T.labelTertiary};}
.ccm-record{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1px 0;}
.ccm-recordv{font-variant-numeric:tabular-nums;color:${T.labelPrimary};}
`;
}

/* --- Scene pieces -------------------------------------------------------- */
function card(T, spec) {
  const tile = spec.js
    ? `<span class="js">JS</span>`
    : I.image('#a78bfa');
  return `<div class="card">
    <div class="tile">${tile}</div>
    <div class="fname">${spec.name}</div>
    <div class="fdesc">${spec.desc}</div>
    <div class="cardctl"><span class="ico">${I.folder(T.labelSecondary)}</span><span class="sep"></span><span class="chev">${I.chev(T.labelTertiary)}</span></div>
  </div>`;
}

function panel(T, state) {
  const level = levelOf(state.used, LINE);
  const color = bandColor(T, level);
  const percent = Math.round((state.used / CAPACITY) * 100);
  const linePct = (LINE / CAPACITY) * 100;
  const b = state.breakdown;
  const total = b.system + b.tools + b.messages;
  const segments = [
    [b.system, T.chartSystem],
    [b.tools, T.chartTools],
    [b.messages, T.chartMessages],
  ].map(([value, tint]) => `<div class="ccm-seg" style="width:${(percent * value) / total}%;background:${tint}"></div>`)
    .join('');
  const rows = [
    ['系统提示词', b.system, T.chartSystem],
    ['工具定义', b.tools, T.chartTools],
    ['对话消息', b.messages, T.chartMessages],
  ].map(([label, value, tint]) => `<div class="ccm-row"><dt><span class="ccm-swatch" style="background:${tint}"></span>${label}</dt>`
    + `<dd>~${formatTokens(value)}</dd></div>`).join('');
  const records = state.compactions.map(entry => `<div class="ccm-record"><span>第 ${entry.ordinal} 次</span>`
    + `<span class="ccm-recordv">${formatTokens(entry.threshold)}</span></div>`).join('');

  return `<div class="ccm-panel">
  <div class="ccm-head">
    <span class="ccm-headline">上下文已用</span>
    <span class="ccm-big" style="color:${color}">${percent}%</span>
    <span class="ccm-figures" style="color:${color}">~${formatTokens(state.used)} / ${formatTokens(CAPACITY)}</span>
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
    <div class="ccm-row"><dt>已压缩</dt><dd>${state.compactions.length} 次</dd></div>
  </dl>
  ${state.compactions.length === 0 ? '' : `<div class="ccm-recordtitle">压缩记录</div><div>${records}</div>`}
</div>`;
}

function trigger(T, state, open) {
  const percent = Math.round((state.used / CAPACITY) * 100);
  const color = bandColor(T, levelOf(state.used, LINE));
  return `<span class="ccm-root"><button class="ccm-trigger${open ? ' open' : ''}" style="color:${T.labelTertiary}">`
    + ring(percent, color, T.ring)
    + `<span class="ccm-pct" style="color:${color}">${percent}%</span>`
    + `</button></span>`;
}

/* --- Scenes -------------------------------------------------------------- */
function windowScene(T, state, w, h) {
  const percent = Math.round((state.used / CAPACITY) * 100);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stylesheet(T)}</style></head><body>
<div class="win" style="width:${w}px;height:${h}px">
  <div class="cards">
    ${card(T, { name: 'panel-dark.png', desc: '深色主题下的合并用量窗口模拟图' })}
    ${card(T, { name: 'generate.cjs', desc: '模拟图生成脚本，可复现全部 README 图', js: true })}
  </div>

  <div class="actions">
    <span class="act">${I.copy(T.labelSecondary)}</span>
    <span class="act">${I.up(T.labelSecondary)}</span>
    <span class="act">${I.down(T.labelSecondary)}</span>
    <span class="act">${I.share(T.labelSecondary)}</span>
    <span class="meta">${I.gauge(T.labelTertiary)}用量 11.6M tok</span>
    <span class="meta">${I.clock(T.labelTertiary)}05:23</span>
  </div>

  <div class="composer">
    <div class="ph">发消息或创建任务，/ 调用指令，@ 文件或对话</div>
    <div class="cbar">
      <span class="plus">${I.plus(T.labelSecondary)}</span>
      <span class="perm"><span class="w">${I.warn(T.warnIcon)}</span>完全权限<span class="c">${I.chev(T.labelTertiary)}</span></span>
      <span class="spacer"></span>
      <span class="toolico">${I.sparkle(T.labelTertiary)}</span>
      <span class="model">DeepSeek V4.1 Flash · 均衡池（4 页）</span>
      <span class="cmic">${I.mic(T.labelTertiary)}</span>
      <span class="send">${I.send(T.sendFg)}</span>
    </div>
  </div>

  <div class="status">
    <span class="sitem">${I.spin(T.labelTertiary)}1 轮 121 步 · 199 tok/s</span>
    <span class="sitem">${I.db(T.labelTertiary)}11.6M tok · 缓存命中 0%</span>
    <span class="sitem" style="color:${T.success}">${I.battery(T.success)}50%</span>
    ${trigger(T, state, true)}
  </div>

  ${panel(T, state)}
</div></body></html>`;
}

function statesScene(T, w) {
  const cells = [
    [120_000, '绿色 · 用量 < 压缩线 50%'],
    [580_000, '黄色 · 压缩线 50%–75%'],
    [742_000, '红色 · 用量 > 压缩线 75%'],
  ].map(([used, label]) => {
    const percent = Math.round((used / CAPACITY) * 100);
    const color = bandColor(T, levelOf(used, LINE));
    return `<div class="cell">
      <div class="chip">${ring(percent, color, T.ring)}<span class="pct" style="color:${color}">${percent}%</span></div>
      <div class="fig" style="color:${color}">~${formatTokens(used)} / ${formatTokens(CAPACITY)}</div>
      <div class="lab">${label}</div>
    </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${stylesheet(T)}
body{background:${T.page};}
.wrap{display:flex;align-items:stretch;gap:12px;padding:16px;}
.cell{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:16px 10px;border-radius:12px;background:${T.card};border:1px solid ${T.cardBorder};}
.chip{display:flex;align-items:center;gap:6px;padding:3px 10px;border-radius:8px;background:${T.chipBg};}
.pct{font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;}
.fig{font-size:12px;font-variant-numeric:tabular-nums;}
.lab{font-size:11px;line-height:16px;color:${T.labelTertiary};text-align:center;}
</style></head><body>
<div class="wrap" style="width:${w}px">${cells}</div>
</body></html>`;
}

const LIGHT_STATE = {
  used: 145_000,
  breakdown: { system: 9_800, tools: 20_600, messages: 116_000 },
  compactions: [],
};
const DARK_STATE = {
  used: 580_000,
  breakdown: { system: 38_000, tools: 82_000, messages: 460_000 },
  compactions: [
    { ordinal: 1, threshold: LINE },
    { ordinal: 2, threshold: LINE },
  ],
};

const SCENES = [
  { file: 'panel-light', out: 'panel-light.png', T: LIGHT, state: LIGHT_STATE, w: 850, h: 276, build: windowScene },
  { file: 'panel-dark', out: 'panel-dark.png', T: DARK, state: DARK_STATE, w: 850, h: 332, build: windowScene },
  { file: 'trigger-states', out: 'trigger-states.png', T: LIGHT, state: LIGHT_STATE, w: 660, h: 108, build: statesScene },
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
 * Crop the transparent margin Chrome leaves around the page, then box-filter
 * 2x downscale, so the README gets a 1x image with 2x detail.
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
for (const scene of SCENES.slice(0, 2)) {
  const used = scene.state.used;
  console.log(`  ${scene.file}: used ${used} = ${Math.round(used / CAPACITY * 100)}%  →  band ${levelOf(used, LINE)}`);
}

const chrome = chromePath();
for (const scene of SCENES) {
  const htmlPath = path.join(BUILD, scene.file + '.html');
  const shotPath = path.join(BUILD, scene.file + '.png');
  fs.writeFileSync(htmlPath, scene.build(scene.T, scene.state, scene.w, scene.h));
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--force-device-scale-factor=2',
    '--window-size=' + scene.w + ',' + scene.h,
    '--screenshot=' + shotPath,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  cropAndHalve(shotPath, path.join(IMAGES, scene.out));
}
