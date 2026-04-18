// services/api.js - 统一请求封装
const { logger } = require('../config/constants');
const monitor = require('./monitor');

// 请求队列，用于取消重复请求
const pendingRequests = new Map();

// 默认配置
const DEFAULT_CONFIG = {
  timeout: 30000,
  retries: 1,
  retryDelay: 1000,
  silent: false, // 静默模式，不显示错误提示
};

/**
 * 生成请求key（用于去重）
 */
function generateRequestKey(name, data) {
  return `${name}_${JSON.stringify(data)}`;
}

/**
 * 统一云函数请求
 * @param {string} name - 云函数名称
 * @param {Object} data - 请求参数
 * @param {Object} options - 配置选项
 * @returns {Promise<any>}
 */
async function callCloud(name, data = {}, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const requestKey = generateRequestKey(name, data);
  const startTime = Date.now();

  // 取消重复请求（可选）
  if (config.deduplicate && pendingRequests.has(requestKey)) {
    logger.debug(`取消重复请求: ${name}`);
    return pendingRequests.get(requestKey);
  }

  const requestPromise = executeRequest(name, data, config, startTime);
  
  if (config.deduplicate) {
    pendingRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => pendingRequests.delete(requestKey));
  }

  return requestPromise;
}

/**
 * 执行请求（含重试）
 */
async function executeRequest(name, data, config, startTime) {
  let lastError = null;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      logger.debug(`[API] ${name} 请求:`, data);

      const res = await wx.cloud.callFunction({ name, data });
      const duration = Date.now() - startTime;

      // 记录性能
      monitor.trackApi(name, duration, true);

      if (res.result && res.result.code !== undefined) {
        if (res.result.code === 0) {
          logger.debug(`[API] ${name} 成功 (${duration}ms)`);
          return res.result.data !== undefined ? res.result.data : res.result;
        } else {
          const msg = res.result.msg || '请求失败';
          logger.warn(`[API] ${name} 业务错误:`, msg);
          
          if (!config.silent) {
            wx.showToast({ title: msg, icon: 'none' });
          }
          
          throw new Error(msg);
        }
      }

      // 无标准格式，直接返回
      logger.debug(`[API] ${name} 成功 (${duration}ms)`);
      return res.result;

    } catch (err) {
      lastError = err;
      const duration = Date.now() - startTime;

      // 记录失败
      monitor.trackApi(name, duration, false, err.message);

      // 认证错误不重试
      if (err.message.includes('401') || err.message.includes('token')) {
        throw err;
      }

      // 还有重试机会
      if (attempt < config.retries) {
        logger.info(`[API] ${name} 第 ${attempt + 1} 次重试...`);
        await sleep(config.retryDelay * (attempt + 1));
        continue;
      }

      // 最终失败
      if (!config.silent) {
        const userMsg = getErrorMessage(err);
        wx.showToast({ title: userMsg, icon: 'none' });
      }

      throw err;
    }
  }

  throw lastError;
}

/**
 * 获取用户友好的错误消息
 */
function getErrorMessage(err) {
  const msg = (err.message || '').toLowerCase();
  
  if (msg.includes('network') || msg.includes('网络')) return '网络连接失败';
  if (msg.includes('timeout') || msg.includes('超时')) return '请求超时';
  if (msg.includes('auth') || msg.includes('登录')) return '请重新登录';
  
  return '服务暂时不可用';
}

/**
 * 上传文件
 */
async function uploadFile(filePath, cloudPath) {
  const ext = filePath.split('.').pop();
  const fileName = cloudPath || `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const result = await wx.cloud.uploadFile({
      cloudPath: `uploads/${fileName}`,
      filePath,
    });
    
    monitor.trackApi('uploadFile', 0, true);
    return result.fileID;
  } catch (err) {
    monitor.trackApi('uploadFile', 0, false, err.message);
    throw err;
  }
}

/**
 * 工具函数
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  callCloud,
  uploadFile,
};
