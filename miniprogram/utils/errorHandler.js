// utils/errorHandler.js - 统一错误处理
const { logger } = require('../config/constants');

// 错误类型枚举
const ErrorType = {
  NETWORK: 'NETWORK',           // 网络错误
  TIMEOUT: 'TIMEOUT',           // 超时
  AUTH: 'AUTH',                 // 认证错误
  LIMIT: 'LIMIT',               // 限制错误
  SERVER: 'SERVER',             // 服务器错误
  UNKNOWN: 'UNKNOWN',           // 未知错误
};

// 错误消息映射
const ErrorMessages = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络后重试',
  [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorType.AUTH]: '登录已过期，请重新登录',
  [ErrorType.LIMIT]: '操作过于频繁，请稍后再试',
  [ErrorType.SERVER]: '服务暂时不可用，请稍后重试',
  [ErrorType.UNKNOWN]: '发生未知错误，请重试',
};

/**
 * 解析错误类型
 * @param {Error} error
 * @returns {string} ErrorType
 */
function parseErrorType(error) {
  const msg = (error.message || error.errMsg || '').toLowerCase();
  
  if (msg.includes('network') || msg.includes('net::err') || msg.includes('连接')) {
    return ErrorType.NETWORK;
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return ErrorType.TIMEOUT;
  }
  if (msg.includes('auth') || msg.includes('401') || msg.includes('登录') || msg.includes('token')) {
    return ErrorType.AUTH;
  }
  if (msg.includes('429') || msg.includes('limit') || msg.includes('频繁')) {
    return ErrorType.LIMIT;
  }
  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('无权限') || msg.includes('权限不足')) {
    return ErrorType.AUTH;
  }
  if (msg.includes('404') || msg.includes('not found') || msg.includes('不存在')) {
    return ErrorType.SERVER;
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('server')) {
    return ErrorType.SERVER;
  }

  return ErrorType.UNKNOWN;
}

/**
 * 获取用户友好的错误消息
 * @param {Error} error
 * @returns {string}
 */
function getErrorMessage(error) {
  const type = parseErrorType(error);
  return ErrorMessages[type] || ErrorMessages[ErrorType.UNKNOWN];
}

/**
 * 显示错误提示
 * @param {Error} error
 * @param {Object} options
 * @param {boolean} options.showRetry - 是否显示重试按钮
 * @param {Function} options.onRetry - 重试回调
 */
function showError(error, options = {}) {
  const { showRetry = false, onRetry } = options;
  const message = getErrorMessage(error);
  const type = parseErrorType(error);
  
  logger.error('错误:', type, message);
  
  if (showRetry && onRetry) {
    wx.showModal({
      title: '提示',
      content: message,
      confirmText: '重试',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          onRetry();
        }
      },
    });
  } else {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 3000,
    });
  }
  
  return { type, message };
}

/**
 * 检查网络状态
 * @returns {Promise<boolean>}
 */
async function checkNetwork() {
  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => {
        const networkType = res.networkType;
        if (networkType === 'none') {
          wx.showToast({
            title: '当前无网络连接',
            icon: 'none',
          });
          resolve(false);
        } else {
          resolve(true);
        }
      },
      fail: () => {
        resolve(true); // 获取失败时假设网络正常
      },
    });
  });
}

/**
 * 带重试的请求包装
 * @param {Function} requestFn - 请求函数
 * @param {Object} options
 * @param {number} options.maxRetries - 最大重试次数
 * @param {number} options.retryDelay - 重试延迟(ms)
 * @returns {Promise}
 */
async function withRetry(requestFn, options = {}) {
  const { maxRetries = 2, retryDelay = 1000 } = options;
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 检查网络
      const hasNetwork = await checkNetwork();
      if (!hasNetwork) {
        throw new Error('NETWORK:无网络连接');
      }
      
      const result = await requestFn();
      return result;
    } catch (error) {
      lastError = error;
      const type = parseErrorType(error);
      
      // 认证错误不重试
      if (type === ErrorType.AUTH) {
        throw error;
      }
      
      // 网络错误且还有重试机会
      if (attempt < maxRetries && (type === ErrorType.NETWORK || type === ErrorType.TIMEOUT)) {
        logger.info(`第 ${attempt + 1} 次重试...`);
        await new Promise(r => setTimeout(r, retryDelay * (attempt + 1)));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * 全局错误处理装饰器
 * @param {Function} fn - 要包装的函数
 */
function safeExecute(fn) {
  return async function (...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      showError(error);
      return null;
    }
  };
}

module.exports = {
  ErrorType,
  ErrorMessages,
  parseErrorType,
  getErrorMessage,
  showError,
  checkNetwork,
  withRetry,
  safeExecute,
};