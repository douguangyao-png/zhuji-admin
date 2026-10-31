import type { Rng } from './rng';

const SUR = '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文';
const GIV = '伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀霞平刚桂英华玉兰红斌鹏辉玲燕晨宇浩然欣怡子轩梓涵一诺思远雨萱佳琪晓东建国志强海燕春梅晓明文静雪梅丹丹婷婷';

/** 随机中文姓名（演示用，非真实人员） */
export function personName(r: Rng) {
  const g = [...GIV];
  const n = r.chance(0.6) ? 2 : 1;
  return SUR[r.int(0, SUR.length - 1)] + Array.from({ length: n }, () => r.pick(g)).join('');
}
export const phone = (r: Rng) => `1${r.pick(['3', '5', '7', '8'])}${String(r.int(100000000, 999999999))}`;
