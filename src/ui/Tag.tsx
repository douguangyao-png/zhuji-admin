export type Tone = 'good' | 'warn' | 'bad' | 'flat' | 'info';

// Same table as docs/design-source/mockups/mock.js TONE.
const TONE_RE: Partial<Record<Tone, RegExp>> = {
  good: /^(release|success|online|enabled|active|default|received|done|approved|bound|resolved|yes)$/i,
  warn: /^(debug|beta|rc|executing|partial( success)?|warning|pending|queued|running|major|minor|waiting.*)$/i,
  bad: /^(failure|failed|critical|alarm|hotfix|error|rejected|disabled|unacknowledged)$/i,
  flat: /^(offline|deprecated|config|unexecuted|cleared|indeterminate|no|—|-)$/i,
};

export function toneOf(label: string): Tone {
  const tone = (Object.keys(TONE_RE) as Tone[]).find((t) => TONE_RE[t]!.test(label));
  return tone ?? 'info';
}

// v2 badge tones; flat is the plain badge
const BD: Record<Tone, string> = { good: 'good', warn: 'warn', bad: 'crit', flat: '', info: 'info' };

/** 「停用」「已停用」一律红色浅底标签（灰框像按钮，改和其他状态标签同一风格），不管调用处给的 tone */
const STOPPED = /^(停用|已停用)$/;

/**
 * 状态标签。`solid` 实底（红底白字等），只给需要一眼看到的状态用；
 * `alert` 再加呼吸动效（如「已过期」），系统设置了减少动态时只保留实底颜色。
 */
export function Tag({ children, tone, solid, alert }: { children: string; tone?: Tone; solid?: boolean; alert?: boolean }) {
  const t = STOPPED.test(children) ? 'bad' : tone ?? toneOf(children);
  return <span className={['bd', BD[t], 'tag', t, (solid || alert) && 'fill', alert && 'tag-alert'].filter(Boolean).join(' ')}>{children}</span>;
}

// Explicit maps: these values collide with the generic TONE table (e.g. ALARM/ACTIVE aren't "good").
const STATUS_TONE: Record<string, Tone> = {
  ONLINE: 'good',
  OFFLINE: 'flat',
  ALARM: 'bad',
  ACTIVE: 'bad',
  ACKNOWLEDGED: 'warn',
  CLEARED: 'flat',
};

const SEVERITY_TONE: Record<string, Tone> = {
  CRITICAL: 'bad',
  MAJOR: 'warn',
  MINOR: 'info',
  WARNING: 'flat',
  INDETERMINATE: 'flat',
};

export const StatusTag = ({ value }: { value: string }) => <Tag tone={STATUS_TONE[value] ?? 'info'}>{value}</Tag>;
export const SeverityTag = ({ value }: { value: string }) => <Tag tone={SEVERITY_TONE[value] ?? 'flat'}>{value}</Tag>;
