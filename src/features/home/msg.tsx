import { useState } from 'react';
import { MSG_LEVEL_LABEL, type Message, type MsgLevel } from '@/api/types';

const CLS: Record<MsgLevel, string> = { urgent: 'bd crit', important: 'bd warn', normal: 'lv-n', minor: 'lv-n' };

/** 紧急红、重要橙，次要用淡色字；quiet 时一般不标 */
export function LevelMark({ level, quiet }: { level: MsgLevel; quiet?: boolean }) {
  if (quiet && level === 'normal') return null;
  return <span className={`lv ${CLS[level]}`}>{MSG_LEVEL_LABEL[level]}</span>;
}

/** 升级记录，默认收起 */
export function LevelLog({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  const log = m.levelLog ?? [];
  if (!log.length) return null;
  return (
    <div className="lv-log">
      <button type="button" className="link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起升级记录' : `升级 ${log.length} 次`}</button>
      {open && (
        <ul aria-label="升级记录">
          {log.map((x, i) => <li key={i}><span className="mono fg4">{x.at.slice(5, 16)}</span>{MSG_LEVEL_LABEL[x.from]} → {MSG_LEVEL_LABEL[x.to]}<span className="fg3">{x.reason}</span></li>)}
        </ul>
      )}
    </div>
  );
}
