import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead, Search } from '@/core/bits';
import { useMeSure } from '@/core/me';
import { fileUrl } from '@/api/files';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Dialog } from '@/ui/Dialog';
import { Seg } from '@/ui/Field';
import { Tabs } from '@/ui/Tabs';
import { Tag } from '@/ui/primitives';
import type { Tone } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { Icon } from '@/ui/Icon';
import { feedbackApi, type Feedback, type FeedbackStatus } from './api';
import { TESTING } from './release';

/** 机器人账号的回复单独标出：账号姓名为 AI_NAME，或正文以「AI回复：」开头；去掉前缀，显示高亮标签 */
export const AI_NAME = 'AI助手';
const AI_PREFIX = /^\s*AI回复[:：]\s*/;
// handlerAt 保留在签名里，接后端时可按账号启用时间判断旧回复
export const splitAi = (text: string, name?: string, _handlerAt?: string) => (AI_PREFIX.test(text) ? { ai: true, text: text.replace(AI_PREFIX, '') }
  : { ai: name === AI_NAME, text });

const STATUS: FeedbackStatus[] = ['待处理', '处理中', '已解决', '不处理'];
const TONE: Record<FeedbackStatus, Tone> = { 待处理: 'warn', 处理中: 'info', 已解决: 'good', 不处理: 'flat' };

const at = (s?: string) => (s ? s.slice(5, 16) : '');

const cols: Columns<Feedback> = [
  { id: 'no', header: '编号', accessorKey: 'no', meta: { className: 'mono', width: 90 } },
  { id: 'at', header: '提交时间', accessorKey: 'createdAt', meta: { className: 'mono', width: 100 }, cell: (c) => at(c.getValue() as string) },
  { id: 'kind', header: '类型', accessorKey: 'kind', meta: { width: 60 } },
  { id: 'page', header: '页面', accessorKey: 'pageTitle', meta: { width: 120 } },
  { id: 'text', header: '内容', accessorKey: 'text', cell: (c) => {
    const f = c.row.original;
    return <span className="cm-cell">{f.images.length ? `[图${f.images.length}] ` : ''}{f.attachments?.length ? `[附件${f.attachments.length}] ` : ''}{c.getValue() as string}</span>;
  } },
  { id: 'reply', header: '最新回复', accessorKey: 'reply', cell: (c) => {
    const last = c.row.original.replies?.filter((x) => x.text).at(-1);
    const raw = last ? last.text : c.row.original.reply?.trim();
    if (!raw) return <span className="fg4">—</span>;
    const { ai, text } = splitAi(raw, last?.name, last ? (last.side === 'handler' ? last.at : undefined) : c.row.original.handledAt ?? c.row.original.updatedAt);
    const admin = !ai && last?.side !== 'submitter';
    const r = `${last?.side === 'submitter' ? '提交人：' : ''}${text}`;
    return <span className="cm-cell" title={ai ? `AI回复：${r}` : admin ? `管理员回复：${r}` : r}>{ai && <span className="ai-tag">AI回复</span>}{admin && <span className="ai-tag admin">管理员回复</span>}{r}</span>;
  } },
  { id: 'fixed', header: '修复时间', accessorKey: 'updatedAt', meta: { className: 'mono', width: 100 }, cell: (c) => {
    const f = c.row.original;
    return f.status === '已解决' ? at(f.handledAt ?? f.updatedAt) : <span className="fg4">—</span>;
  } },
  { id: 'user', header: '提交人', accessorKey: 'userName', meta: { width: 86 } },
  { id: 'status', header: '状态', accessorKey: 'status', meta: { width: 96 }, cell: (c) => (
    <span title={c.row.original.reopened ? `提交人要求再改 ${c.row.original.reopened} 次` : undefined}>
      <Tag tone={TONE[c.getValue() as FeedbackStatus]}>{c.getValue() as string}</Tag>{c.row.original.reopened ? <> <Tag tone="warn">再改</Tag></> : null}
    </span>
  ) },
];

export function FeedbackPage() {
  const me = useMeSure();
  const canAll = TESTING || me.can('sys:feedback');
  const [scope, setScope] = useState(canAll ? 'all' : 'mine');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Feedback | null>(null);
  // 消息里的链接带 ?no=FB-0001，打开就是这一条
  const [sp, setSp] = useSearchParams();
  const no = sp.get('no');
  const list = useQuery({
    queryKey: ['feedback', scope, q],
    queryFn: () => feedbackApi.list({ userId: scope === 'mine' ? me.user.id : undefined, q }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data ?? [];
  useEffect(() => {
    if (!no || !list.data) return;
    const hit = list.data.find((r) => r.no === no);
    if (hit) setOpen(hit);
    setSp((x) => { x.delete('no'); return x; }, { replace: true });
  }, [no, list.data, setSp]);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div className="page">
      <PageHead title="问题反馈" sub="任何页面右下角都能提交；处理后在这里看回复，还有问题可以接着回复或要求再改。" />
      {canAll && <Tabs items={[{ key: 'all', label: '全部' }, { key: 'mine', label: '我提交的' }]} value={scope} onChange={setScope} />}
      <div className="card">
        <div className="toolbar">
          <Search value={q} onChange={setQ} placeholder="编号、内容、页面、提交人" />
          <div className="chips">
            {['', ...STATUS].map((s) => (
              <button key={s || 'all'} type="button" className={`chip${status === s ? ' on' : ''}`} onClick={() => setStatus(s)}>
                {s || '全部'} <span className="n">{s ? count(s) : rows.length}</span>
              </button>
            ))}
          </div>
        </div>
        <DataTable data={status ? rows.filter((r) => r.status === status) : rows} columns={cols} pageId="feedback"
          onRowClick={setOpen} emptyText={scope === 'mine' ? '你还没有提交过反馈' : '还没有反馈'} />
      </div>
      {open && <FeedbackLoader key={open.id} row={open} canHandle={me.can('sys:feedback') || (TESTING && open.userId !== me.user.id)} isMine={open.userId === me.user.id}
        handler={me.user.name} onClose={() => setOpen(null)} />}
    </div>
  );
}

const CLOSED: FeedbackStatus[] = ['已解决', '不处理'];

type DetailProps = { canHandle: boolean; isMine: boolean; handler: string; onClose: () => void };

/** 列表里是摘要（正文、回复只有前 200 字），点开时取完整的一条再显示；每次打开都重新取，不用旧缓存 */
function FeedbackLoader({ row, ...props }: DetailProps & { row: Feedback }) {
  const one = useQuery({ queryKey: ['feedback', 'detail', row.id], queryFn: () => feedbackApi.detail(row.id, row), retry: false, gcTime: 0 });
  const err = one.error as Error | null;
  useEffect(() => { if (err) toast(`${row.no} 加载失败：${err.message}`, { tone: 'bad' }); }, [err, row.no]);
  if (one.data) return <FeedbackDetail f={one.data} {...props} />;
  return (
    <Dialog size="lg" title={`${row.no} · ${row.kind}`} sub={<>{row.userName}（{row.roleNames}）· {row.createdAt.slice(0, 16)}</>} onClose={props.onClose}
      footer={<button type="button" className="btn" onClick={props.onClose}><Icon name="x" />关闭</button>}>
      <div className="fb-detail">
        {err ? (
          <div className="fb-form-row">
            <span className="fg3">加载失败：{err.message}</span>
            <button type="button" className="btn btn-sm" disabled={one.isFetching} onClick={() => void one.refetch()}><Icon name="refresh" />{one.isFetching ? '正在重试…' : '重试'}</button>
          </div>
        ) : <p className="fg3" role="status">正在加载完整内容…</p>}
      </div>
    </Dialog>
  );
}

function FeedbackDetail({ f: init, canHandle, isMine, handler, onClose }: DetailProps & { f: Feedback }) {
  const [f, setF] = useState(init);
  const [status, setStatus] = useState<FeedbackStatus>(init.status === '待处理' ? '处理中' : init.status);
  const [reply, setReply] = useState('');
  const [say, setSay] = useState('');
  const [reopen, setReopen] = useState(false);
  const qc = useQueryClient();
  // 处理、回复后返回的是完整的一条；列表（摘要）和详情都重新取
  const saved = (x: Feedback) => { setF(x); qc.setQueryData(['feedback', 'detail', x.id], x); void qc.invalidateQueries({ queryKey: ['feedback'] }); };
  const save = useMutation({
    mutationFn: () => feedbackApi.handle(f.id, { status, reply: reply.trim(), handler }),
    onSuccess: (x) => { toast(`${f.no} 已更新为${status}`); saved(x); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const send = useMutation({
    mutationFn: () => feedbackApi.say(f.id, { text: say.trim(), reopen: reopen && CLOSED.includes(f.status) }),
    onSuccess: (x) => { toast(x.status !== f.status ? `已回复，${f.no} 回到待处理` : '已回复'); setSay(''); setReopen(false); saved(x); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const replies = f.replies ?? [];
  return (
    <Dialog size="lg" title={`${f.no} · ${f.kind}`} sub={<>{f.userName}（{f.roleNames}）· {f.createdAt.slice(0, 16)}</>} onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}><Icon name="x" />关闭</button>}>
      <div className="fb-detail">
        <p className="fb-text">{f.text}</p>
        {f.images.length > 0 && <div className="fb-imgs big">{f.images.map((src, i) => <a key={i} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={`截图 ${i + 1}`} /></a>)}</div>}
        {(f.attachments?.length ?? 0) > 0 && (
          <div className="fb-files fb-files-view">
            {f.attachments!.map((a) => (
              <a key={a.id} className="fb-file" href={fileUrl(a, true)} target="_blank" rel="noopener noreferrer">
                <Icon name="package" /><span title={a.name}>{a.name}</span><em>{(a.size / 1024 / 1024).toFixed(1)} MB</em><Icon name="download" />
              </a>
            ))}
          </div>
        )}
        <dl className="fb-meta">
          <dt>页面</dt><dd><Link to={f.page} onClick={onClose}>{f.pageTitle}</Link> <span className="mono fg3">{f.page}</span></dd>
          <dt>版本</dt><dd>构建 {f.version} · 窗口 {f.screen}</dd>
          <dt>浏览器</dt><dd className="fg3">{f.ua}</dd>
          <dt>状态</dt><dd><Tag tone={TONE[f.status]}>{f.status}</Tag>{(f.reopened ?? 0) > 0 && <span className="fg3"> · 要求再改 {f.reopened} 次</span>}</dd>
        </dl>
        <div className="fb-thread" aria-label="往来回复">
          <b>往来回复</b>
          {replies.length === 0 ? <div className="fb-reply fg3">还没有回复</div> : replies.map((r, i) => {
            const t = splitAi(r.text ?? '', r.name, r.side === 'handler' ? r.at : undefined);
            const admin = !t.ai && r.side === 'handler';
            return (
            <div key={i} className={`fb-reply ${r.side}${t.ai ? ' by-ai' : admin ? ' by-admin' : ''}`}>
              <div className="fb-reply-h">
                <span>{r.name || (r.side === 'handler' ? '处理人' : '提交人')}</span>
                {t.ai && <span className="ai-tag">AI回复</span>}
                {admin && <span className="ai-tag admin">管理员回复</span>}
                <Tag tone={r.side === 'handler' ? 'info' : 'flat'}>{r.side === 'handler' ? '处理人' : '提交人'}</Tag>
                {r.side === 'handler' && <Tag tone={TONE[r.status]}>{r.status}</Tag>}
                {r.reopen && <Tag tone="warn">要求再改</Tag>}
                <span className="mono fg3">{r.at.slice(5, 16)}</span>
              </div>
              {t.text && <p>{t.text}</p>}
            </div>
            );
          })}
        </div>
        {isMine && (
          <div className="fb-form">
            <textarea className="input" rows={3} value={say} onChange={(e) => setSay(e.target.value)} maxLength={2000}
              placeholder="看了回复还有问题，或要补充说明，写在这里" aria-label="我的回复" />
            <div className="fb-form-row">
              {CLOSED.includes(f.status) && <label className="cbl"><input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} />还需要再改（回到待处理）</label>}
              <button type="button" className="btn btn-p" disabled={send.isPending || !say.trim()} onClick={() => send.mutate()}><Icon name="mail" />回复</button>
            </div>
          </div>
        )}
        {canHandle && (
          <div className="fb-form">
            <div className="fb-form-row">
              <Seg label="状态" value={status} onChange={setStatus} options={STATUS.map((s) => ({ value: s, label: s }))} />
              <span className="push" />
            </div>
            <textarea className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000}
              placeholder="回复提交人：怎么处理的、哪个版本修复" aria-label="回复" />
            <div className="fb-form-row">
              <button type="button" className="btn btn-p" disabled={save.isPending || (!reply.trim() && status === f.status)} onClick={() => save.mutate()}><Icon name="check" />保存处理结果</button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
