import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { MSG_LEVEL_LABEL, type GroupChannel, type MsgLevel, type MsgLevelPolicy, type MsgPolicy, type MsgPushPolicy } from '@/api/types';
import { useMeSure } from '@/core/me';
import { deleteConfirm } from '@/ui/Confirm';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/primitives';
import { Select } from '@/ui/Select';
import { toast } from '@/ui/Toast';

const LEVELS: MsgLevel[] = ['urgent', 'important', 'normal', 'minor'];
const CH: Record<GroupChannel, string> = { wecom: '企业微信', dingtalk: '钉钉' };

/** 策略加载完再建表单，保存后用返回值重建 */
function usePolicy() {
  return useQuery({ queryKey: ['msg-policy'], queryFn: coreApi.msgPolicy });
}
function useSave(what: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<MsgPolicy>) => coreApi.saveMsgPolicy(p),
    onSuccess: (r) => { qc.setQueryData(['msg-policy'], r); toast(`已保存${what}`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
}

const LevelSelect = ({ value, onChange, label }: { value: MsgLevel; onChange: (v: MsgLevel) => void; label: string }) => (
  <Select className="input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as MsgLevel)}>
    {LEVELS.map((l) => <option key={l} value={l}>{MSG_LEVEL_LABEL[l]}</option>)}
  </Select>
);

/** 等待阈值按工作小时显示和输入，存的是工作分钟；空为不升 */
const hours = (m: number | null) => (m == null ? '' : String(Math.round((m / 60) * 100) / 100));
const minutes = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 60));

export function LevelsTab() {
  const pol = usePolicy().data;
  return pol ? <LevelsForm key={JSON.stringify(pol.levels)} value={pol.levels} workHours={pol.workHours} /> : <Loading />;
}

function LevelsForm({ value, workHours }: { value: MsgLevelPolicy; workHours?: string }) {
  const me = useMeSure();
  const [f, setF] = useState(value);
  const [prefixes, setPrefixes] = useState(value.todoPrefixes.join('、'));
  const [kind, setKind] = useState('');
  const save = useSave('消息等级');
  const setRule = (i: number, r: Partial<MsgLevelPolicy['kinds'][number]>) => setF({ ...f, kinds: f.kinds.map((k, j) => (j === i ? { ...k, ...r } : k)) });
  const setKw = (i: number, r: Partial<MsgLevelPolicy['keywords'][number]>) => setF({ ...f, keywords: f.keywords.map((k, j) => (j === i ? { ...k, ...r } : k)) });
  const addKind = () => {
    const k = kind.trim();
    if (!k || f.kinds.some((x) => x.kind === k)) return;
    setF({ ...f, kinds: [...f.kinds.filter((x) => x.kind !== '*'), { kind: k, level: 'normal', importantAfter: null, urgentAfter: null }, ...f.kinds.filter((x) => x.kind === '*')] });
    setKind('');
  };
  const submit = () => save.mutate({ levels: { ...f, todoPrefixes: prefixes.split(/[、,，\s]+/).filter(Boolean) } });
  return (
    <div className="card-b stack">
      <p className="fg3" style={{ fontSize: 12.5 }}>
        消息发出时按类型定默认等级，标题含关键字或离事件开始很近时取更高的等级。待办在工作时间里等到下面的时长后自动升为重要、紧急，只升不降；申请人催办一次升一级。
        未读的消息按紧急、重要、一般、次要排在最前。
      </p>
      <div className="field">
        <label>按类型</label>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl pol-tbl" data-no-sort="行内输入框按行位置保存">
            <thead><tr><th>类型</th><th>默认等级</th><th>待办等多久升为重要</th><th>等多久升为紧急</th><th /></tr></thead>
            <tbody>
              {f.kinds.map((k, i) => (
                <tr key={k.kind}>
                  <td><b>{k.kind === '*' ? '其余类型' : k.kind}</b></td>
                  <td style={{ width: 110 }}><LevelSelect label={`${k.kind === '*' ? '其余类型' : k.kind} 默认等级`} value={k.level} onChange={(v) => setRule(i, { level: v })} /></td>
                  <td><input className="input num-in mono" inputMode="decimal" aria-label={`${k.kind} 升为重要（工作小时）`} placeholder="不升" value={hours(k.importantAfter)} onChange={(e) => setRule(i, { importantAfter: minutes(e.target.value) })} /> <span className="fg3">工作小时</span></td>
                  <td><input className="input num-in mono" inputMode="decimal" aria-label={`${k.kind} 升为紧急（工作小时）`} placeholder="不升" value={hours(k.urgentAfter)} onChange={(e) => setRule(i, { urgentAfter: minutes(e.target.value) })} /> <span className="fg3">工作小时</span></td>
                  <td className="act">{k.kind !== '*' && <button type="button" className="btn btn-xs btn-ds" aria-label={`删除 ${k.kind}`} onClick={async () => { if (await deleteConfirm(`消息类型「${k.kind}」的等级规则`)) setF({ ...f, kinds: f.kinds.filter((_, j) => j !== i) }); }}><Icon name="trash" />删除</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <input className="input" style={{ width: 160 }} aria-label="新类型" placeholder="消息类型，如 示例" value={kind} onChange={(e) => setKind(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!kind.trim()} onClick={addKind}><Icon name="plus" />添加类型</button>
        </div>
        <span className="hint">留空表示不自动升级。工作小时只计工作时间：{workHours ?? '周一至周五 08:00–17:00'}，工作日和上下班时间在「基础配置 › 工作日及时间」里设置，放假和调休按节假日设置。如周五 16:00 发出、等 4 个工作小时，到下周一 11:00 升级。</span>
      </div>
      <div className="field">
        <label>标题关键字</label>
        <div className="stack" style={{ gap: 6 }}>
          {f.keywords.map((k, i) => (
            <div key={i} className="row">
              <input className="input" style={{ width: 160 }} aria-label={`关键字 ${i + 1}`} value={k.keyword} onChange={(e) => setKw(i, { keyword: e.target.value })} />
              <span className="fg3">至少为</span>
              <div style={{ width: 100 }}><LevelSelect label={`关键字 ${i + 1} 等级`} value={k.level} onChange={(v) => setKw(i, { level: v })} /></div>
              <button type="button" className="btn btn-xs btn-ds" aria-label={`删除关键字 ${k.keyword}`} onClick={async () => { if (!k.keyword.trim() || await deleteConfirm(`关键字「${k.keyword}」`)) setF({ ...f, keywords: f.keywords.filter((_, j) => j !== i) }); }}><Icon name="trash" />删除</button>
            </div>
          ))}
          <div><button type="button" className="btn btn-sm" onClick={() => setF({ ...f, keywords: [...f.keywords, { keyword: '', level: 'important' }] })}><Icon name="plus" />添加关键字</button></div>
        </div>
      </div>
      <Field label="也算待办的标题开头" hint="审批待办天然算待办；其余消息标题以这些字开头、且未读时，也按等待时长升级。用顿号隔开。">
        {(id) => <input id={id} className="input" value={prefixes} onChange={(e) => setPrefixes(e.target.value)} />}
      </Field>
      <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
        <Field label="离开始多少分钟内为重要">{(id) => <input id={id} className="input num-in mono" inputMode="numeric" value={f.eventImportantWithin} onChange={(e) => setF({ ...f, eventImportantWithin: Number(e.target.value) || 0 })} />}</Field>
        <Field label="离开始多少分钟内为紧急">{(id) => <input id={id} className="input num-in mono" inputMode="numeric" value={f.eventUrgentWithin} onChange={(e) => setF({ ...f, eventUrgentWithin: Number(e.target.value) || 0 })} />}</Field>
        <Field label="催办间隔（分钟）" hint="同一单同一申请人两次催办至少隔这么久">{(id) => <input id={id} className="input num-in mono" inputMode="numeric" value={f.urgeIntervalMinutes} onChange={(e) => setF({ ...f, urgeIntervalMinutes: Number(e.target.value) || 0 })} />}</Field>
      </div>
      <div className="row">
        <button type="button" className="btn btn-p" disabled={save.isPending || !me.can('sys:device')} onClick={submit}><Icon name="check" />保存</button>
        {!me.can('sys:device') && <span className="fg3">修改要「接口配置」权限</span>}
      </div>
    </div>
  );
}

export function PushTab({ log }: { log: ReactNode }) {
  const pol = usePolicy().data;
  return pol ? <><PushForm key={JSON.stringify(pol.push)} value={pol.push} />{log}</> : <Loading />;
}

function PushForm({ value }: { value: MsgPushPolicy }) {
  const me = useMeSure();
  const groups = useQuery({ queryKey: ['msg-groups'], queryFn: coreApi.msgGroups }).data ?? [];
  const [f, setF] = useState(value);
  const save = useSave('推送策略');
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: coreApi.runMsgPolicy,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['msg-log'] }); void qc.invalidateQueries({ queryKey: ['messages'] }); toast(`升级 ${r.escalated} 条消息，推送 ${r.pushed} 件事`); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const ids = (l: MsgLevel) => f.rules.find((r) => r.level === l)?.groupIds ?? [];
  const flip = (l: MsgLevel, gid: string) => {
    const cur = ids(l);
    const next = cur.includes(gid) ? cur.filter((x) => x !== gid) : [...cur, gid];
    setF({ ...f, rules: [...f.rules.filter((r) => r.level !== l), { level: l, groupIds: next }].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)) });
  };
  return (
    <div className="card-b stack">
      <p className="fg3" style={{ fontSize: 12.5 }}>消息到了下面的等级就推到对应的群机器人。同一件事只推一次，多人收到的同一条消息也只推一次；群里只有等级、标题、单号和链接，标题里的手机号、身份证号打码。</p>
      <label className="sw-l"><button type="button" role="switch" aria-checked={f.enabled} aria-label="按等级推送" className={`sw${f.enabled ? ' on' : ''}`} onClick={() => setF({ ...f, enabled: !f.enabled })} />按消息等级推送到群</label>
      <label className="sw-l"><button type="button" role="switch" aria-checked={f.offHours} aria-label="非工作时间也推" className={`sw${f.offHours ? ' on' : ''}`} onClick={() => setF({ ...f, offHours: !f.offHours })} />非工作时间也推（关闭时等到下一个工作时间再推；工作时间在「基础配置」里设置）</label>
      <table className="tbl" data-no-sort="固定 4 个等级，顺序有意义">
        <thead><tr><th style={{ width: 80 }}>等级</th><th>推到哪些群</th></tr></thead>
        <tbody>
          {LEVELS.map((l) => (
            <tr key={l}>
              <td><b>{MSG_LEVEL_LABEL[l]}</b></td>
              <td className="wrap">
                {groups.length === 0 ? <span className="fg3">还没有群机器人，先在「群机器人」里添加</span> : (
                  <div className="chips" role="group" aria-label={`${MSG_LEVEL_LABEL[l]}推到`}>
                    {groups.map((g) => (
                      <button key={g.id} type="button" className={`chip${ids(l).includes(g.id) ? ' on' : ''}`} aria-pressed={ids(l).includes(g.id)} disabled={!g.enabled} title={g.enabled ? undefined : '群机器人已停用'} onClick={() => flip(l, g.id)}>
                        {ids(l).includes(g.id) && <Icon name="check" />}{CH[g.channel]} · {g.name}
                      </button>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Field label="失败重试次数">{(id) => <input id={id} className="input num-in mono" inputMode="numeric" value={f.retries} onChange={(e) => setF({ ...f, retries: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
      <div className="row">
        <button type="button" className="btn btn-p" disabled={save.isPending || !me.can('sys:device')} onClick={() => save.mutate({ push: f })}><Icon name="check" />保存</button>
        <button type="button" className="btn" disabled={run.isPending || !me.can('sys:device')} title="非工作时间不升级；不推时等到工作时间" onClick={() => run.mutate()}><Icon name="play" />立即执行一次升级和推送</button>
        {!me.can('sys:device') && <span className="fg3">修改要「接口配置」权限</span>}
      </div>
    </div>
  );
}
