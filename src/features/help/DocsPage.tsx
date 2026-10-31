import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { isDark, useThemeStore } from '@/lib/theme';
import { sanitizeHtml } from '@/lib/sanitize';

// 项目 docs 下的 Markdown 文档在构建时打进来；FIRST 排在最前，其余按名称排
const RAW = import.meta.glob('../../../docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FIRST = '开发指南';

export const DOCS = Object.entries(RAW).map(([p, text]) => ({ key: p.split('/').pop()!.replace(/\.md$/, ''), text }))
  .sort((a, b) => (a.key === FIRST ? -1 : b.key === FIRST ? 1 : a.key.localeCompare(b.key, 'zh')));

const slug = (s: string) => s.trim().replace(/[\s`*]+/g, '-').replace(/[^\w一-龥.-]/g, '');

export function DocsPage() {
  const { name } = useParams();
  const doc = DOCS.find((d) => d.key === name);
  const theme = useThemeStore((s) => s.theme);
  const body = useRef<HTMLDivElement>(null);
  const [mermaidErr, setMermaidErr] = useState('');

  const { html, toc } = useMemo(() => {
    if (!doc) return { html: '', toc: [] as { level: number; text: string; id: string }[] };
    const toc: { level: number; text: string; id: string }[] = [];
    const r = new marked.Renderer();
    r.heading = (text, level, raw) => {
      const id = slug(raw);
      if (level <= 3) toc.push({ level, text: raw, id });
      return `<h${level} id="${id}">${text}</h${level}>`;
    };
    r.code = (code, lang) => (lang === 'mermaid'
      ? `<div class="mmd" data-src="${encodeURIComponent(code)}"></div>`
      : `<pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`);
    return { html: sanitizeHtml(marked.parse(doc.text, { renderer: r, gfm: true, async: false }) as string), toc };
  }, [doc]);

  // 净化后的 HTML 挂到容器上；mermaid 图由 mermaid 在严格模式下生成
  useEffect(() => { if (body.current) body.current.innerHTML = html; }, [html]);

  useEffect(() => {
    const nodes = [...(body.current?.querySelectorAll<HTMLDivElement>('.mmd') ?? [])];
    // 单元测试不加载 mermaid（jsdom 里只能报错，还很慢）
    if (!nodes.length || import.meta.env.MODE === 'test') return;
    let live = true;
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: isDark(theme) ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
      for (const [i, n] of nodes.entries()) {
        try {
          const { svg } = await mermaid.render(`mmd-${name}-${i}-${Date.now()}`, decodeURIComponent(n.dataset.src!));
          if (live) n.innerHTML = svg;
        } catch (e) { if (live) setMermaidErr(String((e as Error).message ?? e)); }
      }
    }).catch((e: Error) => { if (live) setMermaidErr(e.message); });
    return () => { live = false; };
  }, [html, theme, name]);

  if (!doc) return <Navigate to={`/help/docs/${DOCS[0].key}`} replace />;
  return (
    <div className="page docs">
      <aside className="docs-nav">
        <div className="docs-list">
          {DOCS.map((d) => <Link key={d.key} to={`/help/docs/${d.key}`} className={d.key === name ? 'on' : undefined}>{d.key}</Link>)}
        </div>
        <nav className="docs-toc" aria-label="目录">
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={`l${t.level}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{t.text}</a>
          ))}
        </nav>
      </aside>
      <article className="md card">
        <div className="docs-tip fg3">测试版可见，正式版不显示。内容取自项目 docs 目录，随版本发布更新。</div>
        {mermaidErr && <div className="hint err">图表渲染失败：{mermaidErr}</div>}
        <div ref={body} />
      </article>
    </div>
  );
}
