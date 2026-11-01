import { useEffect, useState } from 'react';
import { SortTh } from '@/ui/SortTh';
import { useTableSort } from '@/ui/useTableSort';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { UserSyncConfig, UserSyncField, UserSyncLog, UserSyncMode } from '@/api/types';
import { downloadCsv } from '@/core/export';
import { confirm, deleteConfirm } from '@/ui/Confirm';
import { Field, Seg } from '@/ui/Field';
import { Select } from '@/ui/Select';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { GENDER_LABEL } from './people';
import { Icon } from '@/ui/Icon';

const MODE: Record<UserSyncMode, string> = { push: '外部推送', schedule: '定时拉取', manual: '立即同步' };
const FIELD_LABEL: Record<UserSyncField, string> = { no: '工号', name: '姓名', gender: '性别', dept: '部门', phone: '手机号' };

/** 推送地址按当前页面推算，部署在 /app/ 下时为 …/app/api/v1/sync/users */
const pushUrl = () => `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}api/v1/sync/users`;

export function UserSyncPanel() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['user-sync'], queryFn: coreApi.userSync }).data;
  const [f, setF] = useState<UserSyncConfig | null>(null);
  const [secret, setSecret] = useState<{ appKey: string; secret: string } | null>(null);
  useEffect(() => { if (cfg) setF(cfg); }, [cfg]);
  const save = useMutation({
    mutationFn: coreApi.saveUserSync,
    onSuccess: (c) => { qc.setQueryData(['user-sync'], c); toast('已保存'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const regen = useMutation({
    mutationFn: coreApi.newUserSyncSecret,
    onSuccess: (r) => { setSecret(r); void qc.invalidateQueries({ queryKey: ['user-sync'] }); },
  });
  const run = useMutation({
    mutationFn: coreApi.runUserSync,
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: ['user-sync-logs'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      toast(l.ok ? summary(l) : `同步失败：${l.message}`, l.ok ? {} : { tone: 'bad' });
    },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  if (!f) return null;
  const set = <K extends keyof UserSyncConfig>(k: K, v: UserSyncConfig[K]) => setF({ ...f, [k]: v });

  const newSecret = async () => {
    if (f.appKey && !(await confirm({ title: '重新生成密钥？', text: '旧的 AppKey 和密钥立即失效，对接方要换成新的才能继续推送。', okLabel: '重新生成' }))) return;
    regen.mutate();
  };

  return (
    <div className="stack" style={{ padding: 16 }}>
      <label className="sw-l"><button type="button" role="switch" aria-checked={f.enabled} aria-label="启用人员同步" className={`sw${f.enabled ? ' on' : ''}`} onClick={() => set('enabled', !f.enabled)} />
        启用人员同步（外部推送和定时拉取都要先启用；「立即同步」不受影响）</label>

      <section className="stack">
        <h4>推送：外部系统调用本系统</h4>
        <p className="fg3">外部系统按工号批量推送人员，每次最多 1000 条，用 AppKey 和密钥做 HMAC-SM3 签名。字段、签名算法和错误码见接口文档《人员同步接口》。</p>
        {/* 不排序：推送信息，键值对排版 */}
        <table className="tbl">
          <tbody>
            <tr><td style={{ width: 120 }}>推送地址</td><td className="mono">POST {pushUrl()}</td></tr>
            <tr><td>AppKey</td><td className="mono">{f.appKey || '未生成'}</td></tr>
            <tr><td>密钥</td><td>{f.secret ? '已生成（只在生成时显示一次）' : '未生成'}
              <button type="button" className="btn btn-xs btn-g" style={{ marginLeft: 8 }} onClick={() => void newSecret()}><Icon name="arrow" />{f.appKey ? '重新生成' : '生成 AppKey 和密钥'}</button></td></tr>
          </tbody>
        </table>
        {secret && (
          <div className="card-b" role="status" style={{ border: '1px solid var(--line)', borderRadius: 6 }}>
            <p>请现在复制给对接方，关闭后不再显示：</p>
            <p className="mono">AppKey：{secret.appKey}</p>
            <p className="mono" style={{ wordBreak: 'break-all' }}>密钥：{secret.secret}</p>
            <button type="button" className="btn btn-xs" onClick={() => setSecret(null)}><Icon name="copy" />我已复制</button>
          </div>
        )}
      </section>

      <section className="stack">
        <h4>拉取：本系统调用外部人员接口</h4>
        <Field label="实现">{() => <Seg label="实现" value={f.impl} onChange={(v) => set('impl', v)} options={[{ value: 'mock', label: '模拟实现（内置示例数据）' }, { value: 'vendor', label: '外部接口' }]} />}</Field>
        {f.impl === 'vendor' && <>
          <div className="grid g-2">
            <Field label="接口地址（GET）">{(id) => <input id={id} className="input mono" value={f.address} placeholder="https://hr.example.com/api/staff" onChange={(e) => set('address', e.target.value)} />}</Field>
            <Field label="人员列表路径" hint="响应里人员数组的位置，如 data.list；响应本身是数组时留空">{(id) => <input id={id} className="input mono" value={f.listPath} onChange={(e) => set('listPath', e.target.value)} />}</Field>
            <Field label="请求头名" optional>{(id) => <input id={id} className="input mono" value={f.headerName} placeholder="Authorization" onChange={(e) => set('headerName', e.target.value)} />}</Field>
            <Field label="请求头值" optional>{(id) => <input id={id} className="input mono" type="password" value={f.headerValue} onChange={(e) => set('headerValue', e.target.value)} />}</Field>
          </div>
          <div>
            <label>字段映射：每个字段在外部数据里的名称，嵌套用点分隔</label>
            <div className="grid g-3" style={{ marginTop: 6 }}>
              {(Object.keys(FIELD_LABEL) as UserSyncField[]).map((k) => (
                <Field key={k} label={FIELD_LABEL[k]}>{(id) => <input id={id} className="input mono" value={f.fields[k] ?? ''} onChange={(e) => set('fields', { ...f.fields, [k]: e.target.value })} />}</Field>
              ))}
            </div>
          </div>
        </>}
        <div className="grid g-2">
          <label className="sw-l"><button type="button" role="switch" aria-checked={f.scheduleEnabled} aria-label="定时同步" className={`sw${f.scheduleEnabled ? ' on' : ''}`} onClick={() => set('scheduleEnabled', !f.scheduleEnabled)} />
            每天定时同步</label>
          <Field label="同步时间">{(id) => <input id={id} className="input mono" type="time" value={f.scheduleAt} disabled={!f.scheduleEnabled} onChange={(e) => set('scheduleAt', e.target.value)} />}</Field>
        </div>
        <Field label="外部不再返回的人员" hint="只对拉取生效；停用只针对来源为接口同步、没勾「不允许接口修改」的人；外部返回为空时不停用任何人">{() => (
          <Seg label="外部不再返回的人员" value={f.missing} onChange={(v) => set('missing', v)} options={[{ value: 'keep', label: '不处理' }, { value: 'disable', label: '停用账号' }]} />
        )}</Field>
      </section>

      <section className="stack">
        <h4>取值映射</h4>
        <p className="fg3">外部的性别取值不一样时在这里对应，推送和拉取都按它转换；对应不上的条目记为失败。</p>
        <div className="grid g-2">
          <MapEditor title="性别" value={f.genderMap} options={[{ value: 'M', label: GENDER_LABEL.M }, { value: 'F', label: GENDER_LABEL.F }]}
            onChange={(m) => set('genderMap', m as UserSyncConfig['genderMap'])} />
        </div>
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-p" onClick={() => save.mutate(f)}><Icon name="check" />保存</button>
        <button type="button" className="btn" disabled={run.isPending} onClick={() => run.mutate()}><Icon name="arrow" />{run.isPending ? '同步中…' : '立即同步'}</button>
        <span className="fg3">立即同步按已保存的配置执行{f.impl === 'mock' ? '，模拟实现用内置的 7 条示例数据' : ''}</span>
      </div>

      <SyncLogs />
    </div>
  );
}

const summary = (l: UserSyncLog) => `收到 ${l.total} 条：新增 ${l.added}，更新 ${l.updated}，无变化 ${l.unchanged}，跳过 ${l.skipped}，失败 ${l.failed}${l.disabled ? `，停用 ${l.disabled}` : ''}`;

function MapEditor({ title, value, options, onChange }: {
  title: string; value: Record<string, string>; options: { value: string; label: string }[]; onChange: (m: Record<string, string>) => void;
}) {
  const rows = Object.entries(value);
  const put = (i: number, k: string, v: string) => onChange(Object.fromEntries(rows.map((r, j) => (j === i ? [k, v] : r))));
  return (
    // 不排序：取值映射，行内输入框按行位置保存
    <table className="tbl">
      <thead><tr><th>{title} · 外部取值</th><th>本系统</th><th /></tr></thead>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td><input className="input mono" aria-label={`${title}外部取值`} value={k} onChange={(e) => put(i, e.target.value, v)} /></td>
            <td><Select aria-label={`${title}对应`} value={v} onChange={(e) => put(i, k, e.target.value)}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select></td>
            <td className="act"><button type="button" className="btn btn-xs btn-ds" onClick={async () => { if (await deleteConfirm('这一项')) { onChange(Object.fromEntries(rows.filter((_, j) => j !== i))); } }}><Icon name="trash" />删除</button></td>
          </tr>
        ))}
        <tr><td colSpan={3}><button type="button" className="btn btn-xs btn-g" onClick={() => onChange({ ...value, '': options[0].value })} disabled={'' in value}><Icon name="plus" />添加一行</button></td></tr>
      </tbody>
    </table>
  );
}

function SyncLogs() {
  const logs = useQuery({ queryKey: ['user-sync-logs'], queryFn: coreApi.userSyncLogs }).data ?? [];
  const sort = useTableSort(logs, { at: (l) => l.at, mode: (l) => MODE[l.mode] ?? l.mode, total: (l) => l.total, added: (l) => l.added, updated: (l) => l.updated, unchanged: (l) => l.unchanged, skipped: (l) => l.skipped, failed: (l) => l.failed, disabled: (l) => l.disabled, ok: (l) => l.ok });
  const download = async (l: UserSyncLog) => {
    const d = await coreApi.userSyncLog(l.id);
    downloadCsv(`人员同步明细-${l.at.replace(/[: ]/g, '')}`, ['序号', '工号', '姓名', '结果', '原因'], d.lines.map((x) => [x.row ?? '', x.no, x.name, x.result, x.reason ?? '']));
  };
  return (
    <section className="stack">
      <h4>同步记录</h4>
      {!logs.length ? <p className="fg3">还没有同步记录。外部推送、定时拉取和立即同步都会记在这里。</p> : (
        <table className="tbl">
          <thead><tr><SortTh sort={sort} k="at">时间</SortTh><SortTh sort={sort} k="mode">方式</SortTh><SortTh sort={sort} k="total" className="num">收到</SortTh><SortTh sort={sort} k="added" className="num">新增</SortTh><SortTh sort={sort} k="updated" className="num">更新</SortTh><SortTh sort={sort} k="unchanged" className="num">无变化</SortTh><SortTh sort={sort} k="skipped" className="num">跳过</SortTh><SortTh sort={sort} k="failed" className="num">失败</SortTh><SortTh sort={sort} k="disabled" className="num">停用</SortTh><SortTh sort={sort} k="ok">结果</SortTh><th /></tr></thead>
          <tbody>
            {sort.rows.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.at}</td><td>{MODE[l.mode] ?? l.mode}</td>
                <td className="num">{l.total}</td><td className="num">{l.added}</td><td className="num">{l.updated}</td><td className="num">{l.unchanged}</td>
                <td className="num">{l.skipped}</td><td className="num">{l.failed}</td><td className="num">{l.disabled}</td>
                <td>{l.ok ? <Tag tone="good">完成</Tag> : <span title={l.message}><Tag tone="bad">失败</Tag> <span className="fg3">{l.message}</span></span>}</td>
                <td className="act">{l.ok && <button type="button" className="btn btn-xs btn-g" onClick={() => void download(l)}><Icon name="eye" />下载明细</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
