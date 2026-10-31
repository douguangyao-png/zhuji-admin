import type { FeatureKey } from '@/api/types';
import { docDate, docPath, registerDoc, splitDocNos } from './doc';

const all = () => true;
const only = (...perms: string[]) => (p?: string) => !p || perms.includes(p);
const off = (f: FeatureKey) => (x?: FeatureKey) => x !== f;

registerDoc('SL', [{ to: '/example', perm: 'example:approve', feature: 'example', hash: 'all' }, { to: '/example/mine', perm: 'example:view', feature: 'example' }]);
registerDoc('BX', [{ to: '/repairs', perm: 'example:edit' }]);

test('从文字里拆出登记过前缀的单号：顿号、箭头分隔的都认，流水不够、没登记的不认', () => {
  expect(splitDocNos('SL20261017001 → BX20261017002').filter((p) => p.no).map((p) => p.text)).toEqual(['SL20261017001', 'BX20261017002']);
  expect(splitDocNos('SL20261017001、SL20261017002').map((p) => p.text)).toEqual(['SL20261017001', '、', 'SL20261017002']);
  expect(splitDocNos('SL2026101700 太短 XC20261017001 没有登记').some((p) => p.no)).toBe(false);
  expect(docDate('SL20260905012')).toBe('2026-09-05');
});

test('单号落到哪个页面：按顺序取第一个有权限的，都没有或模块关了就不给链接', () => {
  expect(docPath('示例', 'SL20261017001', all, all)).toBe('/example?no=SL20261017001#all');
  expect(docPath('示例', 'SL20261017001', only('example:view'), all)).toBe('/example/mine?no=SL20261017001');
  expect(docPath('示例', 'SL20261017001', only('op:print'), all)).toBeNull();
  expect(docPath('示例', 'SL20261017001', all, off('example'))).toBeNull();
});

test('前缀不是两位大写字母时登记报错', () => {
  expect(() => registerDoc('S1', [])).toThrow('两位大写字母');
});
