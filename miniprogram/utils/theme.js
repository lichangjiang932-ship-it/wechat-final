// utils/theme.js - 主题管理
const { logger } = require('../config/constants');

// 主题枚举
const ThemeMode = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system', // 跟随系统
};

// 存储键
const STORAGE_KEY = 'app_theme_mode';

// 当前主题
let currentTheme = ThemeMode.LIGHT;

/**
 * 初始化主题
 * @returns {string} 当前主题
 */
function initTheme() {
  // 从存储读取
  const savedMode = wx.getStorageSync(STORAGE_KEY) || ThemeMode.SYSTEM;
  
  if (savedMode === ThemeMode.SYSTEM) {
    // 跟随系统
    const systemInfo = wx.getSystemInfoSync();
    currentTheme = systemInfo.theme || ThemeMode.LIGHT;
    
    // 监听系统主题变化
    wx.onThemeChange((res) => {
      currentTheme = res.theme;
      notifyThemeChange(currentTheme);
    });
  } else {
    currentTheme = savedMode;
  }
  
  return currentTheme;
}

/**
 * 设置主题
 * @param {string} mode - 'light' | 'dark' | 'system'
 */
function setTheme(mode) {
  wx.setStorageSync(STORAGE_KEY, mode);
  
  if (mode === ThemeMode.SYSTEM) {
    const systemInfo = wx.getSystemInfoSync();
    currentTheme = systemInfo.theme || ThemeMode.LIGHT;
  } else {
    currentTheme = mode;
  }
  
  notifyThemeChange(currentTheme);
  logger.info('主题已切换:', currentTheme);
}

/**
 * 获取当前主题
 * @returns {string}
 */
function getTheme() {
  return currentTheme;
}

/**
 * 是否深色模式
 * @returns {boolean}
 */
function isDark() {
  return currentTheme === ThemeMode.DARK;
}

/**
 * 通知主题变化
 */
const themeListeners = [];

function onThemeChange(callback) {
  if (!themeListeners.includes(callback)) {
    themeListeners.push(callback);
  }
}

function offThemeChange(callback) {
  const index = themeListeners.indexOf(callback);
  if (index > -1) {
    themeListeners.splice(index, 1);
  }
}

function notifyThemeChange(theme) {
  themeListeners.forEach(cb => {
    try {
      cb(theme);
    } catch (e) {
      logger.error('主题回调执行失败:', e.message);
    }
  });
  // 同步到当前所有已实例化的页面
  try {
    const pages = getCurrentPages() || [];
    pages.forEach((p) => {
      if (p && p.setData) p.setData({ theme, themeClass: themeClass(theme) });
    });
  } catch (e) {}
  // 同步导航栏颜色
  try {
    wx.setNavigationBarColor({
      frontColor: theme === 'light' ? '#000000' : '#ffffff',
      backgroundColor: theme === 'light' ? '#F6F1EA' : '#0F0D0B',
    });
  } catch (e) {}
}

function themeClass(theme) {
  const t = theme || currentTheme;
  return t === 'light' ? 'theme-light' : 'theme-dark';
}

function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * 获取主题存储模式
 * @returns {string}
 */
function getThemeMode() {
  return wx.getStorageSync(STORAGE_KEY) || ThemeMode.SYSTEM;
}

module.exports = {
  ThemeMode,
  initTheme,
  setTheme,
  getTheme,
  getThemeMode,
  isDark,
  onThemeChange,
  offThemeChange,
  themeClass,
  toggleTheme,
};