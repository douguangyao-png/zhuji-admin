// 前端 error 日志上报到 POST /client-logs；内容已在 lib/log.ts 里脱敏，上报失败直接丢掉
import { setLogReporter } from '@/lib/log';
import { post } from './http';

setLogReporter((entry) => post('/client-logs', entry));
