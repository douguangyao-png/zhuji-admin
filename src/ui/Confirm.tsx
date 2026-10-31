import { useEffect } from 'react';
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

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;
  const { title, text, okLabel, danger } = current.opts;
  return (
    <>
      <div className="scrim" onClick={() => settle(false)} />
      <div className="dialog sm" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="dlg-h"><div><h3>{title}</h3><p>{text}</p></div></div>
        <div className="dlg-f">
          <span className="grow" />
          <button type="button" className="btn" onClick={() => settle(false)}><Icon name="x" />
            取消
          </button>
          <button
            type="button"
            autoFocus
            className={danger ? 'btn btn-ds' : 'btn btn-p'}
            onClick={() => settle(true)}
          ><Icon name="check" />
            {okLabel ?? '确定'}
          </button>
        </div>
      </div>
    </>
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
