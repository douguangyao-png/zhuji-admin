import { describe, expect, test } from 'vitest';
import { csvRecords } from './csv';
import { buildXlsx, dateKind, parseXlsx, readSheet, serial, toCsv } from './sheet';

describe('xlsx 读写', () => {
  test('生成的模板能原样读回来', async () => {
    const rows = [['编码', '名称', '备注'], ['007', '示例名称乙', '含,逗号和"引号"'], ['', '只有中间', ''], ['a<b&c', '', '换\n行']];
    const back = await parseXlsx(buildXlsx(rows));
    expect(back).toEqual([['编码', '名称', '备注'], ['007', '示例名称乙', '含,逗号和"引号"'], ['', '只有中间'], ['a<b&c', '', '换\n行']]);
    expect(csvRecords(toCsv(back))[0]).toEqual({ 编码: '007', 名称: '示例名称乙', 备注: '含,逗号和"引号"' });
  });

  test('日期格式与后端同一套规则', () => {
    const custom = new Map([[164, 'yyyy/m/d'], [165, '0.00"天"'], [166, 'yyyy-mm-dd hh:mm']]);
    expect([dateKind(14, custom), dateKind(20, custom), dateKind(22, custom), dateKind(164, custom), dateKind(165, custom), dateKind(166, custom)]).toEqual([1, 3, 2, 1, 0, 2]);
    expect(serial(46310, 1)).toBe('2026-10-15');
    expect(serial(0.5625, 3)).toBe('13:30');
    expect(serial(46310.5, 2)).toBe('2026-10-15 12:00');
    expect(serial(0, 1, true)).toBe('1904-01-01');
  });

  test('.xls 提示另存，CSV 去 BOM、GBK 能读', async () => {
    await expect(readSheet(new File(['x'], '旧表.xls'))).rejects.toThrow(/另存为 \.xlsx/);
    expect(csvRecords(await readSheet(new File(['﻿编号,名称\n1,模拟人'], 'a.csv')))).toEqual([{ 编号: '1', 名称: '模拟人' }]);
    const gbk = new Uint8Array([0xb1, 0xe0, 0xba, 0xc5, 0x0a, 0x31]); // 「编号\n1」的 GBK 编码
    expect(await readSheet(new File([gbk], 'b.csv'))).toBe('编号\n1');
  });

  test('模拟层选 .xlsx 直接在浏览器里解析', async () => {
    const f = new File([buildXlsx([['名称', '编码'], ['一号会议室', '0601']]) as BlobPart], '房间.xlsx');
    expect(csvRecords(await readSheet(f))).toEqual([{ 名称: '一号会议室', 编码: '0601' }]);
  });
});
