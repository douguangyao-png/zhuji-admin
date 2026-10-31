import { Fragment, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FeatureKey } from '@/api/types';
import { Icon } from '@/ui/Icon';
import { useFeatures, useMeSure } from './me';

/** 单据打开到哪个页面：按顺序取第一个有权限的；hash 是目标页的标签页 */
export interface DocTarget { to: string; perm?: string; feature?: FeatureKey; hash?: string }
const DOCS: Record<string, DocTarget[]> = {};
let docNo = /$^/g;

/**
 * 模块登记自己的单号前缀（两位大写字母），操作日志等文字里出现的单号会变成链接。
 * 单号格式：前缀 + yyyyMMdd + 流水（3 位起），由模拟层 nextNo(prefix) 生成
 */
export function registerDoc(prefix: string, targets: DocTarget[]) {
  if (!/^[A-Z]{2}$/.test(prefix)) throw new Error(`单号前缀要两位大写字母：${prefix}`);
  DOCS[prefix] = targets;
  docNo = new RegExp(`(?<![A-Za-z0-9])(${Object.keys(DOCS).join('|')})\\d{11,}(?!\\d)`, 'g');
}

/** 单号里的日期 yyyy-mm-dd */
export const docDate = (no: string) => no.replace(/^[A-Z]{2}(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3');

/** 单号在哪个页面打开；同一前缀多个模块都用时，可以登记成「模块名:前缀」 */
export function docPath(module: string, no: string, can: (perm?: string) => boolean, on: (f?: FeatureKey) => boolean): string | null {
  const prefix = no.slice(0, 2);
  const hit = (DOCS[`${module}:${prefix}`] ?? DOCS[prefix])?.find((x) => on(x.feature) && can(x.perm));
  return hit ? `${hit.to}?no=${encodeURIComponent(no)}${hit.hash ? `#${hit.hash}` : ''}` : null;
}

/** 把文字里认得出的单号拆出来 */
export function splitDocNos(text: string): { text: string; no?: boolean }[] {
  const out: { text: string; no?: boolean }[] = [];
  let last = 0;
  docNo.lastIndex = 0;
  for (const m of text.matchAll(docNo)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], no: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function useDocPath() {
  const me = useMeSure();
  const f = useFeatures();
  return (module: string, no: string) => docPath(module, no, me.can, f.on);
}

/** 文字里的单号变成链接；没有页面或没有权限的保持文字 */
export function DocText({ module, text }: { module: string; text?: string }) {
  const path = useDocPath();
  if (!text) return null;
  return <>{splitDocNos(text).map((p, i) => {
    const to = p.no ? path(module, p.text) : null;
    return to ? <Link key={i} className="link mono" to={to}>{p.text}</Link> : <Fragment key={i}>{p.text}</Fragment>;
  })}</>;
}

/** 列表页地址上的 ?no=单号；clear 去掉它，回到完整列表 */
export function useDocNo(): [string, () => void] {
  const [sp, setSp] = useSearchParams();
  const no = sp.get('no') ?? '';
  return [no, () => { const next = new URLSearchParams(sp); next.delete('no'); setSp(next, { replace: true }); }];
}

/** 列表里正好一条是这个单号时打开它的详情，只开一次 */
export function useOpenDoc<T>(no: string, rows: T[] | undefined, noOf: (r: T) => string | undefined, open: (r: T) => void) {
  const done = useRef('');
  const fn = useRef({ noOf, open });
  fn.current = { noOf, open };
  useEffect(() => {
    if (!no || done.current === no || !rows) return;
    const hit = rows.filter((r) => fn.current.noOf(r) === no);
    if (hit.length === 1) { done.current = no; fn.current.open(hit[0]); }
  }, [no, rows]);
}

/** 只看某张单时工具栏上的条件，点掉回到完整列表 */
export function DocChip({ no, onClear }: { no: string; onClear: () => void }) {
  if (!no) return null;
  return <button type="button" className="chip on" onClick={onClear} aria-label={`取消只看 ${no}`}>单号 <span className="mono">{no}</span><Icon name="x" /></button>;
}
