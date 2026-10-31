// HTML 净化：Markdown 渲染出的 HTML 只留白名单里的标签和属性，去掉脚本、事件属性和 javascript: 链接；
// 外链统一加 target="_blank" rel="noopener noreferrer"。不要绕过它把任何外来 HTML 塞进页面
const TAGS = new Set(['a', 'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'em', 'strong', 'del', 'b', 'i', 's',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'div', 'sup', 'sub', 'details', 'summary', 'kbd']);
const ATTRS: Record<string, string[]> = { div: ['data-src'], a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], th: ['align'], td: ['align'], '*': ['id', 'class'] };
/** 链接、图片只认这些开头：http(s)、站内哈希、相对路径、mailto；图片另认 data:image */
const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/|[^:/?#]+(?:[/?#]|$))/i;
const SAFE_IMG = /^data:image\/(png|jpe?g|gif|webp);/i;

function clean(node: Element) {
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();
    if (!TAGS.has(tag)) {
      // 脚本、样式、iframe 等连内容一起去掉；其他不认识的标签留下文字
      if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template'].includes(tag)) child.remove();
      else child.replaceWith(...child.childNodes);
      continue;
    }
    const allowed = [...(ATTRS[tag] ?? []), ...ATTRS['*']];
    for (const a of [...child.attributes]) if (!allowed.includes(a.name.toLowerCase())) child.removeAttribute(a.name);
    for (const key of ['href', 'src']) {
      const v = child.getAttribute(key);
      if (v === null) continue;
      const t = v.trim().replace(/[\u0000-\u001f\s]+/g, '');
      const ok = (key === 'src' && SAFE_IMG.test(t)) || (SAFE_URL.test(t) && !/^(javascript|vbscript|data):/i.test(t));
      if (!ok) child.removeAttribute(key);
    }
    if (tag === 'a' && /^https?:/i.test(child.getAttribute('href') ?? '')) {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }
    clean(child);
  }
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';
  clean(root);
  return root.innerHTML;
}
