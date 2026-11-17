/**
 * Browser half of the Context compaction meter bundle.
 *
 * Renders ONE context window in `conversation.composer.dock`: the shipped
 * context-usage meter (ring + percent trigger and the click-open panel with the
 * system/tools/messages breakdown) with the compaction information merged into
 * the same panel:
 *   - the current usage (e.g. ~255K / 1M),
 *   - the compaction line (the real trigger threshold), drawn as a marker on
 *     the usage bar at exactly that share of the context window,
 *   - how many compactions this session has run, and
 *   - each past compaction with the threshold line in force for it.
 *
 * The shipped `ContextMeter` renders the same panel but is not an extensible
 * slot, so this plugin renders the merged version and hides the shipped
 * instance with one narrowly scoped rule keyed on the shipped root's inline
 * `anchor-name` style and excluding this component's own root. The rule lives
 * inside the merged component, so when this plugin is disabled or has no data
 * the shipped meter returns untouched.
 */
window.__ModuleLoader__.load({
  id: '@local/context-compaction-meter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let createPortal = null;
    try {
      const dom = require('react-dom');
      createPortal = dom && typeof dom.createPortal === 'function' ? dom.createPortal : null;
    } catch {
      createPortal = null;
    }

    const NS = 'contextCompactionMeter';
    /** Bound once in apply; stable identity, reads the active locale at call time. */
    let boundT = key => key;

    const zh = {
      'usedTemplate': '上下文已用 {percent}',
      'system': '系统提示词',
      'tools': '工具定义',
      'messages': '对话消息',
      'compactionLine': '压缩线',
      'compactions': '已压缩',
      'times': '{count} 次',
      'recordTitle': '压缩记录',
      'recordTitleRecent': '压缩记录（最近 {count} 次）',
      'recordItem': '第 {index} 次',
      'unknown': '未知',
      'aria': '上下文已用 {percent}，点击查看压缩信息',
      'close': '关闭',
    };
    const en = {
      'usedTemplate': '{percent} of context used',
      'system': 'System prompt',
      'tools': 'Tool definitions',
      'messages': 'Messages',
      'compactionLine': 'Compaction line',
      'compactions': 'Compactions',
      'times': '{count}',
      'recordTitle': 'Compaction history',
      'recordTitleRecent': 'Compaction history (latest {count})',
      'recordItem': 'Compaction {index}',
      'unknown': 'Unknown',
      'aria': '{percent} of context used; click for compaction details',
      'close': 'Close',
    };
    const ja = {
      'usedTemplate': 'コンテキストの{percent}を使用中',
      'system': 'システムプロンプト',
      'tools': 'ツール定義',
      'messages': 'メッセージ',
      'compactionLine': '圧縮ライン',
      'compactions': '圧縮回数',
      'times': '{count} 回',
      'recordTitle': '圧縮履歴',
      'recordTitleRecent': '圧縮履歴（直近 {count} 回）',
      'recordItem': '{index} 回目',
      'unknown': '不明',
      'aria': 'コンテキストの{percent}を使用中、クリックで圧縮情報を表示',
      'close': '閉じる',
    };

    /** Fill `{name}` placeholders after translation. */
    function fill(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (whole, name) =>
        params && params[name] !== undefined ? String(params[name]) : whole);
    }

    /** Split a `{percent}` template into the text before and after the reading. */
    function splitTemplate(template) {
      const marker = '{percent}';
      const index = String(template).indexOf(marker);
      if (index < 0) return [String(template), ''];
      return [String(template).slice(0, index), String(template).slice(index + marker.length)];
    }

    /** Compact token count using K / M, matching the shipped meter's figures. */
    function formatTokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      const negative = value < 0 ? '-' : '';
      const magnitude = Math.abs(value);
      if (magnitude < 1000) return `${negative}${Math.round(magnitude)}`;
      const scaled = (candidate, unit) => {
        const text = candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
        return `${negative}${text}${unit}`;
      };
      if (magnitude < 1000000) {
        const k = magnitude / 1000;
        const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
        // 999.5K rounds to 1000K; promote it to M so the reading never shows "1000K".
        if (rounded >= 1000) return scaled(magnitude / 1000000, 'M');
        return `${negative}${rounded}K`;
      }
      return scaled(magnitude / 1000000, 'M');
    }

    /** Proximity band of `used` relative to the compaction line. */
    function levelOf(used, line) {
      if (typeof used !== 'number' || !Number.isFinite(used)) return 'neutral';
      if (typeof line !== 'number' || !Number.isFinite(line) || line <= 0) return 'neutral';
      const ratio = used / line;
      if (ratio < 0.5) return 'green';
      if (ratio <= 0.75) return 'yellow';
      return 'red';
    }

    const LEVEL_COLOR = {
      green: 'var(--dsw-alias-state-success-primary, #2f9e44)',
      yellow: 'var(--dsw-alias-state-warn-primary, #d29922)',
      red: 'var(--dsw-alias-state-error-primary, #d64545)',
      neutral: 'var(--dsw-alias-label-tertiary, #8b8b8b)',
    };

    const STYLE = [
      // Hide the shipped meter while the merged one below is mounted. Scoped to
      // the composer dock, the shipped root's inline anchor-name style, and
      // excluding this component's own root (data-dsh-ccm).
      '[data-composer-dock] > span[style*="anchor-name"]:not([data-dsh-ccm]){display:none !important;}',
      // Second, independent match: any non-ours direct child that owns a dialog
      // trigger is the shipped meter. Keeps the merge working if the shipped
      // root stops carrying an inline anchor-name style. Other composer-dock
      // chips also own a dialog trigger (wb-status `.wb-anchor`, magpie-quota
      // `.dsh-mq-root`), so they are excluded explicitly — otherwise this
      // fallback would hide unrelated plugins' chips.
      '[data-composer-dock] > span:not([data-dsh-ccm]):not(.wb-anchor):not(.dsh-mq-root):has(> button[aria-haspopup="dialog"]){display:none !important;}',
      '.dsh-ccm-root{display:inline-flex;flex:none;}',
      '.dsh-ccm-trigger{display:inline-flex;align-items:center;gap:6px;flex:none;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-family:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;cursor:pointer;}',
      '.dsh-ccm-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}',
      '@media (hover:hover){.dsh-ccm-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}}',
      '.dsh-ccm-trigger:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7bd8));outline-offset:1px;}',
      '.dsh-ccm-ring{display:block;overflow:visible;}',
      '.dsh-ccm-track{fill:none;stroke:var(--dsw-alias-border-l3,rgba(127,127,127,.35));stroke-width:2;}',
      '.dsh-ccm-fill{fill:none;stroke-width:2;stroke-linecap:round;}',
      '.dsh-ccm-pct{font-variant-numeric:tabular-nums;}',
      '.dsh-ccm-panel{position:fixed;z-index:1100;box-sizing:border-box;width:min(264px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:12px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,Canvas);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px));box-shadow:var(--dsw-elevation-prominent,0 8px 28px rgba(0,0,0,.24));font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#666);cursor:default;outline:none;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);}',
      '.dsh-ccm-head{display:flex;align-items:center;gap:6px;}',
      '.dsh-ccm-headline{color:var(--dsw-alias-label-tertiary,#8b8b8b);}',
      '.dsh-ccm-headline:empty{display:none;}',
      '.dsh-ccm-big{font-weight:500;}',
      '.dsh-ccm-figures{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums;}',
      '.dsh-ccm-barbox{position:relative;margin:10px 0 12px;}',
      '.dsh-ccm-bar{display:flex;gap:1px;height:4px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));overflow:hidden;}',
      '.dsh-ccm-seg{flex:none;min-width:2px;height:100%;border-radius:1px;background:var(--meter-tint,var(--dsw-alias-label-tertiary,#8b8b8b));}',
      '.dsh-ccm-line{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;border-radius:1px;background:var(--dsw-alias-state-warn-primary,#d29922);box-shadow:0 0 0 1px var(--dsw-specific-menu,Canvas);}',
      '.dsh-ccm-rows{margin:0;}',
      '.dsh-ccm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0;}',
      '.dsh-ccm-row dt{color:var(--dsw-alias-label-secondary,#666);}',
      '.dsh-ccm-row dd{margin:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,CanvasText);}',
      '.dsh-ccm-swatch{display:inline-block;margin-right:6px;width:8px;height:8px;border-radius:2px;background:var(--meter-tint,var(--dsw-alias-label-tertiary,#8b8b8b));vertical-align:baseline;}',
      '.dsh-ccm-colorSystem{--meter-tint:var(--dsw-alias-chart-system,#8a94a6);}',
      '.dsh-ccm-colorTools{--meter-tint:var(--dsw-alias-chart-tools,#9a7bd0);}',
      '.dsh-ccm-colorMessages{--meter-tint:var(--dsw-alias-chart-messages,#4f8ef0);}',
      '.dsh-ccm-divider{height:1px;margin:8px 0 4px;background:var(--dsw-alias-border-l1,rgba(127,127,127,.25));}',
      '.dsh-ccm-recordtitle{margin-top:6px;color:var(--dsw-alias-label-tertiary,#8b8b8b);}',
      '.dsh-ccm-record{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:1px 0;}',
      '.dsh-ccm-recordv{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,CanvasText);}',
      '.dsh-ccm-close{margin-left:6px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b8b);font-size:16px;line-height:16px;padding:0 2px;cursor:pointer;border-radius:4px;}',
      '.dsh-ccm-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));}',
    ].join('\n');

    /** Ring geometry matching the shipped meter: 14px viewBox, 2px stroke. */
    const RADIUS = 5.5
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS

    function CompactionMeter(props) {
      const t = boundT;
      const pressure = props.useProjection('contextPressure');
      const breakdown = props.useProjection('contextBreakdown');
      const info = props.useProjection('contextCompaction');
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const btnRef = React.useRef(null);
      const panelRef = React.useRef(null);

      const used = pressure === undefined || pressure === null
        ? undefined
        : (pressure.projectedTokens !== undefined ? pressure.projectedTokens : pressure.pressureTokens);
      // Prefer the token meter's capacity; fall back to the projection's copy so
      // a session whose pressure sample is momentarily missing still renders.
      const capacity = pressure !== undefined && pressure !== null
        && typeof pressure.contextWindow === 'number' && pressure.contextWindow > 0
        ? pressure.contextWindow
        : (info && typeof info.contextWindow === 'number' && info.contextWindow > 0 ? info.contextWindow : undefined);
      const percent = typeof used === 'number' && typeof capacity === 'number' && capacity > 0
        ? Math.min(100, Math.max(0, Math.round(used / capacity * 100)))
        : null;
      const count = info && typeof info.count === 'number' ? info.count : 0;
      const ratio = info && typeof info.thresholdRatio === 'number' && info.thresholdRatio > 0
        ? info.thresholdRatio
        : 0.8;
      const line = info && typeof info.thresholdTokens === 'number' && info.thresholdTokens > 0
        ? info.thresholdTokens
        : (typeof capacity === 'number' && capacity > 0 ? Math.floor(capacity * ratio) : null);
      const compactions = info && Array.isArray(info.compactions) ? info.compactions : [];
      const historyTruncated = info !== undefined && info !== null
        && info.historyTruncated === true && compactions.length > 0;

      const unavailable = typeof used !== 'number' || typeof capacity !== 'number' || capacity <= 0;
      const level = levelOf(used, line);
      const levelColor = LEVEL_COLOR[level];
      const reading = `${percent === null ? 0 : percent}%`;
      const ariaText = fill(t('aria'), { percent: reading });
      const usedText = unavailable ? '' : `~${formatTokens(used)} / ${formatTokens(capacity)}`;

      function reposition() {
        const el = btnRef.current;
        if (!el || typeof window === 'undefined') return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(180, Math.min(264, window.innerWidth - 16));
        const margin = 8;
        const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
        const bottom = Math.max(margin, window.innerHeight - rect.top + 8);
        setPos({ left, bottom, width });
      }

      React.useLayoutEffect(() => {
        if (!open) return undefined;
        reposition();
        const panel = panelRef.current;
        if (panel !== null && typeof panel.focus === 'function') panel.focus();
        const onMove = () => reposition();
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        return () => {
          window.removeEventListener('resize', onMove);
          window.removeEventListener('scroll', onMove, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onDown = event => {
          if (panelRef.current && panelRef.current.contains(event.target)) return;
          if (rootRef.current && rootRef.current.contains(event.target)) return;
          setOpen(false);
        };
        const onKey = event => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('pointerdown', onDown, true);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      if (unavailable) return null;

      const [headBefore = '', headAfter = ''] = splitTemplate(t('usedTemplate'))
        .map(part => part.trim());

      // Segmented bar: overall length is the window fraction used; parts split
      // that length by the heuristic composition.
      const breakdownTotal = breakdown === undefined
        ? 0
        : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
      const segments = breakdown === undefined || breakdownTotal === 0
        ? [{ key: 'total', tint: undefined, width: percent }]
        : [
            { key: 'systemTokens', tint: 'dsh-ccm-colorSystem', width: percent * breakdown.systemTokens / breakdownTotal },
            { key: 'toolsTokens', tint: 'dsh-ccm-colorTools', width: percent * breakdown.toolsTokens / breakdownTotal },
            { key: 'messageTokens', tint: 'dsh-ccm-colorMessages', width: percent * breakdown.messageTokens / breakdownTotal },
          ];
      const visibleSegments = segments.filter(segment => segment.width > 0);

      const linePct = typeof line === 'number' && line > 0
        ? Math.min(100, Math.max(0, line / capacity * 100))
        : null;

      const tokensRow = (key, label, tint) => h('div', { key, className: 'dsh-ccm-row' },
        h('dt', null,
          tint === undefined ? null : h('span', { className: `dsh-ccm-swatch ${tint}`, 'aria-hidden': 'true' }),
          label),
        h('dd', null, `~${formatTokens(breakdown === undefined ? 0 : breakdown[key])}`));

      const rows = breakdown === undefined
        ? []
        : [
            tokensRow('systemTokens', t('system'), 'dsh-ccm-colorSystem'),
            tokensRow('toolsTokens', t('tools'), 'dsh-ccm-colorTools'),
            tokensRow('messageTokens', t('messages'), 'dsh-ccm-colorMessages'),
          ];

      const recordRows = compactions.map((entry, index) => h('div', {
        key: entry && entry.seq !== undefined ? entry.seq : index,
        className: 'dsh-ccm-record',
      },
        h('span', null, fill(t('recordItem'), {
          index: entry && typeof entry.ordinal === 'number' ? entry.ordinal : index + 1,
        })),
        h('span', { className: 'dsh-ccm-recordv' }, entry && typeof entry.thresholdTokens === 'number'
          ? formatTokens(entry.thresholdTokens)
          : t('unknown')),
      ));

      const panel = h('div', {
        ref: panelRef,
        className: 'dsh-ccm-panel',
        role: 'dialog',
        tabIndex: -1,
        'aria-label': ariaText,
        style: pos !== null ? { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px` } : undefined,
      },
        h('div', { className: 'dsh-ccm-head' },
          h('span', { className: 'dsh-ccm-headline' }, headBefore),
          h('span', { className: 'dsh-ccm-big', style: { color: levelColor } }, reading),
          h('span', { className: 'dsh-ccm-headline' }, headAfter),
          h('span', { className: 'dsh-ccm-figures', style: { color: levelColor } }, usedText),
          h('button', { type: 'button', className: 'dsh-ccm-close', 'aria-label': t('close'), onClick: () => setOpen(false) }, '×'),
        ),
        h('div', { className: 'dsh-ccm-barbox' },
          h('div', { className: 'dsh-ccm-bar' },
            visibleSegments.map(segment => h('div', {
              key: segment.key,
              className: segment.tint === undefined ? 'dsh-ccm-seg' : `dsh-ccm-seg ${segment.tint}`,
              style: { width: `${segment.width}%` },
            })),
          ),
          linePct === null ? null : h('div', {
            className: 'dsh-ccm-line',
            style: { left: `${linePct}%` },
            title: `${t('compactionLine')}: ${formatTokens(line)}`,
          }),
        ),
        rows.length === 0 ? null : h('dl', { className: 'dsh-ccm-rows' }, rows),
        h('div', { className: 'dsh-ccm-divider' }),
        h('dl', { className: 'dsh-ccm-rows' },
          h('div', { key: 'line', className: 'dsh-ccm-row' },
            h('dt', null, t('compactionLine')),
            h('dd', null, line === null ? t('unknown') : formatTokens(line)),
          ),
          h('div', { key: 'count', className: 'dsh-ccm-row' },
            h('dt', null, t('compactions')),
            h('dd', null, fill(t('times'), { count })),
          ),
        ),
        count > 0 ? h('div', { className: 'dsh-ccm-recordtitle' }, historyTruncated
          ? fill(t('recordTitleRecent'), { count: compactions.length })
          : t('recordTitle')) : null,
        count > 0 ? h('div', null, recordRows) : null,
      );

      return h('span', { ref: rootRef, className: 'dsh-ccm-root', 'data-dsh-ccm': '1' },
        h('style', null, STYLE),
        h('button', {
          ref: btnRef,
          type: 'button',
          className: 'dsh-ccm-trigger',
          title: ariaText,
          'aria-label': ariaText,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: () => setOpen(value => !value),
        },
          h('svg', { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': 'true', className: 'dsh-ccm-ring' },
            h('circle', { className: 'dsh-ccm-track', cx: 7, cy: 7, r: RADIUS }),
            h('circle', {
              className: 'dsh-ccm-fill',
              cx: 7, cy: 7, r: RADIUS,
              stroke: level === 'neutral' ? 'var(--dsw-alias-label-tertiary,#8b8b8b)' : levelColor,
              strokeDasharray: `${CIRCUMFERENCE * (percent === null ? 0 : percent) / 100} ${CIRCUMFERENCE}`,
              transform: 'rotate(-90 7 7)',
            }),
          ),
          h('span', { className: 'dsh-ccm-pct', style: level === 'neutral' ? undefined : { color: levelColor } }, reading),
        ),
        open ? (createPortal ? createPortal(panel, document.body) : panel) : null,
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A reload can re-enter apply before the previous dictionary disposer
        // runs; keep the second mount harmless instead of failing the plugin.
        ctx.effect(() => {
          try { return ctx.locale.register(NS, { zh, en, ja }); }
          catch { return () => {}; }
        });
        boundT = ctx.locale.bind(NS);
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'context-compaction-meter',
          order: 5,
          locale: NS,
        }, CompactionMeter));
      },
      /** Pure helpers and the component exposed for offline logic tests; the Loader ignores extra exports. */
      _internals: { fill, splitTemplate, formatTokens, levelOf, Component: CompactionMeter },
    };
  },
});
