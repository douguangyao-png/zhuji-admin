import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/ui/Icon';

const TONE_VAR = { good: 'good', warn: 'warn', bad: 'crit', flat: 'fg-3' } as const;

export { Tag, StatusTag, SeverityTag } from './Tag';

export function Card({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {(title || note) && (
        <div className="card-h">
          {title && <span className="card-t">{title}</span>}
          {note && <span className="card-s">{note}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'flat';
  delta?: { text: string; dir: 'up' | 'dn' } | null;
  badge?: { text: string; tone?: string } | null;
  /** Given, the card is a button that filters the table below. */
  onClick?: () => void;
  active?: boolean;
}

/** The summary row every feature page opens with. */
export function StatBand({ items }: { items: StatItem[] }) {
  return (
    <div className="kpis" style={{ '--n': items.length } as CSSProperties}>
      {items.map((s) => {
        const body = (
          <>
            <div className="kpi-l">{s.label}</div>
            <div className="kpi-v" style={s.tone ? { color: `var(--${TONE_VAR[s.tone]})` } : undefined}>
              <b>{s.value}</b>
              {s.delta && <span className={`delta ${s.delta.dir}`}>{s.delta.text}</span>}
              {s.badge && <span className={`bd${s.badge.tone ? ` ${s.badge.tone}` : ''}`}>{s.badge.text}</span>}
            </div>
            {s.sub && <div className="kpi-d">{s.sub}</div>}
          </>
        );
        return s.onClick ? (
          <button key={s.key} type="button" className={`kpi${s.active ? ' on' : ''}`} onClick={s.onClick}>
            {body}
          </button>
        ) : (
          <div key={s.key} className={`kpi${s.active ? ' on' : ''}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button type="button" className={`btn${primary ? ' btn-p' : ''}`} onClick={onClick} disabled={disabled}><Icon name="check" />
      {children}
    </button>
  );
}

export const Loading = ({ rows = 5 }: { rows?: number }) => (
  <div className="empty" aria-busy="true" data-rows={rows}><p>加载中…</p></div>
);
export const Empty = ({ text = '暂无数据', sub }: { text?: string; sub?: string }) => <div className="empty"><h4>{text}</h4>{sub && <p>{sub}</p>}</div>;
export const ErrorState = ({ text = '加载失败' }: { text?: string }) => (
  <div className="empty" role="alert"><h4>{text}</h4></div>
);

/** Renders the right one of the three states, or the content. Used by every data surface. */
export function Async<T>({
  query,
  children,
  emptyText,
  skeletonRows,
}: {
  query: { isLoading: boolean; isError: boolean; data: T | undefined };
  children: (data: T) => ReactNode;
  emptyText?: string;
  skeletonRows?: number;
}) {
  if (query.isLoading) return <Loading rows={skeletonRows} />;
  if (query.isError) return <ErrorState />;
  if (query.data === undefined || query.data === null) return <Empty text={emptyText} />;
  if (Array.isArray(query.data) && query.data.length === 0) return <Empty text={emptyText} />;
  return <>{children(query.data)}</>;
}
