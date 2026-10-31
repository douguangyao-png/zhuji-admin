/** 测试版才有的菜单（文档）；正式版构建时设 VITE_RELEASE=prod */
export const TESTING = import.meta.env.VITE_RELEASE !== 'prod';
