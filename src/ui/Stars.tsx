import { Icon } from './Icon';

/** 五星：只读显示平均分（value 可带小数），或可点选（onPick）；不在 [min, max] 的星不可点 */
export function Stars({ value, onPick, min = 1, max = 5, label = '评分' }: { value: number; onPick?: (n: number) => void; min?: number; max?: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className="stars" role={onPick ? 'group' : 'img'} aria-label={onPick ? label : `${label} ${value ? value.toFixed(1) : '暂无'}`}>
      {[1, 2, 3, 4, 5].map((n) => onPick ? (
        <button key={n} type="button" className={`star${n <= full ? ' on' : ''}`} aria-label={`${n} 星`} aria-pressed={n === full} disabled={n < min || n > max} onClick={() => onPick(n)}>
          <Icon name="star" />
        </button>
      ) : (
        <span key={n} className={`star${n <= full ? ' on' : ''}`} aria-hidden="true"><Icon name="star" /></span>
      ))}
    </span>
  );
}
