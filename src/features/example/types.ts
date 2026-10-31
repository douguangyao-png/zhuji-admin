// 示例模块的数据结构；新模块照这个写，字段名与后端一致

export type ExampleStatus = '草稿' | '审批中' | '已通过' | '已驳回';
export const EXAMPLE_STATUS: ExampleStatus[] = ['草稿', '审批中', '已通过', '已驳回'];

/** 字段长度上限，前端 maxLength 和模拟后端校验共用，与数据库列宽一致 */
export const EXAMPLE_MAX = { title: 64, note: 500 } as const;

export interface ExampleItem {
  id: string;
  /** 单号 SL + yyyyMMdd + 流水，提交时生成 */
  no: string;
  title: string;
  /** 字典 exampleCategory 的编码 */
  category: string;
  /** 金额，两位小数；超过 1 万元审批多一级 */
  amount: number;
  date: string;
  note?: string;
  status: ExampleStatus;
  ownerId: string;
  ownerName: string;
  unitId: string;
  unitName: string;
  createdAt: string;
}

export type ExampleInput = Pick<ExampleItem, 'title' | 'category' | 'amount' | 'date' | 'note'> & { id?: string };
