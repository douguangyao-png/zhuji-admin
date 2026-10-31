import type { User, UserAttrDef, UserSource } from '@/api/types';

export const SOURCE_LABEL: Record<UserSource, string> = { manual: '系统录入', sync: '接口同步', import: '导入' };
export const GENDER_LABEL = { M: '男', F: '女' } as const;

/**
 * 扩展人员属性：值在人员的 attrs 里，目录见「系统管理 › 人员属性」。
 * 账号、姓名、性别、证件号码、手机号是内置属性，存在人员本身的字段上
 */
export const attrValue = (u: Partial<User>, k: string): string | undefined => u.attrs?.[k];
export const withAttr = (u: Partial<User>, k: string, v: string): Partial<User> => ({ ...u, attrs: { ...(u.attrs ?? {}), [k]: v } });

/** 页面上显示的属性：只要启用的，按目录排序 */
export const shownAttrs = (defs: UserAttrDef[]): UserAttrDef[] => defs.filter((d) => d.enabled);

export const ATTR_TYPE_LABEL: Record<UserAttrDef['type'], string> = { text: '文本', date: '日期', select: '下拉', multi: '多选' };
/** 多选属性：值为所选项用顿号隔开；填写、导入时顿号和中英文逗号都认 */
export const MULTI_SEP = '、';
export const multiItems = (v?: string): string[] => [...new Set((v ?? '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean))];
