export interface Person { id: string; name: string; no?: string; unitName?: string }

/** 选人时的匹配：姓名包含或工号前缀；姓名以输入开头的排前面，其次工号前缀，再按工号。和后端 UserSearch 同一口径 */
export function matchPeople<T extends Person>(list: readonly T[], q: string, limit = Infinity): T[] {
  const k = q.trim().toLowerCase();
  if (!k) return list.slice(0, limit);
  const rank = (p: T) => {
    const name = p.name.toLowerCase(), no = (p.no ?? '').toLowerCase();
    if (name.startsWith(k)) return 0;
    if (no.startsWith(k)) return 1;
    return name.includes(k) ? 2 : -1;
  };
  return list.map((p) => ({ p, r: rank(p) })).filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || (a.p.no ?? '').localeCompare(b.p.no ?? ''))
    .slice(0, limit).map((x) => x.p);
}

/** 「姓名 · 工号 · 科室」，重名时靠后两段区分 */
export const personLabel = (p: Person) => [p.name, p.no, p.unitName].filter(Boolean).join(' · ');
