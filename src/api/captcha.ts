import { STORE } from '@/app.config';
import { post } from './http';

export interface CaptchaChallenge {
  captchaId: string;
  /** 带缺口的背景，data URL */
  image: string;
  /** 拼图块，data URL，pieceSize 见方 */
  piece: string;
  y: number;
  width: number;
  height: number;
  pieceSize: number;
}
/** [从按下起的毫秒, 拼图块 x] */
export type TrackPoint = [number, number];
export type CaptchaInput = 'pointer' | 'keyboard';

export const captchaApi = {
  challenge: () => post<CaptchaChallenge>('/auth/captcha'),
  verify: (b: { captchaId: string; x: number; track: TrackPoint[]; input: CaptchaInput }) => post<{ token: string }>('/auth/captcha/verify', b),
};

const MOCK = import.meta.env.VITE_API !== 'server';
const flag = () => { try { return localStorage.getItem(`${STORE}.captcha`) === 'auto'; } catch { return false; } };
let autoPass = MOCK && (import.meta.env.MODE === 'test' || flag());

/** 只在前端演示里生效：vitest 默认跳过滑块，走查脚本可设 localStorage <前缀>.captcha=auto；接后端时恒为 false */
export const captchaAutoPass = () => autoPass;
export const setCaptchaAutoPass = (v: boolean) => { autoPass = MOCK && v; };
