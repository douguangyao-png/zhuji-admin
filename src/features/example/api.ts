// 页面只通过这里取数改数；接真实后端时 http() 自动转到 app.config.ts 里的 apiBase，这里不用改
import { del, get, post, put } from '@/api/http';
import type { Page } from '@/api/types';
import type { ExampleInput, ExampleItem } from './types';

export const exampleApi = {
  list: (q: { q?: string; status?: string; category?: string; mine?: 1; page?: number; size?: number }) => get<Page<ExampleItem>>('/example', q),
  save: (x: ExampleInput) => (x.id ? put<ExampleItem>(`/example/${x.id}`, x) : post<ExampleItem>('/example', x)),
  remove: (id: string) => del<boolean>(`/example/${id}`),
  submit: (id: string) => post<ExampleItem>(`/example/${id}/submit`),
  importRows: (rows: ExampleInput[]) => post<{ added: number }>('/example/import', { rows }),
};
