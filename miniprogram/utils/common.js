// utils/common.js - 公共工具函数

// ==================== 日志管理 ====================
const LOG_LEVEL = 1; // 0=debug, 1=info, 2=warn, 3=error

const logger = {
  debug: (...args) => LOG_LEVEL <= 0 && console.log('[app:debug]', ...args),
  info: (...args) => LOG_LEVEL <= 1 && console.log('[app:info]', ...args),
  warn: (...args) => LOG_LEVEL <= 2 && console.warn('[app:warn]', ...args),
  error: (...args) => LOG_LEVEL <= 3 && console.error('[app:error]', ...args),
};

// ==================== 导航栏计算 ====================
function computeNavBar() {
  try {
    const windowInfo = wx.getWindowInfo();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = windowInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height + statusBarHeight;
    return { navBarHeight, statusBarHeight };
  } catch (err) {
    logger.warn('导航栏计算失败', err.message);
    return { navBarHeight: 88, statusBarHeight: 20 };
  }
}

// ==================== 格式化时间 ====================
function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==================== 存储管理 ====================
const Storage = {
  get: (key, defaultValue = null) => {
    try {
      const value = wx.getStorageSync(key);
      return value !== '' ? value : defaultValue;
    } catch (err) {
      logger.warn(`读取存储失败 ${key}:`, err.message);
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      wx.setStorageSync(key, value);
    } catch (err) {
      logger.error(`写入存储失败 ${key}:`, err.message);
    }
  },
  remove: (key) => {
    try {
      wx.removeStorageSync(key);
    } catch (err) {
      logger.warn(`删除存储失败 ${key}:`, err.message);
    }
  },
};

// ==================== 图片保存 ====================
async function saveImageToAlbum(url) {
  try {
    let filePath = url;
    if (url.startsWith('http')) {
      wx.showLoading({ title: '下载中...', mask: true });
      const res = await new Promise((resolve, reject) => {
        wx.downloadFile({ url, success: resolve, fail: reject });
      });
      filePath = res.tempFilePath;
      wx.hideLoading();
    }

    await new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => { logger.info('图片保存成功'); resolve(); },
        fail: (err) => {
          if (err.errMsg.includes('auth deny')) {
            wx.showModal({
              title: '需要权限',
              content: '请在设置中开启相册权限',
              success: (res) => { if (res.confirm) wx.openSetting(); },
            });
          }
          reject(err);
        },
      });
    });
    return true;
  } catch (err) {
    wx.hideLoading();
    logger.error('保存图片失败:', err.message);
    wx.showToast({ title: '保存失败', icon: 'none' });
    return false;
  }
}

module.exports = {
  logger,
  LOG_LEVEL,
  computeNavBar,
  formatTime,
  formatDate,
  Storage,
  saveImageToAlbum,
};
