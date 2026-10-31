import { APP } from '@/app.config';
// 备份与恢复：接口路径见 docs/接口约定.md，后端按同样的路径实现
import { ApiError, del, get, post, put } from '@/api/http';
import { sealed } from '@/api/sm2';

const SERVER = import.meta.env.VITE_API === 'server';

export type BackupKind = 'manual' | 'auto' | 'prerestore' | 'upload';
/** 后端 Long 按字符串输出，数字字段在 list() 里统一转成 number；error 有值表示读不出 manifest（不是本系统的包或已损坏） */
export interface BackupItem {
  name: string; kind: BackupKind; kindLabel: string; createdAt: string; size: number;
  operator?: string; schemaVersion?: string; appVersion?: string;
  tables: number; rows: number; attachments: number; missing: number; error?: string;
}
export interface BackupList { items: BackupItem[]; dir: string; freeBytes: number; running: 'backup' | 'restore' | null }
export interface BackupSettings { auto: boolean; time: string; keep: number }
export interface RestoreResult { name: string; tables: number; rows: number; attachments: number; fileErrors: number; preRestore: string; relogin: boolean }

/** 上传备份包的大小上限，与后端配置一致 */
export const MAX_UPLOAD = 2 * 1024 * 1024 * 1024;
export const CONFIRM_TEXT = '确认恢复';

const n = (v: unknown) => Number(v ?? 0) || 0;
const item = (x: BackupItem): BackupItem => ({ ...x, size: n(x.size), tables: n(x.tables), rows: n(x.rows), attachments: n(x.attachments), missing: n(x.missing) });

export const backupApi = {
  list: async () => {
    const r = await get<BackupList>('/backups');
    return { ...r, freeBytes: n(r.freeBytes), items: r.items.map(item) };
  },
  create: async () => item(await post<BackupItem>('/backups')),
  remove: (name: string) => del<boolean>(`/backups/${name}`),
  /** 密码和登录一样先加密再传 */
  restore: (name: string, password: string, confirm: string) => sealed({ password }, (s) => post<RestoreResult>(`/backups/${name}/restore`, { ...s, confirm })),
  settings: () => get<BackupSettings>('/backups/settings'),
  saveSettings: (s: BackupSettings) => put<BackupSettings>('/backups/settings', s),
  downloadUrl: (name: string) => (SERVER ? `${APP.apiBase}/backups/${name}/download` : null),
  /** 真实后端：请求体直接是 zip，不走 multipart；模拟层只记文件名和大小 */
  upload: async (f: File): Promise<BackupItem> => {
    if (f.size > MAX_UPLOAD) throw new ApiError(413, '备份包不能超过 2048.0 MB');
    if (!/\.zip$/i.test(f.name)) throw new ApiError(422, '请选择备份时下载的 .zip 文件');
    if (SERVER) {
      const res = await fetch(`${APP.apiBase}/backups/upload`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: f });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.code !== 0) throw new ApiError(res.status, json.message ?? '上传失败');
      return item(json.data as BackupItem);
    }
    return item(await post<BackupItem>('/backups/upload', { fileName: f.name, size: f.size }));
  },
};

export function sizeText(b: number) {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}
