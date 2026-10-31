import { Fragment, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coreApi, type UserRow } from '@/api/core';
import type { User, UserAttrDef } from '@/api/types';
import { PageHead, Search, SelectFilter } from '@/core/bits';
import { useMeSure } from '@/core/me';
import { downloadCsv } from '@/core/export';
import { maskPhone } from '@/lib/mask';
import { Masked } from '@/ui/Masked';
import { today } from '@/lib/time';
import { DataTable, type Columns } from '@/ui/DataTable';
import { confirm } from '@/ui/Confirm';
import { Dialog } from '@/ui/Dialog';
import { Field } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Tag } from '@/ui/Tag';
import { toast } from '@/ui/Toast';
import { Select } from '@/ui/Select';
import { ImportDialog } from '@/core/ImportDialog';
import { Op } from '@/core/op';
import { attrValue, GENDER_LABEL, MULTI_SEP, multiItems, shownAttrs, SOURCE_LABEL, withAttr } from './people';
import { useAttrDefs } from '@/core/people';
/** 同步会覆盖的字段；改了这些才提示勾「不允许接口修改」 */
const SYNCED: (keyof User)[] = ['name', 'gender', 'unitId', 'phone'];

/** 角色选择里不出现的：系统管理员，不在人员页分配 */
const HIDDEN_ROLES = ['admin'];

/** 人员页：公共字段加全部启用的扩展属性 */
export function UsersPage() {
  const attrs = shownAttrs(useAttrDefs().data ?? []);
  const me = useMeSure();
  const sysUser = me.can('sys:user');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [unitId, setUnit] = useState('');
  const [role, setRole] = useState('');
  const [source, setSource] = useState('');
  // 扩展属性筛选（日期类不筛）
  const filterAttrs = attrs.filter((d) => d.type !== 'date');
  const [attrF, setAttrF] = useState<Record<string, string>>({});
  const attrQuery = Object.fromEntries(filterAttrs.filter((d) => attrF[d.key]).map((d) => [d.key, attrF[d.key]]));
  const attrOptions = useQuery({ queryKey: ['userAttrs'], queryFn: coreApi.userAttrs, enabled: filterAttrs.length > 0 }).data;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<UserRow | null>(null);
  const [edit, setEdit] = useState<Partial<User> | null>(null);
  const [imp, setImp] = useState(false);
  const units = useQuery({ queryKey: ['units'], queryFn: coreApi.units }).data ?? [];
  const roles = useQuery({ queryKey: ['roles'], queryFn: coreApi.roles }).data ?? [];
  const list = useQuery({
    queryKey: ['users', q, unitId, role, source, attrQuery],
    queryFn: () => coreApi.users({ q, unitId, role, source, ...attrQuery, size: 500 }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items ?? [];
  const toggle = useMutation({
    mutationFn: coreApi.toggleUser,
    onSuccess: (u) => { void qc.invalidateQueries({ queryKey: ['users'] }); toast(`${u.name} 已${u.active ? '启用' : '停用'}`); },
  });
  const lock = useMutation({
    mutationFn: (locked: boolean) => coreApi.setSyncLock([...sel], locked),
    onSuccess: (n, locked) => { void qc.invalidateQueries({ queryKey: ['users'] }); setSel(new Set()); toast(`${n} 人已${locked ? '设为' : '取消'}不允许接口修改`); },
  });
  const exportRows = () => {
    const head = exportCols(attrs);
    downloadCsv(`人员-${today()}`, head, rows.map((u) => {
      const v: Record<string, string | undefined> = {
        工号: u.no, 姓名: u.name, 部门: u.unitName, 角色: u.roleNames.join('、'), 账号: u.username, 职务: u.title,
        ...Object.fromEntries(attrs.map((d) => [d.name, attrValue(u, d.key)])),
      };
      return head.map((k) => v[k]);
    }));
  };

  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const reset = async (u: UserRow) => {
    const ok = await confirm({ title: `重置 ${u.name} 的密码？`, text: '重置成「基础配置」里的默认密码，原密码立即失效；对方用默认密码登录时会提示修改，超过可忽略次数后必须修改。', okLabel: '重置' });
    if (!ok) return;
    try { setTemp({ name: u.name, password: (await coreApi.resetPassword(u.id)).password }); } catch (e) { toast((e as Error).message, { tone: 'bad' }); }
  };

  const cols: Columns<UserRow> = [
    { id: 'name', header: '姓名', accessorKey: 'name', cell: (c) => <b>{c.getValue() as string}</b> },
    { id: 'no', header: '工号', accessorKey: 'no', meta: { className: 'mono' } },
    { id: 'username', header: '账号', accessorKey: 'username', meta: { className: 'mono' } },
    { id: 'gender', header: '性别', accessorFn: (u) => (u.gender ? GENDER_LABEL[u.gender] : '') },
    { id: 'unit', header: '部门', accessorKey: 'unitName' },
    { id: 'title', header: '职务', accessorKey: 'title' },
    { id: 'roles', header: '角色', accessorFn: (u) => u.roleNames.join('、') },
    { id: 'phone', header: '手机', accessorFn: (u) => maskPhone(u.phone), cell: (c) => <Masked kind="phone" value={c.row.original.phone} /> },
    { id: 'source', header: '来源', accessorFn: (u) => SOURCE_LABEL[u.source ?? 'manual'], cell: (c) => {
      const u = c.row.original;
      return (
        <span title={u.lastSyncAt ? `最后同步 ${u.lastSyncAt}` : undefined}>
          {u.source === 'sync' ? <Tag tone="info">接口同步</Tag> : <span className="fg3">{SOURCE_LABEL[u.source ?? 'manual']}</span>}
          {u.syncLocked && <span className="fg3" title="不允许接口修改，同步时跳过"> · 锁定</span>}
        </span>
      );
    } },
    { id: 'active', header: '状态', accessorKey: 'active', cell: (c) => <Tag tone={c.getValue() ? 'good' : 'flat'}>{c.getValue() ? '启用' : '停用'}</Tag> },
    { id: 'act', header: '', enableSorting: false, meta: { className: 'act' }, cell: (c) => (
      <>
        <button type="button" className="btn btn-xs btn-g" onClick={() => setView(c.row.original)}><Icon name="eye" />详情</button>
        <button type="button" className="btn btn-xs btn-o" onClick={() => setEdit(c.row.original)}><Icon name="pencil" />编辑</button>
        <button type="button" className="btn btn-xs btn-g" onClick={() => void reset(c.row.original)}><Icon name="key" />重置密码</button>
        <button type="button" className="btn btn-xs btn-g" onClick={() => toggle.mutate(c.row.original.id)}><Icon name="power" />{c.row.original.active ? '停用' : '启用'}</button>
      </>
    ) },
  ];

  return (
    <div className="page">
      <PageHead title="人员" sub={`${list.data?.total ?? 0} 人；新建和重置密码的账号首次登录必须改密码。扩展属性在「系统管理 › 人员属性」里配置。`}
        acts={<>
          <Op k="import"><button type="button" className="btn" onClick={() => setImp(true)}><Icon name="upload" />导入</button></Op>
          <Op k="export"><button type="button" className="btn" disabled={!rows.length} onClick={exportRows}><Icon name="download" />导出</button></Op>
          <button type="button" className="btn btn-p" onClick={() => setEdit({ roleKeys: ['user'], unitId: 'C0' })}><Icon name="plus" />新增人员</button>
        </>} />
      <div className="card">
        <div className="toolbar">
          <Search value={q} onChange={setQ} placeholder="姓名、工号、账号" />
          <SelectFilter label="部门" value={unitId} onChange={setUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} multi />
          {sysUser && <SelectFilter label="角色" value={role} onChange={setRole} options={roles.map((r) => ({ value: r.key, label: r.name }))} multi />}
          <SelectFilter label="来源" value={source} onChange={setSource} options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} multi />
          {filterAttrs.map((d) => (
            <SelectFilter key={d.key} label={d.name} value={attrF[d.key] ?? ''} onChange={(v) => setAttrF({ ...attrF, [d.key]: v })}
              options={(d.type === 'select' || d.type === 'multi' ? d.options ?? [] : attrOptions?.[d.key] ?? []).map((v) => ({ value: v, label: v }))} multi />
          ))}
          {sel.size > 0 && <>
            <span className="fg3">已选 {sel.size} 人</span>
            <button type="button" className="btn btn-xs" onClick={() => lock.mutate(true)}><Icon name="pencil" />设为不允许接口修改</button>
            <button type="button" className="btn btn-xs btn-g" onClick={() => lock.mutate(false)}><Icon name="x" />取消不允许接口修改</button>
          </>}
        </div>
        <DataTable data={rows} columns={cols} pageId="users" emptyText="没有符合条件的人员" selectable selected={sel} onSelect={setSel} />
      </div>
      {view && <UserDetail user={view} attrs={attrs} onClose={() => setView(null)} onEdit={() => { setEdit(view); setView(null); }} />}
      {edit && <UserDialog user={edit} editRoles={sysUser} attrs={attrs} onClose={() => setEdit(null)} />}
      {imp && <UsersImport units={units.map((u) => u.name)} roles={roles.map((r) => r.name)} attrs={attrs} onClose={() => setImp(false)} />}
      {temp && (
        <Dialog title={`${temp.name} 的默认密码`} size="sm" onClose={() => setTemp(null)}
          footer={<button type="button" className="btn btn-p" onClick={() => setTemp(null)}><Icon name="check" />我已记下</button>}>
          <p className="mono" style={{ fontSize: 20, letterSpacing: '.08em', userSelect: 'all' }} aria-label="默认密码">{temp.password}</p>
          <p className="fg3" style={{ fontSize: 13, marginTop: 8 }}>已重置为基础配置里的默认密码。当面或电话告知本人，用它登录会提示修改，超过可忽略次数后必须修改。</p>
        </Dialog>
      )}
    </div>
  );
}

function UserDetail({ user, attrs, onClose, onEdit }: { user: UserRow; attrs: UserAttrDef[]; onClose: () => void; onEdit: () => void }) {
  const none = <span className="fg4">—</span>;
  return (
    <Dialog title={user.name} sub={`${user.no} · ${user.username}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />关闭</button><button type="button" className="btn btn-p" onClick={onEdit}><Icon name="pencil" />编辑</button></>}>
      <dl className="dl">
        <dt>性别</dt><dd>{user.gender ? GENDER_LABEL[user.gender] : none}</dd>
        <dt>部门</dt><dd>{user.unitName}</dd>
        <dt>职务</dt><dd>{user.title || none}</dd>
        {attrs.map((d) => <Fragment key={d.key}><dt>{d.name}</dt><dd>{attrValue(user, d.key) || none}</dd></Fragment>)}
        <dt>角色</dt><dd>{user.roleNames.join('、') || none}</dd>
        <dt>手机</dt><dd><Masked kind="phone" value={user.phone} /></dd>
        <dt>状态</dt><dd><Tag tone={user.active ? 'good' : 'flat'}>{user.active ? '启用' : '停用'}</Tag></dd>
      </dl>
    </Dialog>
  );
}

function UserDialog({ user, editRoles, attrs, onClose }: { user: Partial<User>; editRoles: boolean; attrs: UserAttrDef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(user);
  const units = useQuery({ queryKey: ['units'], queryFn: coreApi.units }).data ?? [];
  const roles = useQuery({ queryKey: ['roles'], queryFn: coreApi.roles }).data ?? [];
  const save = useMutation({
    // 只提交启用的扩展属性，作废的保留原值
    mutationFn: (u: Partial<User>) => coreApi.saveUser({ ...u, attrs: Object.fromEntries(attrs.map((d) => [d.key, u.attrs?.[d.key] ?? ''])) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['users'] }); void qc.invalidateQueries({ queryKey: ['userAttrs'] }); toast('已保存'); onClose(); },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });
  const set = (k: keyof User, v: unknown) => setF({ ...f, [k]: v });
  const ok = f.name?.trim() && f.username?.trim();
  const synced = user.source === 'sync';
  const overwritten = synced && !f.syncLocked && SYNCED.some((k) => (f[k] ?? '') !== (user[k] ?? ''));
  const sub = user.id ? `来源：${SOURCE_LABEL[user.source ?? 'manual']}${user.lastSyncAt ? ` · 最后同步 ${user.lastSyncAt}` : ''}` : undefined;
  return (
    <Dialog title={user.id ? `编辑 · ${user.name}` : '新增人员'} sub={sub} size="lg" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}><Icon name="x" />取消</button><button type="button" className="btn btn-p" disabled={!ok || save.isPending} onClick={() => save.mutate(f)}><Icon name="check" />{save.isPending ? '保存中…' : '保存'}</button></>}>
      <div className="grid g-2">
        <Field label="姓名" required>{(id) => <input id={id} className="input" value={f.name ?? ''} maxLength={64} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label="工号" optional hint="没有可以不填，登录用上面的账号">{(id) => <input id={id} className="input mono" value={f.no ?? ''} maxLength={32} onChange={(e) => set('no', e.target.value)} />}</Field>
        <Field label="账号" required={!user.id}>{(id) => <input id={id} className="input mono" value={f.username ?? ''} maxLength={64} disabled={Boolean(user.id)} onChange={(e) => set('username', e.target.value)} />}</Field>
        <Field label="手机" optional>{(id) => <input id={id} className="input mono" value={f.phone ?? ''} maxLength={20} onChange={(e) => set('phone', e.target.value)} />}</Field>
        <Field label="部门">{(id) => (
          <Select id={id} className="input" value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}</Field>
        <Field label="性别" optional>{(id) => (
          <Select id={id} className="input" value={f.gender ?? ''} onChange={(e) => set('gender', e.target.value || undefined)}>
            <option value="">未填</option>
            {Object.entries(GENDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}</Field>
        <Field label="职务" optional>{(id) => <input id={id} className="input" value={f.title ?? ''} maxLength={64} onChange={(e) => set('title', e.target.value)} />}</Field>
        {attrs.map((d) => (
          <Field key={d.key} label={d.name} optional hint={d.type === 'text' ? `最多 ${d.maxLen} 字` : undefined}>{(id) => (
            <AttrInput id={id} def={d} value={attrValue(f, d.key) ?? ''} onChange={(v) => setF(withAttr(f, d.key, v))} />
          )}</Field>
        ))}
      </div>
      {editRoles && <div className="field" style={{ marginTop: 14 }}>
        <label>角色</label>
        {f.roleKeys?.includes('admin') && <span className="fg3" style={{ fontSize: 12 }}>此人是系统管理员（不在这里分配或去掉）</span>}
        <div className="chips">
          {roles.filter((r) => !HIDDEN_ROLES.includes(r.key)).map((r) => {
            const on = f.roleKeys?.includes(r.key);
            return <button key={r.key} type="button" className={`chip${on ? ' on' : ''}`}
              onClick={() => set('roleKeys', on ? f.roleKeys!.filter((k) => k !== r.key) : [...(f.roleKeys ?? []), r.key])}>{r.name}</button>;
          })}
        </div>
      </div>}
      <label className="sw-l" style={{ marginTop: 14 }}>
        <button type="button" role="switch" aria-checked={Boolean(f.syncLocked)} aria-label="不允许接口修改" className={`sw${f.syncLocked ? ' on' : ''}`} onClick={() => set('syncLocked', !f.syncLocked)} />
        不允许接口修改（人员同步时跳过这个人）
      </label>
      {overwritten && <p className="fg3" role="note" style={{ marginTop: 8 }}>这个人来自接口同步，下次同步会覆盖姓名、性别、部门、手机；如需保留请勾选不允许接口修改。</p>}
    </Dialog>
  );
}

/** 一项人员属性的输入：文本按最大长度，日期用日期框，下拉用选项，多选用可点选的选项（存为顿号隔开） */
function AttrInput({ id, def, value, onChange }: { id: string; def: UserAttrDef; value: string; onChange: (v: string) => void }) {
  if (def.type === 'multi') {
    const on = multiItems(value);
    const opts = (def.options ?? []).concat(on.filter((x) => !(def.options ?? []).includes(x)));
    return (
      <div id={id} className="chips" role="group" aria-label={def.name}>
        {opts.map((o) => (
          <button key={o} type="button" className={`chip${on.includes(o) ? ' on' : ''}`} aria-pressed={on.includes(o)}
            onClick={() => onChange((on.includes(o) ? on.filter((x) => x !== o) : opts.filter((x) => x === o || on.includes(x))).join(MULTI_SEP))}>{o}</button>
        ))}
      </div>
    );
  }
  if (def.type === 'date') return <input id={id} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  if (def.type === 'select') return (
    <Select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">未填</option>
      {(def.options ?? []).concat(value && !(def.options ?? []).includes(value) ? [value] : []).map((o) => <option key={o} value={o}>{o}</option>)}
    </Select>
  );
  return <input id={id} className="input" value={value} maxLength={def.maxLen} onChange={(e) => onChange(e.target.value)} />;
}

const IMPORT_COLS = ['工号', '姓名', '部门', '角色', '账号', '职务', '手机'];
/** 导入列：公共字段加全部启用的扩展属性 */
const importCols = (attrs: UserAttrDef[]) => [...IMPORT_COLS, ...attrs.map((d) => d.name)];
/** 导出与导入同一套表头，改完能直接导回；列表里的手机号是脱敏的，不导出 */
const exportCols = (attrs: UserAttrDef[]) => importCols(attrs).filter((k) => k !== '手机');
/** 与后端同一规则的扩展属性检查，返回错误文案 */
function attrError(d: UserAttrDef, v: string): string | undefined {
  if (!v) return undefined;
  if (d.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${d.name}要填日期，如 2026-10-23`;
  if (d.type === 'select' && !(d.options ?? []).includes(v)) return `${d.name}没有选项「${v}」`;
  if (d.type === 'multi') { const miss = multiItems(v).find((x) => !(d.options ?? []).includes(x)); if (miss) return `${d.name}没有选项「${miss}」`; }
  if (d.type === 'text' && v.length > d.maxLen) return `${d.name}最多 ${d.maxLen} 个字`;
  return undefined;
}

/** 按工号匹配：已有的更新，没有的新增 */
function UsersImport({ units, roles, attrs, onClose }: { units: string[]; roles: string[]; attrs: UserAttrDef[]; onClose: () => void }) {
  const qc = useQueryClient();
  const cols = importCols(attrs);
  const parse = (r: Record<string, string>) => {
    if (!units.includes(r['部门'])) return { error: `没有部门「${r['部门']}」` };
    const bad = (r['角色'] ?? '').split(/[、,，;；\s]+/).filter((n) => n && !roles.includes(n));
    if (bad.length) return { error: `没有角色「${bad.join('、')}」` };
    if (r['手机'] && !/^1\d{10}$/.test(r['手机'])) return { error: '手机号应为 11 位' };
    for (const d of attrs) {
      const err = attrError(d, (r[d.name] ?? '').trim());
      if (err) return { error: err };
    }
    // 扩展属性空着不改
    const extra = Object.fromEntries(attrs.filter((d) => r[d.name]?.trim()).map((d) => [d.key, r[d.name].trim()]));
    return { item: {
      no: r['工号'], name: r['姓名'], unitName: r['部门'], roleNames: r['角色'] ?? '', username: r['账号'], title: r['职务'], phone: r['手机'],
      ...(Object.keys(extra).length ? { attrs: extra } : {}),
    } as Record<string, unknown> };
  };
  const example = ['E3001', '王小明', units[1] ?? units[0] ?? '', '普通用户', '', '职员', '13800001234',
    ...attrs.map((d) => (d.type === 'select' ? d.options?.[0] ?? '' : d.type === 'date' ? '2026-10-23' : ''))];
  const attrNames = new Set(attrs.map((d) => d.name));
  return (
    <ImportDialog title="导入人员" name="人员" onClose={onClose} parse={parse}
      cols={cols.map((k) => ({ key: k, required: k === '工号' || k === '姓名' || k === '部门',
        hint: attrNames.has(k) ? '不填不改' : { 工号: '已有的按工号更新', 角色: '多个用顿号隔开，不填默认普通用户', 账号: '不填用工号' }[k] }))}
      example={example}
      preview={['工号', '姓名', '部门', '角色']}
      submit={async (rows) => {
        const r = await coreApi.importUsers(rows);
        void qc.invalidateQueries({ queryKey: ['userAttrs'] });
        const bad = r.errors ?? [];
        return `导入完成：新增 ${r.added} 人，更新 ${r.updated} 人${bad.length ? `；${bad.length} 行没导入：${bad.slice(0, 3).map((e) => `第 ${e.row} 行${e.message}`).join('；')}` : ''}`;
      }} />
  );
}
