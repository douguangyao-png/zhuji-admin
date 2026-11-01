import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi } from '@/api/core';
import { PERM_GROUPS } from '@/api/perms';
import type { DataScope, Role, Terminal } from '@/api/types';
import { PageHead } from '@/core/bits';
import { useFeatures } from '@/core/me';
import { HOME_COMPONENTS } from '@/features/home/catalog';
import { Select } from '@/ui/Select';
import { confirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/primitives';
import { toast } from '@/ui/Toast';
import { SideFoldButton, SideGrid } from '@/ui/SidePane';

/** 角色名称、说明最多几个字，与后端 RoleService 一致 */
const NAME_MAX = 20;
const DESC_MAX = 100;
const GUEST = 'guest';

export function RolesPage() {
  const qc = useQueryClient();
  const f = useFeatures();
  const roles = useQuery({ queryKey: ['roles'], queryFn: coreApi.roles });
  const [cur, setCur] = useState<string>('');
  const [perms, setPerms] = useState<string[]>([]);
  const [scope, setScope] = useState<ScopeFields>({});
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const list = (roles.data ?? []);
  const role = list.find((r) => r.key === cur) ?? list[1] ?? list[0];
  useEffect(() => { if (role) { setPerms(role.perms); setScope(scopeOf(role)); } }, [role?.key, role?.perms.join(), JSON.stringify(role && scopeOf(role))]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: coreApi.saveRole,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['roles'] }); void qc.invalidateQueries({ queryKey: ['me'] }); toast('权限已保存'); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  // 删除自定义角色：从人员上去掉，去掉后没有角色的改为普通用户
  const remove = useMutation({
    mutationFn: coreApi.deleteRole,
    onSuccess: (r) => {
      setCur('');
      void qc.invalidateQueries({ queryKey: ['roles'] }); void qc.invalidateQueries({ queryKey: ['users'] }); void qc.invalidateQueries({ queryKey: ['peopleCategories'] });
      toast(`已删除，${r.removed} 人移除该角色，${r.toUser} 人改为普通用户`);
    },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  if (!role) return <div className="page"><Loading /></div>;

  const all = role.perms.includes('*');
  const guest = role.key === GUEST;
  const dirty = perms.slice().sort().join() !== role.perms.slice().sort().join() || JSON.stringify(scope) !== JSON.stringify(scopeOf(role));
  // 「公开访问」几项只对游客有意义，只在游客下显示；游客可以勾权限目录里的任意权限点
  const groups = PERM_GROUPS.filter((g) => f.on(g.feature));
  const flip = (p: string) => {
    if (guest && !perms.includes(p)) toast('不登录的人也能访问');
    setPerms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  };
  const askDelete = async () => {
    // 有引用时不能删，先列出用在了哪里（用户 10-23）
    let used: string[] = [];
    try { used = await coreApi.roleUsages(role.key); } catch (e) { toast((e as Error).message, { tone: 'bad' }); return; }
    if (used.length) { toast(`角色「${role.name}」正在使用，不能删除：${used.join('；')}。先在这些地方换掉它再删除`, { tone: 'bad' }); return; }
    const ok = await confirm({ title: '您确定要删除吗？', text: `将删除角色「${role.name}」。${role.users} 人有这个角色，删除后从他们身上去掉；去掉后没有任何角色的人改为普通用户。`, okLabel: '删除', danger: true });
    if (ok) remove.mutate(role.key);
  };

  return (
    <div className="page">
      <PageHead title="角色权限" sub="角色决定能看到的菜单和能做的操作；一个人可以有多个角色，权限取并集。"
        acts={<button type="button" className="btn btn-p" onClick={() => setAdding(true)}><Icon name="plus" />新增角色</button>} />
      <SideGrid id="system.roles" label="角色">
        <div className="card">
          <div className="card-h b"><span className="card-t">角色</span><span className="card-s">{list.length}</span><SideFoldButton push /></div>
          <div className="role-l">
            {list.map((r) => (
              <button key={r.key} type="button" className={`role-i${r.key === role.key ? ' on' : ''}`} onClick={() => setCur(r.key)}>
                <span><b>{r.name}</b>{r.builtin ? <span className="bd">内置</span> : <span className="bd">自定义</span>}</span>
                <span className="fg3">{r.key === GUEST ? '不登录的人' : `${r.users} 人`}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h b">
            <span className="card-t">{role.name}</span><span className="card-s">{role.desc}</span>
            {!role.builtin && <button type="button" className="btn btn-xs btn-o" onClick={() => setRenaming(true)}><Icon name="pencil" />改名称</button>}
            {!role.builtin && <button type="button" className="btn btn-xs btn-ds" disabled={remove.isPending} onClick={() => void askDelete()}><Icon name="trash" />删除</button>}
            <span className="push" />
            {!all && <button type="button" className="btn btn-p btn-sm" disabled={!dirty || !scope.terminals?.length || !scope.components?.length || save.isPending} onClick={() => save.mutate({ key: role.key, perms, ...(guest ? {} : scope) })}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button>}
          </div>
          {guest && <div className="card-b fg3" role="note" style={{ paddingBottom: 0 }}>游客是不登录访问的人（角色键 guest，框架默认没有，需要公开页面时再建）：勾选的权限不登录的人也能访问；只要求登录、没有对应权限点的功能仍需登录。</div>}
          {all ? <div className="card-b fg3">系统管理员拥有全部权限，不能修改。</div> : (
            <table className="tbl perm" data-no-sort="权限矩阵，不是列表">
              <tbody>
                {!guest && <ScopeRows value={scope} onChange={setScope} />}
                {groups.map((g) => (
                  <tr key={g.name}>
                    <td style={{ width: 110 }}><b>{g.name}</b></td>
                    <td style={{ whiteSpace: 'normal', padding: '8px 12px' }}>
                      <div className="chips">
                        {g.perms.map(([k, label]) => (
                          <button key={k} type="button" className={`chip${perms.includes(k) ? ' on' : ''}`} aria-pressed={perms.includes(k)} title={guest ? '不登录的人也能访问' : undefined} onClick={() => flip(k)}>
                            {perms.includes(k) && <Icon name="check" />}{label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SideGrid>
      {renaming && <RenameRole role={role} onClose={() => setRenaming(false)} />}
      {adding && <NewRole onClose={() => setAdding(false)} onCreated={setCur} />}
    </div>
  );
}

type ScopeFields = Pick<Role, 'dataScope' | 'dataUnits' | 'terminals' | 'components'>;
const SCOPES: [DataScope, string][] = [['all', '全部'], ['unitTree', '本部门及下级'], ['unit', '本部门'], ['self', '本人'], ['custom', '自定义']];
const TERMINALS: [Terminal, string][] = [['pc', '电脑端'], ['mobile', '手机端']];
const scopeOf = (r: Role) => ({ dataScope: r.dataScope ?? 'all', dataUnits: r.dataUnits ?? [], terminals: r.terminals ?? ['pc', 'mobile'], components: r.components ?? ['*'] });

/** 数据范围管各业务模块的管理列表看得到哪些人的单据；菜单端管菜单出现在电脑端还是手机端 */
function ScopeRows({ value, onChange }: { value: ScopeFields; onChange: (v: ScopeFields) => void }) {
  const units = useQuery({ queryKey: ['units'], queryFn: coreApi.units, enabled: value.dataScope === 'custom' }).data ?? [];
  const picked = value.dataUnits ?? [];
  const ts = value.terminals ?? [];
  const comps = value.components ?? ['*'];
  const every = comps.includes('*');
  const compOn = (k: string) => every || comps.includes(k);
  const flipComp = (k: string) => {
    const next = (every ? HOME_COMPONENTS.map((c) => c.key) : comps).filter((x) => x !== k);
    if (!compOn(k)) next.push(k);
    onChange({ ...value, components: next.length === HOME_COMPONENTS.length ? ['*'] : next });
  };
  return (
    <>
      <tr>
        <td style={{ width: 110 }}><b>数据范围</b></td>
        <td style={{ whiteSpace: 'normal', padding: '8px 12px' }}>
          <div className="row">
            <Select className="input" style={{ width: 160 }} aria-label="数据范围" value={value.dataScope ?? 'all'} onChange={(e) => onChange({ ...value, dataScope: e.target.value as DataScope })}>
              {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <span className="fg3">管理列表里能看到哪些人的单据；自己的总能看到，待自己审批的不受限</span>
          </div>
          {value.dataScope === 'custom' && (
            <div className="chips" style={{ marginTop: 8 }}>
              {units.map((u) => {
                const on = picked.includes(u.id);
                return <button key={u.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange({ ...value, dataUnits: on ? picked.filter((x) => x !== u.id) : [...picked, u.id] })}>{on && <Icon name="check" />}{u.name}</button>;
              })}
            </div>
          )}
        </td>
      </tr>
      <tr>
        <td><b>菜单端</b></td>
        <td style={{ whiteSpace: 'normal', padding: '8px 12px' }}>
          <div className="chips">
            {TERMINALS.map(([k, l]) => {
              const on = ts.includes(k);
              return <button key={k} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange({ ...value, terminals: on ? ts.filter((x) => x !== k) : [...ts, k] })}>{on && <Icon name="check" />}{l}</button>;
            })}
          </div>
        </td>
      </tr>
      <tr>
        <td><b>可使用的组件</b></td>
        <td style={{ whiteSpace: 'normal', padding: '8px 12px' }}>
          <div className="chips">
            <button type="button" className={`chip${every ? ' on' : ''}`} aria-pressed={every} onClick={() => onChange({ ...value, components: every ? [] : ['*'] })}>{every && <Icon name="check" />}全部组件（默认）</button>
            {HOME_COMPONENTS.map((c) => (
              <button key={c.key} type="button" className={`chip${compOn(c.key) ? ' on' : ''}`} aria-pressed={compOn(c.key)} aria-label={`组件：${c.label}`} onClick={() => flipComp(c.key)}>{compOn(c.key) && <Icon name="check" />}{c.label}</button>
            ))}
          </div>
          <div className="fg3" style={{ fontSize: 12, marginTop: 6 }}>首页「编辑布局」里这个角色的人只能用这里选中的组件；一个人有多个角色时取并集；组件还要看模块有没有开、有没有对应权限。</div>
        </td>
      </tr>
    </>
  );
}

function RenameRole({ role, onClose }: { role: Role; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.desc ?? '');
  const save = useMutation({
    mutationFn: coreApi.saveRole,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['roles'] }); void qc.invalidateQueries({ queryKey: ['me'] }); toast('角色已改名'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title={`修改角色 · ${role.name}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ key: role.key, name: name.trim(), desc })}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button></>}>
      <Field label="名称" required hint={`最多 ${NAME_MAX} 字`}>{(id) => <input id={id} className="input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="说明" optional hint={`最多 ${DESC_MAX} 字`}>{(id) => <input id={id} className="input" value={desc} maxLength={DESC_MAX} onChange={(e) => setDesc(e.target.value)} />}</Field>
    </Dialog>
  );
}

function NewRole({ onClose, onCreated }: { onClose: () => void; onCreated: (k: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const save = useMutation({
    mutationFn: coreApi.saveRole,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['roles'] }); onCreated(r.key); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  return (
    <Dialog title="新增角色" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ name, desc, perms: [] })}><Icon name="plus" />{save.isPending ? '创建中…' : '创建'}</button></>}>
      <Field label="名称" required hint={`最多 ${NAME_MAX} 字`}>{(id) => <input id={id} className="input" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="说明" optional hint={`最多 ${DESC_MAX} 字`}>{(id) => <input id={id} className="input" value={desc} maxLength={DESC_MAX} onChange={(e) => setDesc(e.target.value)} />}</Field>
    </Dialog>
  );
}
