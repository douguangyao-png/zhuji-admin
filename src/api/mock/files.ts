// 模拟层的附件核对，与后端 common/AttachmentLookup 一致：单据只存附件 id，保存时核对类型和大小
import { table } from './db';
import { ApiError } from './router';

export interface MockFile { id: string; name: string; type: string; size: number; bizType?: string; dataUrl?: string }
export const files = table<MockFile>('sys_attachment');

export function requireFile(id: unknown, what: string, label: string, maxMb: number, types: string[]) {
  const a = id ? files.get(String(id)) : undefined;
  if (!a) throw new ApiError(422, `${what}没有上传或已失效，请重新上传`);
  if (!types.some((t) => (t.endsWith('/') ? a.type.startsWith(t) : a.type === t))) throw new ApiError(422, `${what}只能是${label}`);
  if (a.size > maxMb * 1024 * 1024) throw new ApiError(422, `${what}不能超过 ${maxMb}MB`);
  return a;
}
export const requireDoc = (id: unknown, what: string) => requireFile(id, what, ' PDF 或图片', 20, ['application/pdf', 'image/']);
export const requireSign = (id: unknown, who: string) => requireFile(id, `${who}的签名`, ' PNG 图片', 2, ['image/png']);
export const fileRef = (a: MockFile) => ({ id: a.id, name: a.name, type: a.type, size: a.size });
