import type { HomeRow, HomeRowMode } from '@/api/types';

/** 分列模式：一行分三份，左右两格各占几份 */
export const ROW_MODES: { mode: HomeRowMode; label: string; cols: string }[] = [
  { mode: '1:2', label: '左 1 份 右 2 份（1:2）', cols: '1fr 2fr' },
  { mode: '2:1', label: '左 2 份 右 1 份（2:1）', cols: '2fr 1fr' },
  { mode: '1:1', label: '左右均分（1:1）', cols: '1fr 1fr' },
];
export const colsOf = (m: HomeRowMode) => ROW_MODES.find((x) => x.mode === m)?.cols ?? '1fr 1fr';
export const MAX_ROWS = 30;

/** 没保存过布局时：可用的卡片按顺序两个一行均分 */
export function defaultRows(keys: string[]): HomeRow[] {
  const rows: HomeRow[] = [];
  for (let i = 0; i < keys.length; i += 2) rows.push({ mode: '1:1', cells: [keys[i], keys[i + 1] ?? null] });
  return rows;
}

/** 去掉用不了的卡片（没权限、模块关了、角色不允许）和重复的，空行丢掉 */
export function normalizeRows(rows: HomeRow[], available: ReadonlySet<string>): HomeRow[] {
  const seen = new Set<string>();
  const out: HomeRow[] = [];
  for (const r of rows) {
    const cells = r.cells.map((k) => (k && available.has(k) && !seen.has(k) ? (seen.add(k), k) : null)) as HomeRow['cells'];
    if (cells[0] || cells[1]) out.push({ mode: r.mode, cells });
  }
  return out;
}

export const placed = (rows: HomeRow[]) => new Set(rows.flatMap((r) => r.cells).filter((k): k is string => Boolean(k)));

/** 把卡片放进某一格：它原来在别处就和这一格里的卡片互换，不在任何格里（从「未放置」来）就顶替这一格；key 为空是清空这一格 */
export function placeCard(rows: HomeRow[], r: number, c: 0 | 1, key: string | null): HomeRow[] {
  const next = rows.map((x) => ({ ...x, cells: [...x.cells] as HomeRow['cells'] }));
  if (!next[r]) return rows;
  const old = next[r].cells[c];
  if (key) {
    for (const row of next) {
      const i = row.cells.indexOf(key);
      if (i >= 0) row.cells[i] = old;
    }
  }
  next[r].cells[c] = key;
  return next;
}

export const setMode = (rows: HomeRow[], r: number, mode: HomeRowMode): HomeRow[] => rows.map((x, i) => (i === r ? { ...x, mode } : x));
export const addRow = (rows: HomeRow[]): HomeRow[] => (rows.length >= MAX_ROWS ? rows : [...rows, { mode: '1:1', cells: [null, null] }]);
export const removeRow = (rows: HomeRow[], r: number): HomeRow[] => rows.filter((_, i) => i !== r);
export function moveRow(rows: HomeRow[], r: number, d: -1 | 1): HomeRow[] {
  const t = r + d;
  if (t < 0 || t >= rows.length) return rows;
  const next = [...rows];
  [next[r], next[t]] = [next[t], next[r]];
  return next;
}
