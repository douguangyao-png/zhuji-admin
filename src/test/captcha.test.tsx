import { table } from '@/api/mock/db';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { captchaApi, setCaptchaAutoPass, type CaptchaChallenge, type TrackPoint } from '@/api/captcha';
import { get, put } from '@/api/http';
import { mockCaptchaAnswer, resetMockCaptcha, trackReject } from '@/api/mock/captcha';
import type { AuditLog, Page, Settings } from '@/api/types';
import { routes } from '@/app/App';
import { useSession } from '@/core/session';
import { freshDb, openApp } from './render';
const nameOf = (id: string) => table<{ id: string; name: string }>('org_user').get(id)!.name;


// jsdom 没有 PointerEvent，用 MouseEvent 补一个，clientX 才带得过去
if (!('PointerEvent' in window)) {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventShim;
}

let clock = 0;
let last: CaptchaChallenge | null = null;
let challenges = 0;
const realChallenge = captchaApi.challenge;

beforeEach(() => {
  freshDb();
  resetMockCaptcha();
  useSession.getState().logout();
  setCaptchaAutoPass(false);
  clock = 1000;
  challenges = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(captchaApi, 'challenge').mockImplementation(async () => { challenges++; last = await realChallenge(); return last; });
});
afterEach(() => { setCaptchaAutoPass(true); vi.restoreAllMocks(); });

const openLogin = () => render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/login'] })} /></QueryClientProvider>);
const answer = () => mockCaptchaAnswer(last!.captchaId)!;
const loginBtn = () => screen.getByRole('button', { name: '登录' });

async function fill(username: string, password: string) {
  fireEvent.change(await screen.findByLabelText('用户名'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: password } });
}

/** 像人一样拖：先快后慢，每 16 毫秒一个点 */
async function dragTo(x: number) {
  const knob = await screen.findByRole('slider', { name: '拼图滑块' });
  await waitFor(() => expect(knob).not.toHaveAttribute('aria-disabled'));
  fireEvent.pointerDown(knob, { clientX: 100, button: 0, pointerId: 1 });
  for (let i = 1; i <= 45; i++) {
    clock += 16;
    const k = i / 45;
    fireEvent.pointerMove(knob, { clientX: 100 + x * (1 - (1 - k) ** 3), pointerId: 1 });
  }
  clock += 30;
  fireEvent.pointerUp(knob, { clientX: 100 + x, pointerId: 1 });
}

test('总是需要：拖到缺口处才能点登录，通过后登录成功', async () => {
  openLogin();
  await fill('manager', 'demo');
  await screen.findByRole('slider');
  expect(loginBtn()).toBeDisabled();
  await waitFor(() => expect(last).not.toBeNull());
  await dragTo(answer());
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('验证通过'));
  expect(loginBtn()).toBeEnabled();
  fireEvent.click(loginBtn());
  expect(await screen.findByText(new RegExp(`${nameOf('U02')}，`))).toBeInTheDocument();
});

test('没对准：抖动、提示并自动换一张', async () => {
  openLogin();
  await waitFor(() => expect(last).not.toBeNull());
  const first = last!.captchaId;
  const x = answer();
  await dragTo(x > 150 ? x - 30 : x + 30);
  await waitFor(() => expect(document.querySelector('.scap')).toHaveAttribute('data-state', 'fail'));
  expect(screen.getByRole('status')).toHaveTextContent('没对准，已换一张');
  await waitFor(() => expect(challenges).toBe(2), { timeout: 3000 });
  expect(last!.captchaId).not.toBe(first);
  expect(mockCaptchaAnswer(first)).toBeUndefined();
  expect(loginBtn()).toBeDisabled();
});

test('键盘：方向键移动、Shift 一次 10 像素、回车提交', async () => {
  openLogin();
  await waitFor(() => expect(last).not.toBeNull());
  const knob = await screen.findByRole('slider', { name: '拼图滑块' });
  await waitFor(() => expect(knob).not.toHaveAttribute('aria-disabled'));
  knob.focus();
  const x = answer();
  for (let i = 0; i < Math.floor(x / 10); i++) { clock += 60; fireEvent.keyDown(knob, { key: 'ArrowRight', shiftKey: true }); }
  while (Number(knob.getAttribute('aria-valuenow')) < x - 1) { clock += 60; fireEvent.keyDown(knob, { key: 'ArrowRight' }); }
  expect(Math.abs(Number(knob.getAttribute('aria-valuenow')) - x)).toBeLessThanOrEqual(2);
  fireEvent.keyDown(knob, { key: 'Enter' });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('验证通过'));
});

test('密码错了要重新验证', async () => {
  openLogin();
  await fill('manager', 'wrong');
  await waitFor(() => expect(last).not.toBeNull());
  await dragTo(answer());
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('验证通过'));
  fireEvent.click(loginBtn());
  expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码不正确');
  await waitFor(() => expect(challenges).toBe(2));
  expect(loginBtn()).toBeDisabled();
  expect(useSession.getState().userId).toBeNull();
});

test('登录页没有演示账号和快捷登录入口', async () => {
  openLogin();
  await screen.findByLabelText('用户名');
  expect(screen.queryByText('演示账号')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /中心主任/ })).not.toBeInTheDocument();
});

test('密码错 N 次后需要：错满 2 次才出滑块', async () => {
  useSession.getState().login('U01');
  await put<Settings>('/settings', { loginCaptcha: 'after-failures', loginCaptchaAfter: 2 });
  useSession.getState().logout();
  openLogin();
  await fill('manager', 'wrong');
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(loginBtn()).toBeEnabled();
  fireEvent.click(loginBtn());
  await screen.findByRole('alert');
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  fireEvent.click(loginBtn());
  expect(await screen.findByRole('slider', { name: '拼图滑块' })).toBeInTheDocument();
  expect(loginBtn()).toBeDisabled();
});

test('关闭时没有滑块，直接登录', async () => {
  useSession.getState().login('U01');
  await put<Settings>('/settings', { loginCaptcha: 'off' });
  useSession.getState().logout();
  openLogin();
  await fill('manager', 'demo');
  await act(async () => { fireEvent.click(loginBtn()); });
  expect(await screen.findByText(new RegExp(`${nameOf('U02')}，`))).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
});

test('系统设置切换登录验证码，记操作日志', async () => {
  openApp('/system/security');
  fireEvent.click(await screen.findByRole('radio', { name: '密码错 N 次后需要' }));
  await waitFor(async () => expect((await get<Settings>('/settings')).loginCaptcha).toBe('after-failures'));
  expect(await screen.findByLabelText('连续输错几次后需要')).toHaveValue(3);
  const logs = await get<Page<AuditLog>>('/audit', { q: '登录验证码' });
  expect(logs.items[0]).toMatchObject({ action: '修改登录验证码', target: '密码错 3 次后需要' });
});

test('轨迹判定和后端一致：匀速、太快、点太少拒绝，键盘放行', () => {
  const linear: TrackPoint[] = Array.from({ length: 30 }, (_, i) => [i * 24, Math.round((i * 150) / 29)]);
  expect(trackReject(linear, 150, false)).toBe('匀速移动');
  const human: TrackPoint[] = Array.from({ length: 46 }, (_, i) => [i * 16, Math.round(150 * (1 - (1 - i / 45) ** 3))]);
  expect(trackReject(human, 150, false)).toBeNull();
  expect(trackReject(human.map(([t, x]) => [t / 4, x] as TrackPoint), 150, false)).toBe('用时过短');
  expect(trackReject([[0, 0], [400, 150]], 150, false)).toBe('采样点过少');
  const keys: TrackPoint[] = Array.from({ length: 16 }, (_, i) => [i * 40, i * 10]);
  expect(trackReject(keys, 150, true)).toBeNull();
  expect(trackReject([[0, 0], [200, 75], [400, 150]], 150, true)).toBe('键盘单步过大');
});
