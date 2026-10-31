import { render, screen } from '@testing-library/react';
import { createIdleTimer, WARN_BEFORE_MS } from '@/core/idle';
import { log, resetLogLimit, setLogLevel, setLogReporter, type ClientLog } from './log';
import { maskIdCard, maskPhone, maskText, redact } from './mask';
import { sanitizeHtml } from './sanitize';
import { Masked } from '@/ui/Masked';

describe('脱敏', () => {
  test('手机号、证件号码、文字里的号码', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
    expect(maskPhone('010-12345678')).toBe('010-12345678');
    expect(maskIdCard('110101199003071234')).toBe('110101********1234');
    expect(maskIdCard('AB12')).toBe('***2');
    expect(maskText('张三 13812345678，身份证 11010119900307123X')).toBe('张三 138****5678，身份证 110101********123X');
  });

  test('日志对象：密码、令牌、密钥、证件号字段整值隐藏，其余字符串里的号码打码，循环引用不出错', () => {
    const o: Record<string, unknown> = { username: 'admin', password: 'Abc-123456', token: 'eyJ…', nested: { idCard: '110101199003071234', note: '电话 13812345678' }, list: [{ secret: 'x' }] };
    o.self = o;
    expect(redact(o)).toEqual({ username: 'admin', password: '***', token: '***', nested: { idCard: '***', note: '电话 138****5678' }, list: [{ secret: '***' }], self: '[循环引用]' });
    const e = redact(new Error('用户 13812345678 出错')) as { message: string };
    expect(e.message).toBe('用户 138****5678 出错');
  });

  test('脱敏展示组件：空值显示占位，号码打码', () => {
    render(<><Masked kind="phone" value="13812345678" /><Masked kind="idCard" value="110101199003071234" /><Masked kind="phone" value="" /></>);
    expect(screen.getByText('138****5678')).toBeInTheDocument();
    expect(screen.getByText('110101********1234')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('前端日志', () => {
  afterEach(() => { setLogReporter(null); setLogLevel('debug'); resetLogLimit(); vi.restoreAllMocks(); });

  test('低于输出级别的不打印；error 脱敏后上报，同一条 1 分钟只报一次；上报失败不抛错', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: ClientLog[] = [];
    setLogReporter(async (x) => { sent.push(x); throw new Error('网络断了'); });
    setLogLevel('warn');
    log.info('不该打印');
    expect(info).not.toHaveBeenCalled();
    log.error('保存失败', { password: 'Abc-123', phone: '13812345678' });
    log.error('保存失败', { password: 'Abc-123' });
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ level: 'error', message: '保存失败', data: { password: '***', phone: '138****5678' } });
    expect(JSON.stringify(sent)).not.toContain('Abc-123');
  });

  test('每分钟最多上报 10 条', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: ClientLog[] = [];
    setLogReporter(async (x) => { sent.push(x); });
    for (let i = 0; i < 15; i++) log.error(`错误 ${i}`);
    expect(sent).toHaveLength(10);
  });
});

describe('Markdown 净化', () => {
  test('去掉脚本、事件属性、javascript: 链接和 iframe，留下正常内容', () => {
    const out = sanitizeHtml('<h2 id="a">标题</h2><p onclick="alert(1)">正文<script>alert(1)</script></p><a href="javascript:alert(1)">坏链接</a><iframe src="https://x"></iframe><img src="x" onerror="alert(1)">');
    expect(out).toContain('<h2 id="a">标题</h2>');
    expect(out).toContain('<p>正文</p>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    expect(out).toContain('<a>坏链接</a>');
  });

  test('外链加 target 和 rel，站内链接、mermaid 占位保留', () => {
    const out = sanitizeHtml('<a href="https://example.com">外链</a><a href="#/help">站内</a><div class="mmd" data-src="graph%20TD"></div><img src="data:image/png;base64,AAAA">');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">外链</a>');
    expect(out).toContain('<a href="#/help">站内</a>');
    expect(out).toContain('<div class="mmd" data-src="graph%20TD"></div>');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });
});

describe('空闲超时', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('到点前 60 秒提示，到点退出；中间有操作就重新计时；0 分钟不计时', () => {
    const warn = vi.fn(), out = vi.fn();
    let t = 0;
    const timer = createIdleTimer(30, warn, out, { now: () => t });
    vi.advanceTimersByTime(29 * 60_000 - 1);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledWith(WARN_BEFORE_MS);
    t += 60_000;
    timer.touch();
    vi.advanceTimersByTime(29 * 60_000);
    expect(out).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(out).toHaveBeenCalledTimes(1);
    timer.stop();

    const none = vi.fn();
    createIdleTimer(0, none, none);
    vi.advanceTimersByTime(24 * 3600_000);
    expect(none).not.toHaveBeenCalled();
  });

  test('1 秒内的连续操作只重排一次；reset 不受这个限制', () => {
    const out = vi.fn();
    let t = 0;
    const timer = createIdleTimer(1, () => {}, out, { now: () => t });
    vi.advanceTimersByTime(59_000);
    t = 500;
    timer.touch(); // 距上次不到 1 秒，不重排
    vi.advanceTimersByTime(1_000);
    expect(out).toHaveBeenCalledTimes(1);
    timer.reset();
    vi.advanceTimersByTime(59_999);
    expect(out).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(out).toHaveBeenCalledTimes(2);
  });
});
