import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { IdleGuard } from './IdleGuard';
import { Watermark } from './Watermark';
import { ConfirmHost } from '@/ui/Confirm';
import { ExportHost } from '@/core/export';
import { HoverHint } from '@/ui/HoverHint';
import { Toaster } from '@/ui/Toast';
import { useThemeStore } from '@/lib/theme';
import { readCollapsed, setCollapsed, Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { FeedbackDock } from '@/features/help/FeedbackButton';

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Shell() {
  const { pathname } = useLocation();
  useEffect(() => { document.documentElement.classList.toggle('nav-c', readCollapsed()); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') setCollapsed(!document.documentElement.classList.contains('nav-c'));
      else if (e.shiftKey && e.key.toLowerCase() === 't') useThemeStore.getState().cycle();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="app">
      <Sidebar />
      <main className="main"><Topbar /><ErrorBoundary resetKey={pathname}><Outlet /></ErrorBoundary></main>
      <Watermark />
      <IdleGuard />
      <FeedbackDock />
      <Toaster />
      <ConfirmHost />
      <ExportHost />
      <HoverHint />
    </div>
  );
}
