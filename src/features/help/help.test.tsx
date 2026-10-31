import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDb, openApp } from '@/test/render';
import { splitAi } from './FeedbackPage';
import { setNow } from '@/lib/time';

beforeEach(() => freshDb());

test('任何页面右边提交反馈，带上当前页面，反馈列表里能看到并处理', async () => {
  const user = userEvent.setup();
  openApp('/system/audit', 'U01');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('操作日志');
  const submit = screen.getByRole('button', { name: '提交' });
  expect(submit).toBeDisabled();
  await user.type(screen.getByLabelText('反馈内容'), '模块筛选少一项');
  await user.click(submit);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  openApp('/help/feedback', 'U01');
  const cell = await screen.findAllByText('模块筛选少一项');
  await user.click(cell[cell.length - 1]);
  await user.click(screen.getByRole('radio', { name: '已解决' }));
  await user.type(screen.getByLabelText('回复'), '已加上');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await waitFor(() => expect(screen.getAllByText('已解决').length).toBeGreaterThan(1));
  // 列表里直接看得到回复和修复时间
  expect(await screen.findByText('已加上')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '修复时间' })).toBeInTheDocument();
});

test('反馈可以带需求文档附件，列表详情里能下载', async () => {
  const user = userEvent.setup();
  openApp('/system/audit', 'U01');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  await user.type(screen.getByLabelText('反馈内容'), '需求文档见附件');
  const input = screen.getByRole('dialog').querySelector('input[type=file][accept*=".pdf"]') as HTMLInputElement;
  const file = new File(['需求正文'], '需求说明.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByText('需求说明.docx')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  openApp('/help/feedback', 'U01');
  const cell = await screen.findAllByText(/需求文档见附件/);
  await user.click(cell[cell.length - 1]);
  expect(await screen.findByText('需求说明.docx')).toBeInTheDocument();
});

test('测试版能看项目文档，带目录', async () => {
  openApp('/help/docs/接口约定', 'U04');
  expect(await screen.findByRole('heading', { level: 1, name: '接口约定' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '开发指南' })).toBeInTheDocument();
});

test('处理后提交人可以接着回复，勾「还需要再改」回到待处理，处理人从消息链接直接打开这一条', async () => {
  const user = userEvent.setup();
  openApp('/system/audit', 'U04');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  await user.type(screen.getByLabelText('反馈内容'), '预约页按钮太小');
  await user.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  openApp('/help/feedback', 'U01');
  await user.click((await screen.findAllByText('预约页按钮太小')).at(-1)!);
  await user.click(screen.getByRole('radio', { name: '已解决' }));
  await user.type(screen.getByLabelText('回复'), '按钮已加大');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  openApp('/help/feedback', 'U04');
  await user.click((await screen.findAllByText('预约页按钮太小')).at(-1)!);
  const dlg = screen.getByRole('dialog');
  expect(within(dlg).getByLabelText('往来回复')).toHaveTextContent('按钮已加大');
  // 自己提交的只能回复，不能自己处理
  expect(within(dlg).queryByRole('button', { name: '保存处理结果' })).toBeNull();
  const send = within(dlg).getByRole('button', { name: '回复' });
  expect(send).toBeDisabled();
  await user.type(within(dlg).getByLabelText('我的回复'), '手机上还是小');
  await user.click(within(dlg).getByRole('checkbox', { name: /还需要再改/ }));
  await user.click(send);
  await waitFor(() => expect(within(dlg).getByLabelText('往来回复')).toHaveTextContent('手机上还是小'));
  expect(within(dlg).getByLabelText('往来回复')).toHaveTextContent('要求再改');
  expect(within(dlg).queryByRole('checkbox', { name: /还需要再改/ })).toBeNull();

  const no = within(dlg).getByRole('heading').textContent!.match(/FB-\d+/)![0];
  openApp(`/help/feedback?no=${no}`, 'U01');
  const opened = await screen.findByRole('dialog');
  expect(opened).toHaveTextContent('要求再改 1 次');
  expect(opened).toHaveTextContent('待处理');
}, 60000);

test('AI 代写的回复以「AI回复：」开头：往来回复和列表里显示高亮标签，正文去掉前缀；普通回复不变', async () => {
  expect(splitAi('AI回复：已修改')).toEqual({ ai: true, text: '已修改' });
  expect(splitAi('  AI回复:已修改')).toEqual({ ai: true, text: '已修改' });
  expect(splitAi('已修改，AI回复：不算')).toEqual({ ai: false, text: '已修改，AI回复：不算' });
  expect(splitAi('已修改', 'AI助手')).toEqual({ ai: true, text: '已修改' });
  expect(splitAi('已修改', '系统管理员')).toEqual({ ai: false, text: '已修改' });
  const user = userEvent.setup();
  openApp('/system/audit', 'U04');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  await user.type(screen.getByLabelText('反馈内容'), '首页颜色太素');
  await user.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  openApp('/help/feedback', 'U01');
  await user.click((await screen.findAllByText('首页颜色太素')).at(-1)!);
  await user.click(screen.getByRole('radio', { name: '处理中' }));
  await user.type(screen.getByLabelText('回复'), 'AI回复：需要先确认两点');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByTitle('AI回复：需要先确认两点')).toHaveTextContent('AI回复需要先确认两点');

  await user.click((await screen.findAllByText('首页颜色太素')).at(-1)!);
  const thread = within(screen.getByRole('dialog')).getByLabelText('往来回复');
  const item = thread.querySelector('.fb-reply.by-ai') as HTMLElement;
  expect(item).not.toBeNull();
  expect(within(item).getByText('AI回复')).toHaveClass('ai-tag');
  expect(within(item).getByText('需要先确认两点').tagName).toBe('P');
}, 60000);


test('处理人回复分两种：机器人账号的用主色「AI回复」，其他处理人用琥珀色「管理员回复」', async () => {
  setNow('2026-10-24 10:00:00');
  const user = userEvent.setup();
  openApp('/system/audit', 'U04');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  await user.type(screen.getByLabelText('反馈内容'), '按钮太窄');
  await user.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  openApp('/help/feedback', 'U01');
  await user.click((await screen.findAllByText('按钮太窄')).at(-1)!);
  await user.click(screen.getByRole('radio', { name: '处理中' }));
  await user.type(screen.getByLabelText('回复'), '已加宽');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByTitle('管理员回复：已加宽')).toBeInTheDocument();
  await user.click((await screen.findAllByText('按钮太窄')).at(-1)!);
  const item = within(screen.getByRole('dialog')).getByLabelText('往来回复').querySelector('.fb-reply.by-admin') as HTMLElement;
  expect(within(item).getByText('管理员回复')).toHaveClass('ai-tag', 'admin');
  setNow(null);
}, 60000);

test('列表只拿摘要：最新回复显示前 200 字，点开一条再取完整回复全文', async () => {
  const user = userEvent.setup();
  openApp('/system/audit', 'U04');
  await user.click(await screen.findByRole('button', { name: '问题反馈' }));
  await user.type(screen.getByLabelText('反馈内容'), '导出的表格少一列');
  await user.click(screen.getByRole('button', { name: '提交' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  const long = `已在导出里补上设备编号列${'说明'.repeat(150)}结尾在这里`;
  openApp('/help/feedback', 'U01');
  await user.click((await screen.findAllByText('导出的表格少一列')).at(-1)!);
  await user.click(await screen.findByRole('radio', { name: '已解决' }));
  await user.click(screen.getByLabelText('回复'));
  await user.paste(long);
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // 列表里的最新回复是前 200 字，后面的「结尾在这里」不在列表里
  const cell = await screen.findByText((_, el) => !!el?.classList.contains('cm-cell') && !!el.textContent?.includes('已在导出里补上设备编号列'));
  expect(cell.textContent).toContain(long.slice(0, 200));
  expect(cell.textContent).not.toContain('结尾在这里');

  await user.click((await screen.findAllByText('导出的表格少一列')).at(-1)!);
  const dlg = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dlg).getByLabelText('往来回复')).toHaveTextContent('结尾在这里'));
  expect(within(dlg).getByLabelText('往来回复')).toHaveTextContent(long);
}, 60000);
