# Changelog

## 1.1.0

- Merge the compaction information into the composer's shipped context-usage window instead of a separate panel: the popover keeps the original header, segmented bar and rows, and appends the compaction line, the compaction count and each compaction's threshold.
- Draw a compaction-line marker on the usage bar at the model's real trigger point, derived as `floor(min(W × thresholdRatio, (W − reservedOutput) − headroomTokens))` — 800K / 80% for the current 1M window with a 128K reservation.
- Color the percentage, `~usage / window`, the ring and the marker by proximity to the line (green below 50%, yellow 50–75%, red above 75%).
- Raise the projection to `stateVersion: 2`: `ordinal`, `compactionId`, `historyTruncated`; bound retained history to the latest 100 compactions; ignore a replayed summary for the same `compactionId`.
- Fail fast on bad row config (unknown key, out-of-range ratio, non-integer headroom).
- Add zh/en/ja copy through the `contextCompactionMeter` locale namespace.
- Add reproducible README mockups (`docs/mockups/generate.cjs`) rendered from the component's own CSS and arithmetic.

## 1.0.0

- First release: a separate composer-dock panel showing the context window, the compaction line and the compaction count.
