/**
 * Render the README mockups for dsh-context-compaction-meter.
 *
 * Mockups, not screenshots — but every number below was measured pixel by
 * pixel off a real DSH window (850×276), not invented:
 *
 *   composer        x 31..812 (781 wide), y 145..244 (99 tall), radius 20
 *   placeholder     14px #adb2b8, x 49, band y 164..175
 *   control row     + circle 43..70 (#f5f6f7, 28px) · info icon 92..111
 *                   "完全权限" 112..160 · chevron 168..175 · ✦ 319..328
 *                   model 358..524 · mic 532..544 · send 560..588
 *                   (the popover covers mic/send in this state — that is what
 *                   the real window shows, so the mockup shows it too)
 *   action row      copy 52 · up 88 · down 124 · share 160 (36px pitch)
 *                   "用量 11.6M tok" 206..303 · "05:23" 320..347
 *   footer strip    1px #e9e9e9 border at y=244, #fafafa fill to y=276
 *                   items end at the trigger pill's right edge x=623
 *   popover         x 553..817 (264 wide), y 36..238, 12px padding,
 *                   radius 12 — the placement client.js `reposition()` yields
 *
 * Colors are the literal values from @deepseek-ai/dsh-client-ui-theme:
 * light #fafafa / #ffffff / #ececec / #adb2b8 / #61666b,
 * dark #212123 / #232324 / #2c2c2e, chart #adb2b8 · #a78bfa · #4d93f8,
 * state #22c55e · #f59e0b · #ec1313.
 *
 * The figures are the plugin's own arithmetic:
 *   capacity 1,000,000  reserved 128,000  headroom 65,536  ratio 0.8
 *   → line = floor(min(1e6 × 0.8, (1e6 − 128000) − 65536)) = 800,000  (80%)
 *   light scene 145K used → 14% (9.8K + 20.6K + 116K), green, 0 compactions
 *   dark scene  580K used → 58% (38K + 82K + 460K), yellow, 2 compactions
 *
 * Requirements: Node 20+, Google Chrome (or set CHROME_PATH).
 *
 *   node docs/mockups/generate.cjs
 *
 * HTML scratch files and 2x renders land in `docs/mockups/.build/` (ignored);
 * the final PNGs replace `docs/images/*.png`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, '.build');
const IMAGES = path.join(ROOT, 'docs', 'images');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(IMAGES, { recursive: true });

/* --- Geometry measured from a real DSH window ---------------------------- */
const GEO = {
  width: 850,
  composer: { left: 31, width: 781, height: 99, radius: 20 },
  footer: { top: 244, height: 32, chipRight: 623 },
  panel: { left: 553, width: 264, height: 202, pad: 12, radius: 12, bottom: 38 },
};

/* --- Theme tokens, resolved from dsh-client-ui-theme --------------------- */
const LIGHT = {
  page: '#ffffff',
  composer: '#ffffff',
  composerBorder: '#ececec',
  placeholder: '#adb2b8',
  footerBg: '#fafafa',
  footerBorder: '#e9e9e9',
  labelPrimary: '#0f1115',
  labelSecondary: '#61666b',
  labelTertiary: '#81858c',
  borderL1: '#0000000a',
  chipBg: '#f5f6f7',
  chipOpenBg: '#ecedee',
  menu: '#ffffff',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ec1313',
  ring: '#f0f1f2',
  track: '#f0f0f0',
  sendBg: '#0f1115',
  sendFg: '#ffffff',
  composerShadow: '0 1px 2px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.03)',
  menuShadow: '0 0 0 1px #0000000a, 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d',
};
const DARK = {
  page: '#151517',
  composer: '#232324',
  composerBorder: '#2c2c2e',
  placeholder: '#81858c',
  footerBg: '#1b1b1c',
  footerBorder: '#2c2c2e',
  labelPrimary: '#f9fafb',
  labelSecondary: '#cfd3d6',
  labelTertiary: '#adb2b8',
  borderL1: '#ffffff0f',
  chipBg: '#2c2c2e',
  chipOpenBg: '#33333a',
  menu: '#2c2c2e',
  chartSystem: '#adb2b8',
  chartTools: '#a78bfa',
  chartMessages: '#4d93f8',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#f25a5a',
  ring: '#43454a',
  track: '#353638',
  sendBg: '#f9fafb',
  sendFg: '#151517',
  composerShadow: '0 1px 2px rgba(0,0,0,.4)',
  menuShadow: '0 0 0 1px #ffffff14, 0 3px 8px 0 #00000033, 0 0 20px 0 #00000033',
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
  copy: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"><rect x="2.6" y="2.6" width="7.6" height="7.6" rx="1.5"/><path d="M5.8 13.4h6.4a1.2 1.2 0 0 0 1.2-1.2V5.8"/></svg>`,
  up: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 13.4V7.2M4.6 7.2h2l2.3-4a1.4 1.4 0 0 1 1.8 1.8l-.5 2.2h2.1a1.1 1.1 0 0 1 1.1 1.4l-.8 3.6a1.1 1.1 0 0 1-1.1.8H4.6"/></svg>`,
  down: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 2.6V8.8M4.6 8.8h2l2.3 4a1.4 1.4 0 0 0 1.8-1.8l-.5-2.2h2.1a1.1 1.1 0 0 0 1.1-1.4l-.8-3.6a1.1 1.1 0 0 0-1.1-.8H4.6"/></svg>`,
  share: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12.2" cy="3.8" r="1.7"/><circle cx="3.8" cy="8" r="1.7"/><circle cx="12.2" cy="12.2" r="1.7"/><path d="M5.3 7.2 10.7 4.6M5.3 8.8l5.4 2.6"/></svg>`,
  gauge: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"><path d="M2.6 11.4a5.8 5.8 0 1 1 10.8 0"/><path d="M8 8.4 10.4 6"/></svg>`,
  clock: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.2 1.4"/></svg>`,
  refresh: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 8a5.2 5.2 0 1 1-1.9-4"/><path d="M13.4 2.6v3.2h-3.2"/></svg>`,
  db: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.3"><ellipse cx="8" cy="4" rx="4.4" ry="1.8"/><path d="M3.6 4v8c0 1 2 1.8 4.4 1.8s4.4-.8 4.4-1.8V4"/><path d="M3.6 8c0 1 2 1.8 4.4 1.8s4.4-.8 4.4-1.8"/></svg>`,
  battery: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.3"><rect x="1.6" y="4.8" width="10.8" height="6.4" rx="1.6"/><rect x="2.8" y="6" width="5.2" height="4" rx=".7" fill="${c}" stroke="none"/><path d="M14 6.8v2.4" stroke-linecap="round"/></svg>`,
  plus: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.6v8.8M3.6 8h8.8"/></svg>`,
  /* The permission control's leading glyph is a plain circled "i", gray. */
  info: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="${c}" stroke-width="1.25"><circle cx="8" cy="8" r="5.9"/><path d="M8 7.1v3.6" stroke-linecap="round"/><circle cx="8" cy="5" r=".72" fill="${c}" stroke="none"/></svg>`,
  chev: c => `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.4 6.4 8 10l3.6-3.6"/></svg>`,
  sparkle: c => `<svg viewBox="0 0 16 16" width="13" height="13" fill="${c}"><path d="M6.2 1.6c.28 2.3 1.38 3.4 3.68 3.68-2.3.28-3.4 1.38-3.68 3.68-.28-2.3-1.38-3.4-3.68-3.68 2.3-.28 3.4-1.38 3.68-3.68Z"/><path d="M12.2 8.6c.16 1.26.75 1.85 2.01 2.01-1.26.16-1.85.75-2.01 2.01-.16-1.26-.75-1.85-2.01-2.01 1.26-.16 1.85-.75 2.01-2.01Z"/></svg>`,
  mic: c => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round"><rect x="6" y="1.8" width="4" height="7.2" rx="2"/><path d="M3.8 7.4a4.2 4.2 0 0 0 8.4 0M8 11.6v2.4"/></svg>`,
  send: c => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.4V4M4.2 7.6 8 3.8l3.8 3.8"/></svg>`,
};

/* --- Stylesheet ---------------------------------------------------------- */
function stylesheet(T) {
  return `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:transparent;font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
.win{position:relative;background:${T.page};overflow:hidden;}

/* --- previous message's action row --------------------------------------- */
.actions{position:absolute;left:52px;display:flex;align-items:center;color:${T.labelSecondary};}
.actions .act{width:15px;height:15px;display:flex;align-items:center;justify-content:center;}
.actions .act+.act{margin-left:21px;}
.meta{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:${T.labelTertiary};white-space:nowrap;}
.meta.usage{margin-left:33px;}
.meta.time{margin-left:17px;}

/* --- composer ------------------------------------------------------------ */
.composer{position:absolute;left:${GEO.composer.left}px;width:${GEO.composer.width}px;height:${GEO.composer.height}px;border-radius:${GEO.composer.radius}px;background:${T.composer};border:1px solid ${T.composerBorder};box-shadow:${T.composerShadow};}
.ph{position:absolute;left:18px;top:15px;font-size:14px;line-height:20px;color:${T.placeholder};white-space:nowrap;}
.cbar{position:absolute;left:0;right:0;bottom:7px;height:28px;}
.plus{position:absolute;left:12px;top:0;width:28px;height:28px;border-radius:999px;background:${T.chipBg};color:${T.labelSecondary};display:flex;align-items:center;justify-content:center;}
.perm{position:absolute;left:61px;top:4px;display:flex;align-items:center;gap:5px;font-size:13px;line-height:20px;color:${T.labelSecondary};white-space:nowrap;}
.perm .c{color:${T.labelTertiary};display:flex;margin-left:2px;}
.spark{position:absolute;left:288px;top:7px;color:${T.labelTertiary};display:flex;}
.model{position:absolute;left:327px;top:4px;font-size:13px;line-height:20px;color:${T.labelPrimary};white-space:nowrap;}
.mic{position:absolute;left:501px;top:6px;color:${T.labelTertiary};display:flex;}
.send{position:absolute;left:529px;top:0;width:28px;height:28px;border-radius:999px;background:${T.sendBg};color:${T.sendFg};display:flex;align-items:center;justify-content:center;}

/* --- footer strip -------------------------------------------------------- */
.footer{position:absolute;left:0;right:0;height:${GEO.footer.height}px;background:${T.footerBg};border-top:1px solid ${T.footerBorder};}
.frow{position:absolute;top:-2px;height:100%;display:flex;align-items:center;gap:29px;font-size:12px;line-height:18px;color:${T.labelTertiary};font-variant-numeric:tabular-nums;white-space:nowrap;}
.sitem{display:flex;align-items:center;gap:5px;white-space:nowrap;}

/* --- the plugin's own rules, verbatim from client.js STYLE --------------- */
.ccm-root{display:inline-flex;flex:none;}
.ccm-trigger{display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border:none;border-radius:8px;background:${T.chipOpenBg};font-family:inherit;font-size:13px;font-variant-numeric:tabular-nums;line-height:20px;white-space:nowrap;}
.ccm-pct{font-variant-numeric:tabular-nums;font-weight:600;}
.ring{display:block;overflow:visible;}

.ccm-panel{position:absolute;left:${GEO.panel.left}px;width:${GEO.panel.width}px;padding:${GEO.panel.pad}px;border-radius:${GEO.panel.radius}px;background:${T.menu};box-shadow:${T.menuShadow};font-size:12px;line-height:20px;color:${T.labelSecondary};}
.ccm-head{display:flex;align-items:center;gap:6px;}
.ccm-headline{color:${T.labelSecondary};}
.ccm-big{font-weight:600;font-variant-numeric:tabular-nums;}
.ccm-figures{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums;}
.ccm-close{width:16px;height:16px;border:none;background:transparent;color:${T.labelTertiary};font-size:15px;line-height:16px;padding:0;text-align:center;}
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
function panel(T, state, extraHeight) {
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

  return `<div class="ccm-panel" style="bottom:${GEO.panel.bottom + extraHeight}px">
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

function trigger(T, state) {
  const percent = Math.round((state.used / CAPACITY) * 100);
  const color = bandColor(T, levelOf(state.used, LINE));
  return `<span class="ccm-root"><span class="ccm-trigger" style="color:${T.labelTertiary}">`
    + ring(percent, color, T.ring)
    + `<span class="ccm-pct" style="color:${color}">${percent}%</span>`
    + `</span></span>`;
}

/* --- Scenes -------------------------------------------------------------- */
function windowScene(T, state, h) {
  const extra = h - 276;
  const footerTop = GEO.footer.top + extra;
  const composerTop = footerTop - GEO.composer.height - 1;
  const actionsTop = composerTop - 36;

  /* The footer row is right-anchored so the trigger pill ends at chipRight. */
  const rowRight = GEO.width - GEO.footer.chipRight;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${stylesheet(T)}</style></head><body>
<div class="win" style="width:${GEO.width}px;height:${h}px">

  <div class="actions" style="top:${actionsTop}px">
    <span class="act">${I.copy(T.labelSecondary)}</span>
    <span class="act">${I.up(T.labelSecondary)}</span>
    <span class="act">${I.down(T.labelSecondary)}</span>
    <span class="act">${I.share(T.labelSecondary)}</span>
    <span class="meta usage">${I.gauge(T.labelTertiary)}用量 11.6M tok</span>
    <span class="meta time">${I.clock(T.labelTertiary)}05:23</span>
  </div>

  <div class="composer" style="top:${composerTop}px">
    <div class="ph">发消息或创建任务，/ 调用指令，@ 文件或对话</div>
    <div class="cbar">
      <span class="plus">${I.plus(T.labelSecondary)}</span>
      <span class="perm">${I.info(T.labelSecondary)}完全权限<span class="c">${I.chev(T.labelTertiary)}</span></span>
      <span class="spark">${I.sparkle(T.labelTertiary)}</span>
      <span class="model">DeepSeek V4.1 Flash · 均衡池（4 页）</span>
      <span class="mic">${I.mic(T.labelTertiary)}</span>
      <span class="send">${I.send(T.sendFg)}</span>
    </div>
  </div>

  <div class="footer" style="top:${footerTop}px">
    <div class="frow" style="right:${rowRight}px">
      <span class="sitem">${I.refresh(T.labelTertiary)}1 轮 121 步 · 199 tok/s</span>
      <span class="sitem">${I.db(T.labelTertiary)}11.6M tok · 缓存命中 0%</span>
      <span class="sitem" style="color:${T.success}">${I.battery(T.success)}50%</span>
      ${trigger(T, state)}
    </div>
  </div>

  ${panel(T, state, extra)}
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
.wrap{display:flex;align-items:stretch;gap:12px;padding:16px;background:${T.page};}
.cell{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:16px 10px;border-radius:12px;background:${T.footerBg};border:1px solid ${T.footerBorder};}
.chip{display:flex;align-items:center;gap:6px;padding:1px 8px;border-radius:8px;background:${T.chipBg};}
.pct{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;}
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
  { file: 'panel-light', out: 'panel-light.png', T: LIGHT, state: LIGHT_STATE, w: GEO.width, h: 276, build: windowScene },
  { file: 'panel-dark', out: 'panel-dark.png', T: DARK, state: DARK_STATE, w: GEO.width, h: 336, build: windowScene },
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

/** Crop the transparent margin, then box-filter the 2x render down to 1x. */
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

console.log(`line = floor(min(${CAPACITY} × ${RATIO}, (${CAPACITY} − ${RESERVED}) − ${HEADROOM})) = ${LINE}  (${(LINE / CAPACITY * 100).toFixed(1)}% of window)`);
for (const scene of SCENES.slice(0, 2)) {
  const used = scene.state.used;
  console.log(`  ${scene.file}: used ${used} = ${Math.round(used / CAPACITY * 100)}%  →  band ${levelOf(used, LINE)}`);
}

const chrome = chromePath();
for (const scene of SCENES) {
  const htmlPath = path.join(BUILD, scene.file + '.html');
  const shotPath = path.join(BUILD, scene.file + '.png');
  fs.writeFileSync(htmlPath, scene.build(scene.T, scene.state, scene.h));
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--force-device-scale-factor=2',
    '--window-size=' + scene.w + ',' + scene.h,
    '--screenshot=' + shotPath,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  cropAndHalve(shotPath, path.join(IMAGES, scene.out));
}
