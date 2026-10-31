import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import type { GroupChannel, MsgGroup, MsgRule } from '@/api/types';
import { PageHead, SelectFilter } from '@/core/bits';
import { deleteConfirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field, Seg } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Tabs } from '@/ui/Tabs';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { LevelsTab, PushTab } from './MsgPolicyTabs';

const CH: Record<GroupChannel | 'site', string> = { wecom: '企业微信', dingtalk: '钉钉', site: '站内消息' };

export function NotifyPage() {
  const [tab, setTab] = useState('rules');
  return (
    <div className="page">
      <PageHead title="消息推送" sub="业务事件按推送规则推送到钉钉群、企业微信群，同时给本人发站内消息；紧急、重要消息按推送策略推到群里。" />
      <div className="card">
        <div className="toolbar"><Tabs value={tab} onChange={setTab} items={[{ key: 'rules', label: '推送规则' }, { key: 'levels', label: '消息等级' }, { key: 'push', label: '推送策略' }, { key: 'groups', label: '群机器人' }, { key: 'log', label: '发送记录' }]} /></div>
        {tab === 'rules' ? <Rules /> : tab === 'levels' ? <LevelsTab /> : tab === 'push' ? <PushTab log={<Log event="push" />} /> : tab === 'groups' ? <Groups /> : <Log />}
      </div>
    </div>
  );
}

function Rules() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ['msg-rules'], queryFn: coreApi.msgRules }).data ?? [];
  const groups = useQuery({ queryKey: ['msg-groups'], queryFn: coreApi.msgGroups }).data ?? [];
  const [edit, setEdit] = useState<MsgRule | null>(null);
  const save = useMutation({ mutationFn: coreApi.saveMsgRule, onSuccess: () => void qc.invalidateQueries({ queryKey: ['msg-rules'] }) });
  const name = (id: string) => groups.find((g) => g.id === id);
  return (
    <>
      <table className="tbl">
        <thead><tr><th>事件</th><th>什么时候发</th><th>发到</th><th>启用</th><th /></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td><span className="fg3">{r.module} · </span><b>{r.name}</b></td>
              <td className="fg3">{r.when}</td>
              <td className="wrap">
                <div className="chips">
                  {r.site && <span className="bd">站内消息</span>}
                  {r.groupIds.map((id) => name(id) && <span key={id} className={`bd ch-${name(id)!.channel}`}>{CH[name(id)!.channel]} · {name(id)!.name}</span>)}
                  {r.atApplicant && <span className="fg3">群里 @ 本人</span>}
                </div>
              </td>
              <td><button type="button" role="switch" aria-checked={r.enabled} aria-label={`${r.name} 启用`} className={`sw${r.enabled ? ' on' : ''}`} onClick={() => save.mutate({ ...r, enabled: !r.enabled })} /></td>
              <td className="act"><button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(r)}><Icon name="pencil" />编辑</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <RuleDialog rule={edit} groups={groups} onClose={() => setEdit(null)} />}
    </>
  );
}

const VARS: Record<string, string> = {
  // 模板里能用的变量，按事件名的前缀（模块）分组；新模块在这里加一行
  example: '{applicant} 申请人 {dept} 部门 {title} 标题和单号 {amount} 金额',
};

function RuleDialog({ rule, groups, onClose }: { rule: MsgRule; groups: MsgGroup[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(rule);
  const save = useMutation({
    mutationFn: coreApi.saveMsgRule,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['msg-rules'] }); toast('已保存'); onClose(); },
  });
  const flip = (id: string) => setF({ ...f, groupIds: f.groupIds.includes(id) ? f.groupIds.filter((x) => x !== id) : [...f.groupIds, id] });
  return (
    <Dialog title={`推送规则 · ${rule.module} · ${rule.name}`} sub={rule.when} size="lg" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" onClick={() => save.mutate(f)}><Icon name="check" />保存</button></>}>
      <div className="stack">
        <div className="field">
          <label>发到哪些群</label>
          <div className="chips">
            {groups.map((g) => (
              <button key={g.id} type="button" className={`chip${f.groupIds.includes(g.id) ? ' on' : ''}`} aria-pressed={f.groupIds.includes(g.id)} onClick={() => flip(g.id)}>
                {f.groupIds.includes(g.id) && <Icon name="check" />}{CH[g.channel]} · {g.name}
              </button>
            ))}
          </div>
        </div>
        <label className="sw-l"><button type="button" role="switch" aria-checked={f.site} aria-label="站内消息" className={`sw${f.site ? ' on' : ''}`} onClick={() => setF({ ...f, site: !f.site })} />同时给本人发站内消息</label>
        <label className="sw-l"><button type="button" role="switch" aria-checked={f.atApplicant} aria-label="群里 @ 本人" className={`sw${f.atApplicant ? ' on' : ''}`} onClick={() => setF({ ...f, atApplicant: !f.atApplicant })} />群消息里 @ 本人（按手机号）</label>
        <Field label="消息模板" hint={<>可用变量：<span className="mono">{VARS[rule.id.split('.')[0]]}</span></>}>
          {(id) => <textarea id={id} className="input mono" rows={6} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

function Groups() {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['msg-groups'], queryFn: coreApi.msgGroups }).data ?? [];
  const [edit, setEdit] = useState<Partial<MsgGroup> | null>(null);
  const test = useMutation({ mutationFn: coreApi.testMsgGroup, onSuccess: (r) => { toast(r.detail); void qc.invalidateQueries({ queryKey: ['msg-log'] }); }, onError: (e: Error) => toast(e.message, { tone: 'bad' }) });
  const del = useMutation({ mutationFn: coreApi.deleteMsgGroup, onSuccess: () => void qc.invalidateQueries({ queryKey: ['msg-groups'] }), onError: (e: Error) => toast(e.message, { tone: 'bad' }) });
  return (
    <>
      <div className="toolbar" style={{ paddingTop: 0 }}>
        <span className="fg3" style={{ fontSize: 12.5 }}>在钉钉群或企业微信群里添加「自定义机器人」，把 Webhook 地址填到这里。内网环境需开通到 oapi.dingtalk.com / qyapi.weixin.qq.com 的出口，或使用私有化部署版。</span>
        <span className="push" />
        <button type="button" className="btn btn-sm" onClick={() => setEdit({ channel: 'wecom', enabled: true })}><Icon name="plus" />添加群</button>
      </div>
      <table className="tbl">
        <thead><tr><th>群</th><th>渠道</th><th>Webhook</th><th>加签</th><th>状态</th><th /></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td><b>{g.name}</b></td>
              <td><span className={`bd ch-${g.channel}`}>{CH[g.channel]}</span></td>
              <td className="mono cm-cell">{g.webhook || '—'}</td>
              <td>{g.channel === 'dingtalk' ? (g.secret ? '已配置' : '未配置') : '—'}</td>
              <td><Tag tone={g.enabled ? 'good' : 'flat'}>{g.enabled ? '启用' : '停用'}</Tag></td>
              <td className="act">
                <button type="button" className="btn btn-xs btn-g" onClick={() => test.mutate(g.id)}><Icon name="arrow" />发测试消息</button>
                <button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(g)}><Icon name="pencil" />编辑</button>
                <button type="button" className="btn btn-xs btn-ds" onClick={async () => { if (await deleteConfirm(g.name)) del.mutate(g.id); }}><Icon name="trash" />删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <GroupDialog g={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function GroupDialog({ g, onClose }: { g: Partial<MsgGroup>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(g);
  const save = useMutation({
    mutationFn: coreApi.saveMsgGroup,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['msg-groups'] }); toast('已保存'); onClose(); },
  });
  return (
    <Dialog title={g.id ? `编辑 · ${g.name}` : '添加群机器人'} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!f.name?.trim() || !f.webhook?.trim()} onClick={() => save.mutate(f)}><Icon name="check" />保存</button></>}>
      <div className="stack">
        <Field label="渠道">{() => <Seg label="渠道" value={f.channel ?? 'wecom'} onChange={(v) => setF({ ...f, channel: v })} options={[{ value: 'wecom', label: '企业微信' }, { value: 'dingtalk', label: '钉钉' }]} />}</Field>
        <Field label="群名称" required>{(id) => <input id={id} className="input" value={f.name ?? ''} placeholder="如 业务工作群" onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Webhook 地址" required>{(id) => <input id={id} className="input mono" value={f.webhook ?? ''}
          placeholder={f.channel === 'dingtalk' ? 'https://oapi.dingtalk.com/robot/send?access_token=…' : 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…'} onChange={(e) => setF({ ...f, webhook: e.target.value })} />}</Field>
        {f.channel === 'dingtalk' && (
          <Field label="加签密钥" optional hint="钉钉机器人安全设置选「加签」时填写，以 SEC 开头">{(id) => <input id={id} className="input mono" value={f.secret ?? ''} onChange={(e) => setF({ ...f, secret: e.target.value })} />}</Field>
        )}
      </div>
    </Dialog>
  );
}

/** event='push' 时只看按消息等级推送的记录 */
function Log({ event }: { event?: string }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState('group');
  const log = useQuery({ queryKey: ['msg-log', channel, event], queryFn: () => coreApi.msgLog({ channel, event }) }).data ?? [];
  const run = useMutation({ mutationFn: coreApi.runJobs, onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['msg-log'] }); toast(r.sent ? `发出 ${r.sent} 条提醒` : '今天的提醒都已发过'); } });
  return (
    <>
      <div className="toolbar" style={{ paddingTop: 0 }}>
        <SelectFilter label="渠道" value={channel} onChange={setChannel} all="全部" options={[{ value: 'group', label: '群消息' }, { value: 'wecom', label: '企业微信' }, { value: 'dingtalk', label: '钉钉' }, { value: 'site', label: '站内消息' }]} multi />
        {event === 'push' && <b style={{ fontSize: 13 }}>推送记录</b>}
        <span className="push" />
        {!event && <button type="button" className="btn btn-sm" onClick={() => run.mutate()}><Icon name="clock" />立即执行今天的定时提醒</button>}
      </div>
      {log.length === 0 ? <div className="empty"><h4>还没有发送记录</h4><p>{event === 'push' ? '紧急、重要消息推到群里后会出现在这里' : '事件发生、设备借出、到期提醒发出后会出现在这里'}</p></div> : (
        <div className="chat-l">
          {log.map((l) => (
            <div key={l.id} className="chat">
              <div className="chat-h"><span className={`bd ch-${l.channel}`}>{CH[l.channel]}</span><b>{l.target}</b>{!l.ok && <span className="bd crit">发送失败</span>}<span className="mono fg4">{l.at}</span></div>
              <div className="chat-b">{l.text.split('\n').map((line, i) => <p key={i} className={line.startsWith('@') ? 'at' : i === 0 ? 'ttl' : undefined}>{line}</p>)}{l.error && <p className="err">失败原因：{l.error}</p>}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
