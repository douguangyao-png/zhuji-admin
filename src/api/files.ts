import { APP } from '@/app.config';
// 附件上传与打开：真实后端走 multipart /attachments，模拟层只记文件信息，小文件存 dataUrl
import { ApiError, post } from './http';
import { table } from './mock/db';
import type { FileRef } from './types';

const SERVER = import.meta.env.VITE_API === 'server';
/** 与后端 spring.servlet.multipart.max-file-size 一致 */
export const MAX_FILE_MB = 50;
/** 模拟层存进 localStorage 的上限，大的只记文件名 */
const INLINE = 1024 * 1024;

const readDataUrl = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => bad(r.error);
  r.readAsDataURL(f);
});

export const isMedia = (type: string) => type.startsWith('image/') || type.startsWith('video/');

export async function uploadFile(f: File, bizType?: string): Promise<FileRef> {
  if (f.size > MAX_FILE_MB * 1024 * 1024) throw new ApiError(422, `${f.name} 超过 ${MAX_FILE_MB}MB`);
  if (SERVER) {
    const fd = new FormData();
    fd.append('file', f);
    if (bizType) fd.append('bizType', bizType);
    const res = await fetch(`${APP.apiBase}/attachments`, { method: 'POST', body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.code !== 0) throw new ApiError(res.status, json.message ?? '上传失败');
    const a = json.data as { id: string | number; fileName?: string; contentType?: string; fileSize?: number };
    return { id: String(a.id), name: a.fileName ?? f.name, type: a.contentType ?? f.type, size: a.fileSize ?? f.size };
  }
  const dataUrl = f.size <= INLINE ? await readDataUrl(f) : undefined;
  return post<FileRef>('/attachments', { name: f.name, type: f.type, size: f.size, dataUrl, bizType });
}

/** 打开附件的地址；download 时后端按附件下载而不是在浏览器里打开。模拟层大文件没存内容，返回 undefined */
export const fileUrl = (r: Pick<FileRef, 'id'>, download = false) =>
  SERVER ? `${APP.apiBase}/attachments/${r.id}${download ? '?download=1' : ''}` : table<{ id: string; dataUrl?: string }>('sys_attachment').get(r.id)?.dataUrl;

/** MSDS、转移联单：PDF 或图片，单个不超过 20MB，与后端 AttachmentLookup.document 一致 */
export const DOC = { mb: 20, accept: '.pdf,application/pdf,image/*', label: 'PDF 或图片' };
export const isDoc = (type: string) => type === 'application/pdf' || type.startsWith('image/');
export function checkDoc(f: File) {
  if (!isDoc(f.type)) throw new ApiError(422, `${f.name} 不是 ${DOC.label}`);
  if (f.size > DOC.mb * 1024 * 1024) throw new ApiError(422, `${f.name} 超过 ${DOC.mb}MB`);
}

/** 给 ui/SignaturePad 的 upload：签名 PNG 存进附件服务，返回附件 id */
export const uploadSign = (bizType: string) => async (png: Blob) =>
  (await uploadFile(new File([png], '签名.png', { type: 'image/png' }), bizType)).id;
