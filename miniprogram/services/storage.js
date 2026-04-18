// services/storage.js - 统一存储管理
const { logger } = require('../config/constants');

// 存储键定义
const KEYS = {
  USER_INFO: 'userInfo',
  TOKEN: 'token',
  MY_WORKS: 'myWorks',
  MY_FAVORITES: 'myFavorites',
  APP_SETTINGS: 'appSettings',
  THEME_MODE: 'app_theme_mode',
  LAST_SYNC: 'lastSyncTime',
};

// 缓存（内存级）
const memoryCache = new Map();

/**
 * 获取数据（带内存缓存）
 */
function get(key, defaultValue = null) {
  // 先查内存缓存
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  try {
    const value = wx.getStorageSync(key);
    
    if (value === '' || value === undefined || value === null) {
      return defaultValue;
    }
    
    // 加入内存缓存
    memoryCache.set(key, value);
    return value;
  } catch (err) {
    logger.warn(`[Storage] 读取失败 ${key}:`, err.message);
    return defaultValue;
  }
}

/**
 * 设置数据（同步内存缓存）
 */
function set(key, value) {
  try {
    wx.setStorageSync(key, value);
    memoryCache.set(key, value);
    return true;
  } catch (err) {
    logger.error(`[Storage] 写入失败 ${key}:`, err.message);
    return false;
  }
}

/**
 * 删除数据
 */
function remove(key) {
  try {
    wx.removeStorageSync(key);
    memoryCache.delete(key);
    return true;
  } catch (err) {
    logger.warn(`[Storage] 删除失败 ${key}:`, err.message);
    return false;
  }
}

/**
 * 清除所有数据（保留白名单）
 */
function clear(keepKeys = []) {
  try {
    const allKeys = wx.getStorageInfoSync().keys;
    
    allKeys.forEach(key => {
      if (!keepKeys.includes(key)) {
        wx.removeStorageSync(key);
        memoryCache.delete(key);
      }
    });
    
    logger.info('[Storage] 已清除，保留:', keepKeys);
    return true;
  } catch (err) {
    logger.error('[Storage] 清除失败:', err.message);
    return false;
  }
}

/**
 * 获取存储大小
 */
function getSize() {
  try {
    const info = wx.getStorageInfoSync();
    return {
      currentSize: info.currentSize,
      limitSize: info.limitSize,
      keys: info.keys,
    };
  } catch (err) {
    return { currentSize: 0, limitSize: 0, keys: [] };
  }
}

/**
 * 清除内存缓存
 */
function clearMemoryCache() {
  memoryCache.clear();
}

module.exports = {
  KEYS,
  get,
  set,
  remove,
  clear,
  getSize,
  clearMemoryCache,
};
