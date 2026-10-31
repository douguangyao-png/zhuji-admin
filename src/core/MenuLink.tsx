import { Children, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMenuNames } from './menu-names';

/** 指向某个菜单页的链接，文字是该菜单默认名时跟着改名走（如首页卡片里的入口） */
export function MenuLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const { title } = useMenuNames();
  const kids = Children.toArray(children).map((c) => (typeof c === 'string' ? title(to, c) : c));
  return <Link className={className} to={to}>{kids}</Link>;
}
