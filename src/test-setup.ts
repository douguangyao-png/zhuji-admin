import '@testing-library/jest-dom/vitest';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
globalThis.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null, addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
})) as unknown as typeof matchMedia;
// jsdom 没有 canvas，画布组件会跳过绘制
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = () => {};
// react-router 7 导航时会构造 Request；jsdom 的 AbortSignal 不是 Node 那一份，带上就报错，测试里去掉 signal
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    void _signal;
    super(input, rest);
  }
} as typeof Request;

// 机器负载高时页面首屏慢，findBy 默认 1 秒不够
import { configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 5000 });
