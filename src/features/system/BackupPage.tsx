import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/core/bits';
import { signOut } from '@/core/me';
import { deleteConfirm } from '@/ui/Confirm';
import { DataTable, type Columns } from '@/ui/DataTable';
import { Dialog } from '@/ui/Dialog';
import { Field, Seg } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Tag, type Tone } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { backupApi, CONFIRM_TEXT, MAX_UPLOAD, sizeText, type BackupItem, type BackupSettings, type RestoreResult } from './backup-api';

const TONE: Record<string, Tone> = { manual: 'info', auto: 'good', prerestore: 'warn', upload: 'flat' };
const err = (e: Error) => toast(e.message, { tone: 'bad' });

/**
 * 系统管理 › 备份与恢复：把数据库和附件打成一个 zip，可下载留存；恢复会用备份覆盖现在的全部数据，恢复前自动再备份一份。
 * 只有系统管理员（sys:backup）能进。
 */
export function BackupPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['backups'], queryFn: backupApi.list });
  const [restoring, setRestoring] = useState<BackupItem | null>(null);
  const [done, setDone] = useState<RestoreResult | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['backups'] });
  const create = useMutation({
    mutationFn: backupApi.create,
    onSuccess: (b) => { refresh(); toast(`已备份：${b.tables} 张表 ${b.rows} 行，${b.attachments} 个附件，${sizeText(b.size)}`); },
    onError: err,
  });
  const upload = useMutation({
    mutationFn: backupApi.upload,
    onSuccess: (b) => { refresh(); setRestoring(b); },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: backupApi.remove,
    onSuccess: () => { refresh(); toast('已删除备份'); },
    onError: err,
  });
  const download = (b: BackupItem) => {
    const url = backupApi.downloadUrl(b.name);
    if (!url) { toast('演示环境没有真实的备份文件，接上后端后可下载'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = b.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const askDelete = async (b: BackupItem) => {
    if (await deleteConfirm(`${b.createdAt} 的${b.kindLabel}备份（${b.name}），删除后不能找回`)) remove.mutate(b.name);
  };
  const busy = create.isPending || upload.isPending || Boolean(list.data?.running);
  const cols: Columns<BackupItem> = [
    { id: 'at', header: '备份时间', accessorKey: 'createdAt', meta: { className: 'mono', width: 150 } },
    { id: 'kind', header: '类型', accessorKey: 'kindLabel', cell: (c) => <Tag tone={TONE[c.row.original.kind]}>{c.row.original.kindLabel}</Tag> },
    { id: 'size', header: '大小', accessorKey: 'size', cell: (c) => <span className="mono">{sizeText(c.row.original.size)}</span> },
    { id: 'rows', header: '表 / 行数', accessorKey: 'rows', cell: (c) => c.row.original.error
      ? <span className="f-err">{c.row.original.error}</span>
      : <span className="mono">{c.row.original.tables} 张 / {c.row.original.rows.toLocaleString()} 行</span> },
    { id: 'att', header: '附件数', accessorKey: 'attachments', cell: (c) => <span className="mono" title={c.row.original.missing ? `${c.row.original.missing} 个附件文件在服务器上已找不到，没有备份进去` : undefined}>{c.row.original.attachments}{c.row.original.missing ? `（缺 ${c.row.original.missing}）` : ''}</span> },
    { id: 'op', header: '操作人', accessorFn: (r) => r.operator ?? '—' },
    { id: 'act', header: '', enableSorting: false, meta: { className: 'act' }, cell: (c) => {
      const b = c.row.original;
      return (
        <>
          <button type="button" className="btn btn-xs btn-o" aria-label={`下载 ${b.name}`} onClick={() => download(b)}><Icon name="download" />下载</button>
          <button type="button" className="btn btn-xs btn-o" aria-label={`恢复 ${b.name}`} disabled={busy || Boolean(b.error)} onClick={() => setRestoring(b)}><Icon name="refresh" />恢复</button>
          <button type="button" className="btn btn-xs btn-ds" aria-label={`删除 ${b.name}`} disabled={busy || remove.isPending} onClick={() => void askDelete(b)}><Icon name="trash" />删除</button>
        </>
      );
    } },
  ];
  return (
    <div className="page">
      <PageHead title="备份与恢复" sub="把数据库和附件打成一个 zip 备份包，可下载到别处留存；恢复会用所选备份覆盖现在的全部数据，恢复前系统自动再备份一份。" />
      <SettingsCard dir={list.data?.dir} free={list.data?.freeBytes} />
      <div className="card">
        <div className="toolbar">
          <span className="card-t">备份列表</span>
          <span className="grow" />
          <label className="btn" aria-disabled={busy} style={busy ? { opacity: 0.42, cursor: 'not-allowed', pointerEvents: 'none' } : undefined} title={`备份时下载的 .zip 文件，不超过 ${sizeText(MAX_UPLOAD)}`}>
            <input type="file" accept=".zip,application/zip" hidden disabled={busy} aria-label="上传备份恢复"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
            <Icon name="upload" />{upload.isPending ? '上传中…' : '上传备份恢复'}
          </label>
          <button type="button" className="btn btn-p" disabled={busy} onClick={() => create.mutate()}><Icon name="database" />{create.isPending || list.data?.running === 'backup' ? '备份中…' : '立即备份'}</button>
        </div>
        {list.data?.running === 'restore' && <div className="card-b"><div className="note warn"><Icon name="alert" /><span>系统正在恢复数据，期间不能保存任何修改。</span></div></div>}
        <DataTable data={list.data?.items ?? []} columns={cols} pageId="system-backups" emptyText="还没有备份，点「立即备份」生成第一份" />
      </div>
      {restoring && <RestoreDialog item={restoring} onClose={() => setRestoring(null)} onDone={(r) => { setRestoring(null); setDone(r); }} />}
      {done && <Dialog title="数据已恢复" sub={`${done.tables} 张表 ${done.rows.toLocaleString()} 行，${done.attachments} 个附件`} onClose={() => void signOut()}
        footer={<><span className="push" /><button type="button" className="btn btn-p" onClick={() => void signOut()}><Icon name="logout" />重新登录</button></>}>
        <div className="note warn"><Icon name="alert" /><span>为保证数据一致，所有人都要重新登录。恢复前的数据已另存为备份 <b className="mono">{done.preRestore}</b>，需要时可以再恢复回去。{done.fileErrors > 0 ? `有 ${done.fileErrors} 个附件文件没写回，详见服务器日志。` : ''}</span></div>
      </Dialog>}
    </div>
  );
}

/** 备份目录、可用空间，自动备份开关、时间、保留份数 */
function SettingsCard({ dir, free }: { dir?: string; free?: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['backups', 'settings'], queryFn: backupApi.settings });
  const [f, setF] = useState<BackupSettings | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (s: BackupSettings) => backupApi.saveSettings(s),
    onSuccess: (s) => { qc.setQueryData(['backups', 'settings'], s); toast('已保存备份设置'); },
    onError: err,
  });
  if (!f) return <div className="card"><div className="card-b fg3">读取中…</div></div>;
  const keepOk = Number.isInteger(f.keep) && f.keep >= 1 && f.keep <= 90;
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(f.time);
  const same = q.data && q.data.auto === f.auto && q.data.time === f.time && q.data.keep === f.keep;
  return (
    <div className="card">
      <div className="card-h b"><span className="card-t">备份设置</span></div>
      <div className="card-b stack">
        <div className="fg3" style={{ fontSize: 12.5 }}>备份目录 <span className="mono">{dir ?? '—'}</span>，可用空间 <span className="mono">{free === undefined ? '—' : sizeText(free)}</span>。目录在服务器配置里改。</div>
        <Field label="自动备份">{() => <Seg label="自动备份" value={f.auto ? 'on' : 'off'} onChange={(v) => setF({ ...f, auto: v === 'on' })} options={[{ value: 'on', label: '每天自动备份' }, { value: 'off', label: '不自动备份' }]} />}</Field>
        <div className="row gap">
          <Field label="备份时间" hint="服务器时间，建议放在夜里没人用的时候" error={timeOk ? null : '填 00:00 到 23:59'}>{(id) => <input id={id} type="time" className="input mono" maxLength={5} disabled={!f.auto} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />}</Field>
          <Field label="自动备份保留份数" hint="只删最早的自动备份；手动、恢复前、上传的不自动删" error={keepOk ? null : '填 1 到 90'}>{(id) => <input id={id} type="number" className="input mono" min={1} max={90} maxLength={2} disabled={!f.auto} value={Number.isNaN(f.keep) ? '' : f.keep} onChange={(e) => setF({ ...f, keep: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />}</Field>
        </div>
        <div><button type="button" className="btn btn-p" disabled={save.isPending || !keepOk || !timeOk || Boolean(same)} onClick={() => save.mutate(f)}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button></div>
      </div>
    </div>
  );
}

function RestoreDialog({ item, onClose, onDone }: { item: BackupItem; onClose: () => void; onDone: (r: RestoreResult) => void }) {
  const [pw, setPw] = useState('');
  const [text, setText] = useState('');
  const restore = useMutation({
    mutationFn: () => backupApi.restore(item.name, pw, text.trim()),
    onSuccess: onDone,
    onError: err,
  });
  const ok = Boolean(pw) && text.trim() === CONFIRM_TEXT && !restore.isPending;
  const go = () => { if (ok) restore.mutate(); };
  return (
    <Dialog title="恢复备份" sub={`${item.createdAt} · ${item.kindLabel} · ${item.tables} 张表 ${item.rows.toLocaleString()} 行 · ${item.attachments} 个附件`} onClose={restore.isPending ? () => undefined : onClose}
      footer={<><span className="push" /><button type="button" className="btn" disabled={restore.isPending} onClick={onClose}><Icon name="x" />取消</button>
        <button type="button" className="btn btn-ds" disabled={!ok} onClick={go}><Icon name="refresh" />{restore.isPending ? '恢复中…' : '恢复'}</button></>}>
      <div className="note crit"><Icon name="alert" /><span>会用这份备份覆盖现在的全部数据和附件，备份之后新增、修改的内容都会没有。恢复前会自动再备份一份；恢复期间其他人不能保存修改，完成后所有人要重新登录。</span></div>
      <div className="row gap">
        <Field label="当前账号的密码" required>{(id) => <input id={id} type="password" className="input" autoComplete="current-password" maxLength={64} autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />}</Field>
        <Field label={`输入「${CONFIRM_TEXT}」`} required>{(id) => <input id={id} className="input" maxLength={10} placeholder={CONFIRM_TEXT} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />}</Field>
      </div>
    </Dialog>
  );
}
