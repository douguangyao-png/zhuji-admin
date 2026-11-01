import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Dialog } from './Dialog';
import { ConfirmHost, confirm } from './Confirm';
import { Popover, usePop } from './Popover';
import { Select } from './Select';
import { Tabs } from './Tabs';

function DialogDemo({ onClosed }: { onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开</button>
      {open && <Dialog title="标题" sub="说明" onClose={() => { setOpen(false); onClosed?.(); }} footer={<button>确定</button>}><input aria-label="名称" /></Dialog>}
    </>
  );
}

describe('Dialog', () => {
  test('打开后焦点进入弹窗，role 与标题关联', async () => {
    const user = userEvent.setup();
    render(<DialogDemo />);
    await user.click(screen.getByText('打开'));
    const dlg = await screen.findByRole('dialog');
    expect(dlg).toContainElement(document.activeElement as HTMLElement);
    expect(dlg).toHaveAccessibleName('标题');
    expect(dlg).toHaveAccessibleDescription('说明');
  });

  test('Tab 在弹窗内循环，不会跑到弹窗外的按钮', async () => {
    const user = userEvent.setup();
    render(<DialogDemo />);
    await user.click(screen.getByText('打开'));
    const dlg = await screen.findByRole('dialog');
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dlg).toContainElement(document.activeElement as HTMLElement);
    }
  });

  test('按 Esc 关闭，关闭后焦点回到触发它的按钮', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<DialogDemo onClosed={closed} />);
    const trigger = screen.getByText('打开');
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(closed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  test('点遮罩关闭', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<DialogDemo onClosed={closed} />);
    await user.click(screen.getByText('打开'));
    await screen.findByRole('dialog');
    await user.click(document.querySelector('.scrim') as HTMLElement);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  test('弹窗里的下拉按 Esc 只收起下拉，弹窗留着；选一项后值改变', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    function Host() {
      const [v, setV] = useState('a');
      return <Dialog title="选择" onClose={closed}><Select aria-label="类别" value={v} onChange={(e) => setV(e.target.value)}><option value="a">甲</option><option value="b">乙</option></Select></Dialog>;
    }
    render(<Host />);
    const btn = await screen.findByRole('button', { name: '类别' });
    await user.click(btn);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(btn);
    await user.click(await screen.findByRole('option', { name: '乙' }));
    expect(btn).toHaveTextContent('乙');
    expect(closed).not.toHaveBeenCalled();
  });
});

describe('Confirm', () => {
  test('叠在对话框上时按 Esc 只取消确认框，对话框留着', async () => {
    const user = userEvent.setup();
    const closed = vi.fn();
    render(<><Dialog title="底下的对话框" onClose={closed}>内容</Dialog><ConfirmHost /></>);
    const p = confirm({ title: '确认？', text: '要继续吗', danger: true });
    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveAccessibleName('确认？');
    expect(alert).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await expect(p).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('焦点默认在「确定」，点确定返回 true', async () => {
    const user = userEvent.setup();
    render(<ConfirmHost />);
    const p = confirm({ title: '删除？', text: '不可恢复' });
    const ok = await screen.findByRole('button', { name: '确定' });
    expect(ok).toHaveFocus();
    await user.click(ok);
    await expect(p).resolves.toBe(true);
  });
});

describe('Popover', () => {
  function PopDemo() {
    const pop = usePop();
    return (
      <>
        <button ref={pop.anchor} onClick={pop.toggle}>菜单</button>
        <button>别处</button>
        <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} role="menu" label="操作"><button role="menuitem">删除</button></Popover>
      </>
    );
  }

  test('Esc 关闭，焦点回到锚点按钮', async () => {
    const user = userEvent.setup();
    render(<PopDemo />);
    const anchor = screen.getByText('菜单');
    await user.click(anchor);
    expect(await screen.findByRole('menu', { name: '操作' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(anchor).toHaveFocus();
  });

  test('点外面关闭；再点锚点按钮只开关一次，不会关了又开', async () => {
    const user = userEvent.setup();
    render(<PopDemo />);
    const anchor = screen.getByText('菜单');
    await user.click(anchor);
    await screen.findByRole('menu');
    await user.click(screen.getByText('别处'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await user.click(anchor);
    await screen.findByRole('menu');
    await user.click(anchor);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('Tabs', () => {
  const items = [{ key: 'a', label: '甲' }, { key: 'b', label: '乙' }, { key: 'c', label: '丙' }];
  function TabsDemo() {
    const [v, setV] = useState('a');
    return <MemoryRouter><Tabs items={items} value={v} onChange={setV} /></MemoryRouter>;
  }

  test('只有当前页签在 Tab 顺序里', () => {
    render(<TabsDemo />);
    expect(screen.getByRole('tab', { name: '甲' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: '乙' })).toHaveAttribute('tabindex', '-1');
  });

  test('方向键、Home、End 在页签间移动并选中，焦点跟着走，首尾循环', async () => {
    const user = userEvent.setup();
    render(<TabsDemo />);
    screen.getByRole('tab', { name: '甲' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '乙' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '乙' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: '丙' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: '甲' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: '丙' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: '甲' })).toHaveFocus();
  });
});
