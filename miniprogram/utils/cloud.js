// utils/cloud.js - 云开发工具封装
const app = getApp();
const { logger } = require('../config/constants');

// ==================== 云函数调用 ====================
// silent: true 时静默调用，不显示错误提示
async function callFunction(name, data = {}, options = {}) {
  const { silent = false } = options;

  try {
    logger.debug(`调用云函数 ${name}:`, data);

    const res = await wx.cloud.callFunction({
      name,
      data,
    });

    if (res.result && res.result.code !== undefined) {
      if (res.result.code === 0) {
        logger.debug(`云函数 ${name} 调用成功`);
        return res.result.data !== undefined ? res.result.data : res.result;
      } else {
        const msg = res.result.msg || '请求失败';
        logger.warn(`云函数 ${name} 返回错误:`, msg);
        if (!silent) wx.showToast({ title: msg, icon: 'none' });
        throw new Error(msg);
      }
    }

    logger.debug(`云函数 ${name} 调用成功`);
    return res.result;

  } catch (err) {
    if (!silent) {
      logger.error(`云函数 ${name} 调用失败:`, err.message);
      wx.showToast({ title: err.message || '网络错误', icon: 'none' });
    }
    throw err;
  }
}

// ==================== 文件操作 ====================
// 上传文件到云存储
async function uploadFile(filePath, cloudPath) {
  try {
    const ext = filePath.split('.').pop();
    const fileName = cloudPath || `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    logger.debug('上传文件:', fileName);

    const result = await wx.cloud.uploadFile({
      cloudPath: `uploads/${fileName}`,
      filePath,
    });

    logger.info('文件上传成功:', result.fileID);
    return result.fileID;

  } catch (err) {
    logger.error('文件上传失败:', err.message);
    throw err;
  }
}

// 获取文件临时链接
async function getTempFileURL(fileID) {
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
    const url = res.fileList[0]?.tempFileURL;

    if (!url) {
      throw new Error('获取文件链接失败');
    }

    logger.debug('获取临时链接成功');
    return url;

  } catch (err) {
    logger.error('获取临时链接失败:', err.message);
    throw err;
  }
}

// ==================== 用户登录 ====================
// 微信一键登录
async function wxLogin() {
  try {
    logger.debug('开始微信登录');

    // 获取登录code
    const loginRes = await wx.login();
    if (!loginRes.code) {
      throw new Error('微信登录失败');
    }

    // 调用云函数登录
    const userInfo = await callFunction('user', {
      action: 'wxLogin',
      code: loginRes.code,
    }, { silent: true });

    // 保存登录状态
    wx.setStorageSync('token', userInfo.token);
    wx.setStorageSync('userInfo', userInfo);

    if (app.globalData) {
      app.globalData.userInfo = userInfo;
      app.globalData.isVip = userInfo.vipLevel !== 'free';
    }

    logger.info('微信登录成功');
    return userInfo;

  } catch (err) {
    logger.error('微信登录失败:', err.message);
    throw err;
  }
}

// 手机号登录
async function phoneLogin(code) {
  try {
    logger.debug('开始手机号登录');

    const userInfo = await callFunction('user', {
      action: 'phoneLogin',
      code,
    }, { silent: true });

    wx.setStorageSync('token', userInfo.token);
    wx.setStorageSync('userInfo', userInfo);

    if (app.globalData) {
      app.globalData.userInfo = userInfo;
      app.globalData.isVip = userInfo.vipLevel !== 'free';
    }

    logger.info('手机号登录成功');
    return userInfo;

  } catch (err) {
    logger.error('手机号登录失败:', err.message);
    throw err;
  }
}

// 检查登录状态
function checkLogin() {
  const userInfo = wx.getStorageSync('userInfo');

  if (!userInfo) {
    return false;
  }

  if (app.globalData) {
    app.globalData.userInfo = userInfo;
    app.globalData.isVip = userInfo.vipLevel !== 'free';
  }

  return true;
}

// 退出登录
function logout() {
  logger.info('用户退出登录');

  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');

  if (app.globalData) {
    app.globalData.userInfo = null;
    app.globalData.isVip = false;
  }
}

module.exports = {
  callFunction,
  uploadFile,
  getTempFileURL,
  wxLogin,
  phoneLogin,
  checkLogin,
  logout,
  logger,
};