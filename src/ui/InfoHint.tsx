import { Icon } from './Icon';

/** The ⓘ icon beside a title or label; HoverHint turns its title into a tooltip (UX-11). */
export const InfoHint = ({ text }: { text: string }) => (
  <span className="h-i" tabIndex={0} title={text}><Icon name="info" /></span>
);
