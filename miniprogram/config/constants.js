// config/constants.js - 统一常量配置

// ==================== 日志配置 ====================
const LOG_LEVEL = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// 当前日志级别，生产环境建议设为 WARN
const CURRENT_LEVEL = LOG_LEVEL.INFO;

// 日志输出函数
const logger = {
  debug: (...args) => CURRENT_LEVEL <= LOG_LEVEL.DEBUG && console.log('[DEBUG]', ...args),
  info: (...args) => CURRENT_LEVEL <= LOG_LEVEL.INFO && console.log('[INFO]', ...args),
  warn: (...args) => CURRENT_LEVEL <= LOG_LEVEL.WARN && console.warn('[WARN]', ...args),
  error: (...args) => CURRENT_LEVEL <= LOG_LEVEL.ERROR && console.error('[ERROR]', ...args),
};

// ==================== 云开发配置 ====================
const CLOUD_CONFIG = {
  DEFAULT_ENV: 'cloud1-d8glhp7pdcd3fffba',
  STORAGE_KEY: {
    CLOUD_ENV: 'CLOUD_ENV',
    USER_INFO: 'userInfo',
    TOKEN: 'token',
    MY_WORKS: 'myWorks',
    MY_FAVORITES: 'myFavorites',
    APP_SETTINGS: 'appSettings',
  },
};

// ==================== 常用颜色 ====================
const COLORS = {
  primary: '#C9956B',
  text: '#333333',
  textLight: '#9A9288',
  background: '#F8F6F3',
  white: '#FFFFFF',
  border: '#E0DCD8',
  // 分类卡片背景
  category: {
    portrait: '#FBF0E6',
    art: '#F5EBF0',
    id_photo: '#E8F0F5',
    anime: '#FFF5E8',
    restore: '#F0F5E8',
    style: '#F5F0E8',
  },
  // 风格色系
  style: {
    real: '#C8B8A8',
    anime: '#E8A8B8',
    oil: '#D4A878',
    watercolor: '#88B8C8',
    sketch: '#A8A8A8',
    chinese: '#8EAD7A',
    cyber: '#6878C8',
    '3d': '#A88BC8',
    clay: '#C8A898',
    pixel: '#78C8A8',
    comic: '#C8888C',
    fantasy: '#C8A8D4',
  },
};

module.exports = {
  LOG_LEVEL,
  CURRENT_LEVEL,
  logger,
  CLOUD_CONFIG,
  COLORS,
};