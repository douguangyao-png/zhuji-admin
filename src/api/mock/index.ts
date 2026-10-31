// 模拟后端的入口：先登记各模块的接口和种子，再挂上种子函数
import './core';
import './captcha';
import './sm2';
import './integration';
import './usersync';
import './notify';
import { setSeed } from './db';
import { buildSeed } from './seed';

const modules = import.meta.glob('../../features/*/mock.ts', { eager: true });
void modules;
setSeed(buildSeed);
