// 反馈服务连不上时（本地开发、单元测试）用的模拟接口，规则与 deploy/feedback 的服务一致
import './db-mock';
import { stamp } from '@/lib/time';
import { table } from '@/api/mock/db';
import { ApiError, mock } from '@/api/mock/router';
import { can, notify, scopeUnitsOf } from '@/api/mock/services';
import type { Feedback, FeedbackReply, FeedbackStatus } from './api';

const rows = table<Feedback & { handlerId?: string }>('fb_feedback');
const CLOSED: FeedbackStatus[] = ['已解决', '不处理'];
const MAX_REPLY = 2000;
const link = (f: Feedback) => `/help/feedback?no=${f.no}`;
/** 老数据没有往来记录时，有回复的补一条处理人回复，与后端一致 */
const thread = (f: Feedback): FeedbackReply[] => f.replies ?? (f.reply?.trim()
  ? [{ side: 'handler', name: f.handler ?? '', text: f.reply.trim(), status: f.status, reopen: false, at: f.handledAt ?? f.updatedAt }] : []);
const view = (f: Feedback) => { const r = thread(f); return { ...f, replies: r, reopened: r.filter((x) => x.reopen).length }; };
/** 列表摘要，与后端 FeedbackService.summary 一致：正文、最新回复截前 200 字，只留最后一条有文字的回复，不带 ua */
const SUMMARY = 200;
const summary = (f: Feedback): Feedback => {
  const { ua: _ua, reply, ...v } = view(f);
  const last = v.replies.filter((x) => x.text).at(-1);
  return { ...v, text: v.text.slice(0, SUMMARY), replies: last ? [{ ...last, text: last.text.slice(0, SUMMARY) }] : [],
    ...(!last && reply != null ? { reply: reply.slice(0, SUMMARY) } : {}) };
};

// 反馈没存提交人科室：数据范围不是全部的只看自己的
mock.get('/feedback', ({ user, query }) => rows.where((f) => (!query.userId || f.userId === query.userId) && (!scopeUnitsOf(user) || f.userId === user.id)
  && (!query.status || f.status === query.status)
  && (!query.q || `${f.no}${f.text}${f.pageTitle}${f.userName}`.includes(query.q))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary));

// 完整的一条：看得到的范围与上面的列表一致（本人的，或数据范围是全部的），另外有 sys:feedback 的也能看，与后端一致
mock.get('/feedback/:id', ({ params, user }) => {
  const f = rows.get(params.id);
  if (!f) throw new ApiError(404, '反馈不存在');
  if (f.userId !== user.id && scopeUnitsOf(user) && !can(user, 'sys:feedback')) throw new ApiError(403, '只能查看自己提交的反馈');
  return view(f);
});

mock.post('/feedback', ({ body, user }) => {
  if (!String(body.text ?? '').trim()) throw new ApiError(422, '请写下问题或建议');
  const n = rows.all().length + 1;
  const at = stamp();
  return view(rows.insert({ ...body, userId: user.id, userName: user.name, id: `F${n}`, no: `FB-${String(n).padStart(4, '0')}`, status: '待处理', createdAt: at, updatedAt: at } as Feedback));
});

mock.put('/feedback/:id', ({ params, body, user }) => {
  const f = rows.get(params.id);
  if (!f) throw new ApiError(404, '反馈不存在');
  const status = body.status as FeedbackStatus;
  if (!['待处理', '处理中', '已解决', '不处理'].includes(status)) throw new ApiError(422, '状态不正确');
  const reply = String(body.reply ?? '').trim();
  if (reply.length > MAX_REPLY) throw new ApiError(422, `回复最多 ${MAX_REPLY} 字`);
  if (!reply && status === f.status) throw new ApiError(422, '请写回复或改状态');
  const at = stamp();
  const replies = [...thread(f), { side: 'handler' as const, name: user.name, text: reply, status, reopen: false, at }];
  const out = rows.update(params.id, { status, reply: reply || f.reply, handler: user.name, handlerId: user.id, handledAt: at, replies, updatedAt: at });
  if (f.userId !== user.id) notify(f.userId, { kind: '问题反馈', title: `${f.no} 有新回复：${status}`, body: reply || `状态改为${status}`, link: link(f) });
  return view(out!);
});

// 提交人再次回复；勾「还需要再改」时已解决、不处理的回到待处理，并通知上次的处理人
mock.post('/feedback/:id/replies', ({ params, body, user }) => {
  const f = rows.get(params.id);
  if (!f) throw new ApiError(404, '反馈不存在');
  if (f.userId !== user.id) throw new ApiError(403, '只有提交人能在这里回复，处理人请用「保存处理结果」');
  const text = String(body.text ?? '').trim();
  if (!text) throw new ApiError(422, '请写下回复内容');
  if (text.length > MAX_REPLY) throw new ApiError(422, `回复最多 ${MAX_REPLY} 字`);
  const reopen = Boolean(body.reopen) && CLOSED.includes(f.status);
  const status: FeedbackStatus = reopen ? '待处理' : f.status;
  const at = stamp();
  const out = rows.update(params.id, { status, replies: [...thread(f), { side: 'submitter', name: user.name, text, status, reopen, at }], updatedAt: at });
  if (f.handlerId) notify(f.handlerId, { kind: '问题反馈', title: `${f.no} ${reopen ? '提交人要求再改' : '提交人回复了'}`, body: text, link: link(f) });
  return view(out!);
});
