import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { MSG_LEVEL_LABEL, type Message, type MsgLevel } from '@/api/types';
import { PageHead } from '@/core/bits';
import { Empty } from '@/ui/primitives';
import { Tabs } from '@/ui/Tabs';
import { LevelLog, LevelMark } from './msg';
import { Icon } from '@/ui/Icon';

const LEVELS: MsgLevel[] = ['urgent', 'important', 'normal', 'minor'];

/** 消息列表：未读的标红点、标题加粗，紧急红标、重要橙标，点开即标为已读并跳到相关页面；升级记录可展开 */
export function MessageList({ items, empty = '没有消息' }: { items: Message[]; empty?: string }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const read = useMutation({ mutationFn: coreApi.readMessage, onSuccess: () => void qc.invalidateQueries({ queryKey: ['messages'] }) });
  if (items.length === 0) return <Empty text={empty} />;
  return (
    <ul className="msg-l" aria-label="消息列表">
      {items.map((m) => (
        <li key={m.id} className={`${m.read ? '' : 'unread'} lv-${m.level ?? 'normal'}`}>
          <button type="button" onClick={() => { if (!m.read) read.mutate(m.id); if (m.link) nav(m.link); }}>
            <i className="msg-dot" role="img" aria-label={m.read ? '已读' : '未读'} title={m.read ? undefined : '未读，点开后标为已读'} />
            <span className="bd">{m.kind}</span>
            <b><LevelMark level={m.level ?? 'normal'} quiet />{m.title}</b>
            <span className="fg3 msg-b">{m.body}</span>
            <span className="mono fg4">{m.at.slice(5, 16)}</span>
          </button>
          <LevelLog m={m} />
        </li>
      ))}
    </ul>
  );
}

export function MessagesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [level, setLevel] = useState<MsgLevel | ''>('');
  const list = useQuery({ queryKey: ['messages', tab, level], queryFn: () => coreApi.messages({ unread: tab === 'unread' ? 1 : undefined, level: level || undefined, size: 200 }) });
  const readAll = useMutation({ mutationFn: coreApi.readAll, onSuccess: () => void qc.invalidateQueries({ queryKey: ['messages'] }) });
  return (
    <div className="page narrow">
      <PageHead title="消息" sub="审批、催办、各模块的提醒和预警等站内消息。未读的按紧急、重要、一般、次要排在前面，读过的按时间排；待办在工作时间里等久了会自动升级。"
        acts={<button type="button" className="btn" disabled={!list.data?.unread || readAll.isPending} onClick={() => readAll.mutate()}><Icon name="check" />全部标为已读</button>} />
      <div className="card">
        <div className="toolbar">
          <Tabs value={tab} onChange={setTab} items={[{ key: 'all', label: '全部' }, { key: 'unread', label: '未读', count: list.data?.unread }]} />
          <div className="chips" role="group" aria-label="等级">
            {(['', ...LEVELS] as const).map((l) => (
              <button key={l || 'all'} type="button" className={`chip${level === l ? ' on' : ''}`} aria-pressed={level === l} onClick={() => setLevel(l)}>{l ? MSG_LEVEL_LABEL[l] : '全部等级'}</button>
            ))}
          </div>
        </div>
        <MessageList items={list.data?.items ?? []} />
      </div>
    </div>
  );
}
