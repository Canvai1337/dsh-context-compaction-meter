/**
 * Host half of the Context compaction meter bundle.
 *
 * Registers one session-projection unit, `contextCompaction`, that folds the
 * durable log into a small client-visible summary:
 *   - how many successful context compactions the session log contains
 *     (each `compaction/summary` event is one completed compaction);
 *   - the compaction line (threshold) in force for each of them;
 *   - the current line, derived from the newest route capacity and the
 *     newest request's output reservation.
 *
 * The threshold mirrors the shipped compaction policy's budget:
 *   floor(min(W * thresholdRatio, (W - reservedOutput) - headroomTokens))
 * `W` is the adapter-owned context window from `request/context`, and
 * `reservedOutput` is the routed request's materialized `maxTokens` from
 * `request/header` (the same value `dsh-compaction-basic` passes as its output
 * reservation). Deployments that tune `dsh-compaction-basic` should pass the
 * same `thresholdRatio` / `headroomTokens` in this bundle row's config.
 *
 * No schema library is imported: the projection registry only calls
 * `stateSchema.parse` and `viewSchema.parse`, so a passthrough parser is both
 * sufficient and dependency-free. The fold still validates its own config so a
 * mistyped ratio or headroom fails fast instead of silently mis-drawing the
 * compaction line.
 */

export const name = 'context-compaction-meter'

/** The projection registry is the whole purpose of the Host half. */
export const inject = ['sessionProjections']

const DEFAULT_THRESHOLD_RATIO = 0.8
const DEFAULT_HEADROOM_TOKENS = 65536
/** Bound the retained history so a very long session cannot bloat the state or the wire value. */
const MAX_COMPACTIONS = 100
const CONFIG_KEYS = new Set(['thresholdRatio', 'headroomTokens'])

/**
 * Validate and detach the optional row configuration.
 * @param config - untrusted config from the bundle row, when present.
 * @returns the resolved `{ thresholdRatio, headroomTokens }`.
 * @throws when a key is unknown or a value is out of range.
 */
function resolveConfig(config) {
  if (config === undefined || config === null) {
    return { thresholdRatio: DEFAULT_THRESHOLD_RATIO, headroomTokens: DEFAULT_HEADROOM_TOKENS }
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('context-compaction-meter: config must be an object')
  }
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key)) {
      throw new Error(`context-compaction-meter: unknown config key "${key}"`)
    }
  }
  const thresholdRatio = config.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO
  if (typeof thresholdRatio !== 'number' || !Number.isFinite(thresholdRatio)
    || thresholdRatio <= 0 || thresholdRatio > 1) {
    throw new Error('context-compaction-meter: thresholdRatio must be a number in (0, 1]')
  }
  const headroomTokens = config.headroomTokens ?? DEFAULT_HEADROOM_TOKENS
  if (typeof headroomTokens !== 'number' || !Number.isInteger(headroomTokens) || headroomTokens < 0) {
    throw new Error('context-compaction-meter: headroomTokens must be a non-negative integer')
  }
  return { thresholdRatio, headroomTokens }
}

/**
 * Resolve the compaction trigger line for one route.
 * @param contextWindow - adapter context capacity, when advertised.
 * @param reservedTokens - output tokens the routed request reserves.
 * @param ratio - window fraction from the compaction policy.
 * @param headroom - extra pressure headroom from the compaction policy.
 * @returns the threshold in tokens, or null while capacity is unknown.
 */
function thresholdOf(contextWindow, reservedTokens, ratio, headroom) {
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return null
  const reserved = typeof reservedTokens === 'number' && Number.isFinite(reservedTokens) && reservedTokens > 0
    ? reservedTokens
    : 0
  const pressureBudget = contextWindow - reserved - headroom
  const threshold = Math.floor(Math.min(contextWindow * ratio, pressureBudget))
  return threshold > 0 ? threshold : null
}

/** A permissive parser: the registry's only schema operations are `.parse`. */
const passthrough = Object.freeze({ parse: value => value })

/** Read a finite non-negative number from an untrusted value, else null. */
function finiteCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Mount the projection unit.
 * @param ctx - Host runtime carrying the projection registry.
 * @param config - optional `thresholdRatio` / `headroomTokens` overrides.
 * @returns when the unit is registered.
 */
export async function apply(ctx, config) {
  const { thresholdRatio, headroomTokens } = resolveConfig(config)

  /** Plain-JSON fold state; doubles as the wire value (same reference when unchanged). */
  const initialState = () => ({
    contextWindow: null,
    reservedTokens: null,
    thresholdRatio,
    thresholdTokens: null,
    count: 0,
    /** True once older entries were dropped to stay under MAX_COMPACTIONS. */
    historyTruncated: false,
    compactions: [],
  })

  /**
   * Fold one committed event into the compaction summary.
   * @param state - previous plain-JSON state.
   * @param event - one committed session event.
   * @returns the same reference when nothing relevant changed.
   */
  function applyEvent(state, event) {
    const data = event && event.data !== null && typeof event.data === 'object' ? event.data : {}
    switch (event.type) {
      case 'request/context': {
        const capacity = data.contextWindow
        if (typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0
          && capacity !== state.contextWindow) {
          const next = { ...state, contextWindow: capacity }
          next.thresholdTokens = thresholdOf(next.contextWindow, next.reservedTokens, thresholdRatio, headroomTokens)
          return next
        }
        return state
      }
      case 'request/header': {
        const config = data.header && typeof data.header === 'object' ? data.header.config : undefined
        const maxTokens = config && typeof config === 'object' ? config.maxTokens : undefined
        const reserved = finiteCount(maxTokens)
        if (reserved === state.reservedTokens) return state
        const next = { ...state, reservedTokens: reserved }
        next.thresholdTokens = thresholdOf(next.contextWindow, next.reservedTokens, thresholdRatio, headroomTokens)
        return next
      }
      case 'compaction/summary': {
        const compactionId = typeof data.compactionId === 'string' ? data.compactionId : null
        const last = state.compactions.length > 0 ? state.compactions[state.compactions.length - 1] : undefined
        // A replayed duplicate summary for the newest compaction is ignored.
        if (compactionId !== null && last !== undefined && last.compactionId === compactionId) return state
        const threshold = thresholdOf(state.contextWindow, state.reservedTokens, thresholdRatio, headroomTokens)
        const entry = {
          seq: event.seq,
          ordinal: state.count + 1,
          compactionId,
          thresholdTokens: threshold,
          shadowedTokenCount: finiteCount(data.shadowedTokenCount),
        }
        const appended = [...state.compactions, entry]
        const dropped = Math.max(0, appended.length - MAX_COMPACTIONS)
        return {
          ...state,
          count: state.count + 1,
          historyTruncated: state.historyTruncated || dropped > 0,
          compactions: dropped > 0 ? appended.slice(dropped) : appended,
          ...threshold !== null ? { thresholdTokens: threshold } : {},
        }
      }
      default:
        return state
    }
  }

  const definition = {
    key: 'contextCompaction',
    // v2 adds `ordinal`, `compactionId`, and `historyTruncated`; stale v1
    // checkpoints are discarded and refolded from the log.
    stateVersion: 2,
    stateSchema: passthrough,
    init: initialState,
    apply: applyEvent,
    // The state is already exactly the wire shape; returning it keeps the
    // same reference while nothing changed, suppressing needless publication.
    wire: { viewSchema: passthrough, view: state => state, summary: false },
  }

  await ctx.sessionProjections.register(definition)
}
