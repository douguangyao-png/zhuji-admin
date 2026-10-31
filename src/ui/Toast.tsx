import { create } from 'zustand';
import { Icon } from './Icon';

export interface ToastOpts { undo?: () => void | Promise<unknown>; tone?: 'bad' }
interface ToastItem { id: number; text: string; opts: ToastOpts }

export const useToastStore = create<{ items: ToastItem[] }>(() => ({ items: [] }));

let nextId = 0;

const remove = (id: number): void => {
  useToastStore.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
};

export const toast = (text: string, opts: ToastOpts = {}): void => {
  const id = nextId++;
  useToastStore.setState((s) => ({ items: [...s.items, { id, text, opts }] }));
  setTimeout(() => remove(id), opts.undo ? 10000 : 4000);
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} role="status" className="toast" data-tone={t.opts.tone}>
          <Icon name={t.opts.tone === 'bad' ? 'alert' : 'check'} />
          <span>{t.text}</span>
          {t.opts.undo && (
            <button
              type="button"
              onClick={() => {
                const r = t.opts.undo!();
                remove(t.id);
                if (r instanceof Promise) r.catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), { tone: 'bad' }));
              }}
            >
              撤销
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
