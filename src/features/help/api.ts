import { get, post, put } from '@/api/http';
import type { FileRef } from '@/api/types';

export type FeedbackKind = '问题' | '建议' | '咨询';
export type FeedbackStatus = '待处理' | '处理中' | '已解决' | '不处理';

/** 往来回复一条：处理人处理一次、提交人回复一次各记一条；reopen 是提交人要求再改 */
export interface FeedbackReply { side: 'handler' | 'submitter'; name: string; text: string; status: FeedbackStatus; reopen: boolean; at: string }

export interface Feedback {
  id: string;
  no: string;
  kind: FeedbackKind;
  text: string;
  images: string[];
  /** 需求文档、表格等附件，在线下载 */
  attachments?: FileRef[];
  page: string;
  pageTitle: string;
  userId: string;
  userName: string;
  roleNames: string;
  /** 浏览器信息；列表摘要里没有，详情才有 */
  ua?: string;
  screen: string;
  version: string;
  status: FeedbackStatus;
  reply?: string;
  handler?: string;
  /** 最近一次处理时间 */
  handledAt?: string | null;
  replies?: FeedbackReply[];
  /** 提交人要求再改的次数 */
  reopened?: number;
  createdAt: string;
  updatedAt: string;
}
export type FeedbackDraft = Omit<Feedback, 'id' | 'no' | 'status' | 'createdAt' | 'updatedAt' | 'replies' | 'reopened' | 'handledAt'> & { attachmentIds?: string[] };
export interface FeedbackQuery { userId?: string; status?: string; q?: string }


/** 列表返回摘要：正文、最新回复各截前 200 字，往来回复只留最后一条有文字的，没有浏览器信息；点开一条用 detail 取完整的 */
export const feedbackApi = {
  list: (q: FeedbackQuery) => get<Feedback[]>('/feedback', { ...q }),
  /** 完整的一条 */
  detail: (id: string, _row?: Feedback) => get<Feedback>(`/feedback/${id}`),
  create: (d: FeedbackDraft) => post<Feedback>('/feedback', d),
  handle: (id: string, p: { status: FeedbackStatus; reply?: string; handler: string }) => put<Feedback>(`/feedback/${id}`, p),
  /** 提交人再次回复；reopen 为「还需要再改」 */
  say: (id: string, p: { text: string; reopen: boolean }) => post<Feedback>(`/feedback/${id}/replies`, p),
};
