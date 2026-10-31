import { Component, type ReactNode } from 'react';
import { log } from '@/lib/log';
import { Icon } from '@/ui/Icon';

/** 页面渲染出错时只坏这一块：显示提示和「重新加载」，错误经前端日志记录并上报 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    log.error('页面渲染出错', { error, componentStack: info.componentStack?.split('\n').slice(0, 6).join('\n') });
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // 换了页面就重新渲染
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="card card-b" role="alert">
          <b>这个页面出错了</b>
          <p className="fg3" style={{ margin: '8px 0 12px' }}>错误已记录。可以重新加载试试；还不行请在右边「问题反馈」里说一下做了什么。</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}><Icon name="refresh" />重新加载</button>
        </div>
      </div>
    );
  }
}
