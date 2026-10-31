import { Icon } from '@/ui/Icon';
import { Popover, usePop } from '@/ui/Popover';
import { THEMES, THEME_NAMES, useBgStore, useThemeStore } from '@/lib/theme';

const row = { display: 'flex', alignItems: 'center', gap: 10, width: '100%' } as const;

/** 顶栏、登录页共用的主题菜单：上面白天和黑夜两个主题，下面「背景随时段变化」开关 */
export function ThemeMenu({ className = 'btn btn-g btn-ic' }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();
  const { on, period, setOn } = useBgStore();
  const bgText = on ? `${period.name}` : '关';
  const pop = usePop();
  return (
    <>
      <button type="button" ref={pop.anchor} className={className} title={`主题：${THEME_NAMES[theme]}，背景：${bgText}（Shift+T 在白天和黑夜之间切换）`} aria-label="切换主题" aria-haspopup="menu" onClick={pop.toggle}>
        <Icon name="sparkles" />
      </button>
      <Popover anchor={pop.anchor} open={pop.open} onClose={pop.close} role="menu" label="主题">
        <div role="group" aria-label="主题">
          <div className="pop-l" aria-hidden>主题</div>
          {THEMES.map((t) => (
            <button key={t} type="button" role="menuitemradio" aria-checked={t === theme} data-set-theme={t} className={`pop-i${t === theme ? ' on' : ''}`}
              style={row} onClick={() => { setTheme(t); pop.close(); }}>
              <span className={`thm-sw ${t}`} aria-hidden />{THEME_NAMES[t]}<Icon name="check" className="ck" />
            </button>
          ))}
        </div>
        <div className="pop-sep" aria-hidden />
        <button type="button" role="menuitemcheckbox" aria-checked={on} data-bg-auto className={`pop-i${on ? ' on' : ''}`} style={row} onClick={() => setOn(!on)}>
          <Icon name="check" className="ck" />背景随时段变化<span className="s">{on ? bgText : '已关'}</span>
        </button>
      </Popover>
    </>
  );
}
