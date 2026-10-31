import { render, screen } from '@testing-library/react';
import { Tag } from './Tag';

test('「停用」「已停用」不管传什么 tone 都是红色浅底标签、不实底；「已过期」仍实底加呼吸', () => {
  render(<><Tag tone="flat">停用</Tag><Tag tone="flat">已停用</Tag><Tag tone="good">启用</Tag><Tag tone="bad" solid alert>已过期</Tag></>);
  expect(screen.getByText('停用')).toHaveClass('bd', 'crit');
  expect(screen.getByText('停用')).not.toHaveClass('fill');
  expect(screen.getByText('已停用')).toHaveClass('crit');
  expect(screen.getByText('已停用')).not.toHaveClass('fill');
  expect(screen.getByText('启用')).not.toHaveClass('fill');
  expect(screen.getByText('已过期')).toHaveClass('crit', 'fill', 'tag-alert');
});
