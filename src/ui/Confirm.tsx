import * as RD from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Icon } from '@/ui/Icon';

export interface ConfirmOpts { title: string; text: string; okLabel?: string; danger?: boolean }
interface Pending { opts: ConfirmOpts; resolve: (ok: boolean) => void }

export const useConfirmStore = create<{ current?: Pending }>(() => ({ current: undefined }));

const settle = (ok: boolean): void => {
  const current = useConfirmStore.getState().current;
  if (!current) return;
  useConfirmStore.setState({ current: undefined });
  current.resolve(ok);
};

export const confirm = (opts: ConfirmOpts): Promise<boolean> => {
  const prev = useConfirmStore.getState().current;
  if (prev) prev.resolve(false);
  return new Promise<boolean>((resolve) => {
    useConfirmStore.setState({ current: { opts, resolve } });
  });
};

export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);

  if (!current) return null;
  const { title, text, okLabel, danger } = current.opts;
  // Esc 由 Radix 处理且只关最上层：确认框叠在对话框上时，Esc 只取消确认框
  return (
    <RD.Root open onOpenChange={(o) => { if (!o) settle(false); }}>
      <RD.Portal>
        <RD.Overlay className="scrim" />
        <RD.Content className="dialog sm" role="alertdialog" tabIndex={-1} onOpenAutoFocus={(e) => {
          // 焦点落在「确定」（原 autoFocus 行为）
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-ok]')?.focus();
        }}>
          <div className="dlg-h">
            <div><RD.Title asChild><h3>{title}</h3></RD.Title><RD.Description asChild><p>{text}</p></RD.Description></div>
          </div>
          <div className="dlg-f">
            <span className="grow" />
            <button type="button" className="btn" onClick={() => settle(false)}><Icon name="x" />
              取消
            </button>
            <button
              type="button"
              data-ok
              className={danger ? 'btn btn-ds' : 'btn btn-p'}
              onClick={() => settle(true)}
            ><Icon name="check" />
              {okLabel ?? '确定'}
            </button>
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** 删除前的二次确认：标题统一「您确定要删除吗？」；label 不是「删除」的（撤销、移出等）仍按原来的叫法 */
export const deleteConfirm = (what: string, label = '删除'): Promise<boolean> =>
  confirm({
    title: label === '删除' ? '您确定要删除吗？' : `${label}？`,
    text: `将${label}：${what}`,
    okLabel: label,
    danger: true,
  });
