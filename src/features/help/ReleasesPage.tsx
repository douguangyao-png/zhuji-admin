import { Link } from 'react-router-dom';
import { PageHead } from '@/core/bits';
import { RELEASES } from './releases';
import './help.css';

export function ReleasesPage() {
  return (
    <div className="page narrow hr">
      <PageHead title="版本说明" sub="演示环境每次更新的内容；点「查看」进入对应页面。" />
      {RELEASES.map((r) => (
        <div key={r.ver} className="card hr-rel">
          <div className="hr-h"><b>{r.ver}</b><span className="fg3 mono">{r.date}</span></div>
          {r.note && <p className="fg2">{r.note}</p>}
          {r.groups.map((g) => (
            <div key={g.title}>
              <h4>{g.title}</h4>
              <ul>{g.items.map((it) => <li key={it.text}>{it.text}{it.to && <> <Link className="link" to={it.to}>查看</Link></>}</li>)}</ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
