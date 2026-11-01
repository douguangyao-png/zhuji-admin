import { useEffect, useRef } from 'react';
import { SortTh } from '@/ui/SortTh';
import { useTableSort } from '@/ui/useTableSort';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHead } from '@/core/bits';
import { useFeatures, useMeSure } from '@/core/me';
import { useMenuNames } from '@/core/menu-names';
import { Icon } from '@/ui/Icon';
import { TOPICS, type Section, type Table } from './guide';
import './help.css';

function Steps({ steps }: { steps: NonNullable<Section['steps']> }) {
  const me = useMeSure();
  const { text } = useMenuNames();
  return (
    <ol className="hg-steps">
      {steps.map((s, i) => (
        <li key={s.title} className="card hg-step">
          <div className="hg-ic"><Icon name={s.icon} /></div>
          <div className="hg-sb">
            <div className="hg-sh">
              <b>{i + 1}. {s.title}</b>
              <span className="bd">{s.who}</span>
              {s.to && me.can(s.perm) && <Link className="link hg-open" to={s.to}>打开 →</Link>}
            </div>
            <ul>{s.body.map((b) => <li key={b}>{text(b)}</li>)}</ul>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Tbl({ t }: { t: Table }) {
  const { text } = useMenuNames();
  const sort = useTableSort(t.rows, Object.fromEntries(t.head.map((_, i) => [String(i), (r: string[]) => r[i]])));
  return (
  <div className="card hg-tbl">
    <div className="card-h b"><span className="card-t">{t.title}</span></div>
    <div className="tw">
      <table className="tbl">
        <thead><tr>{t.head.map((h, i) => <SortTh key={h} sort={sort} k={String(i)}>{h}</SortTh>)}</tr></thead>
        <tbody>{sort.rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{i === 0 ? <b>{text(c)}</b> : text(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>
  );
}

export function GuidePage() {
  const f = useFeatures();
  const { text } = useMenuNames();
  const [sp] = useSearchParams();
  const topics = TOPICS.filter((t) => !t.show || t.show(f));
  const cur = topics.find((t) => t.key === sp.get('t')) ?? topics[0];
  const nav = useRef<HTMLElement>(null);
  // 窄屏上主题是横向一排，把当前主题滚到可见处
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('a.on');
    if (nav.current && el) nav.current.scrollLeft += el.getBoundingClientRect().left - nav.current.getBoundingClientRect().left - 16;
  }, [cur.key]);
  return (
    <div className="page hg">
      <PageHead title="操作说明" sub="按业务写清每一步谁来做、在哪一页做；点「打开」进入对应页面，没有权限的页面不显示。" />
      <div className="hg-body">
        <nav ref={nav} className="hg-nav" aria-label="操作说明主题">
          {topics.map((t) => (
            <Link key={t.key} to={{ search: `?t=${t.key}` }} replace className={t === cur ? 'on' : undefined} aria-current={t === cur ? 'page' : undefined}>{t.title}</Link>
          ))}
        </nav>
        <article className="hg-main">
          <h2>{cur.title}</h2>
          <p className="hg-sub">{text(cur.sub)}</p>
          {cur.sections.filter((s) => !s.show || s.show(f)).map((s, i) => (
            <section key={s.title ?? i}>
              {s.title && <h3>{s.title}</h3>}
              {s.flow && (
                <div className="hg-flow" aria-label="流程">
                  {s.flow.map((x, k) => <span key={x}><b>{x}</b>{k < s.flow!.length - 1 && <Icon name="right" />}</span>)}
                </div>
              )}
              {s.steps && <Steps steps={s.steps} />}
              {s.tables?.map((t) => <Tbl key={t.title} t={t} />)}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
