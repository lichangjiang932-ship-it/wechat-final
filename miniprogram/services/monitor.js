// services/monitor.js - 错误监控与性能追踪
const { logger } = require('../config/constants');

// 监控数据缓冲区
const buffer = [];
const MAX_BUFFER_SIZE = 50;
const FLUSH_INTERVAL = 60000; // 1分钟上报一次

// 是否启用
let enabled = true;

/**
 * 初始化监控
 */
function init() {
  // 捕获全局错误
  wx.onError((error) => {
    trackError('global', error, 'uncaught');
  });

  // 捕获未处理的 Promise 错误
  wx.onUnhandledRejection((res) => {
    trackError('promise', res.reason?.message || res.reason, 'unhandled');
  });

  // 页面不存在
  wx.onPageNotFound((res) => {
    trackError('page', res.path, 'not_found');
  });

  // 定时上报
  setInterval(flush, FLUSH_INTERVAL);

  logger.info('[Monitor] 监控已初始化');
}

/**
 * 记录错误
 */
function trackError(type, message, extra = '') {
  if (!enabled) return;

  const error = {
    type: 'error',
    errorType: type,
    message: String(message).slice(0, 500),
    extra,
    timestamp: Date.now(),
    page: getCurrentPage(),
  };

  addToBuffer(error);
  logger.warn('[Monitor] 错误:', type, message);
}

/**
 * 记录API调用
 */
function trackApi(name, duration, success, error = '') {
  if (!enabled) return;

  const record = {
    type: 'api',
    name,
    duration,
    success,
    error: String(error).slice(0, 200),
    timestamp: Date.now(),
  };

  // 慢请求告警
  if (duration > 5000) {
    logger.warn(`[Monitor] 慢请求: ${name} (${duration}ms)`);
  }

  addToBuffer(record);
}

/**
 * 记录用户行为
 */
function trackEvent(name, data = {}) {
  if (!enabled) return;

  const event = {
    type: 'event',
    name,
    data,
    timestamp: Date.now(),
    page: getCurrentPage(),
  };

  addToBuffer(event);
}

/**
 * 记录性能指标
 */
function trackPerformance(name, value) {
  if (!enabled) return;

  const perf = {
    type: 'performance',
    name,
    value,
    timestamp: Date.now(),
    page: getCurrentPage(),
  };

  addToBuffer(perf);
}

/**
 * 添加到缓冲区
 */
function addToBuffer(record) {
  buffer.push(record);
  
  if (buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

/**
 * 上报数据
 */
async function flush() {
  if (buffer.length === 0) return;

  const data = buffer.splice(0);
  
  try {
    // 上报到云函数
    await wx.cloud.callFunction({
      name: 'tools',
      data: {
        action: 'reportMonitor',
        records: data,
      },
    });
    
    logger.debug(`[Monitor] 上报 ${data.length} 条记录`);
  } catch (err) {
    // 上报失败，放回缓冲区
    buffer.unshift(...data.slice(-20)); // 最多保留20条
    logger.error('[Monitor] 上报失败:', err.message);
  }
}

/**
 * 获取当前页面路径
 */
function getCurrentPage() {
  try {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      return pages[pages.length - 1].route || '';
    }
  } catch (e) {}
  return '';
}

/**
 * 设置启用状态
 */
function setEnabled(value) {
  enabled = value;
}

/**
 * 获取缓冲区状态
 */
function getBufferStatus() {
  return {
    size: buffer.length,
    maxSize: MAX_BUFFER_SIZE,
  };
}

module.exports = {
  init,
  trackError,
  trackApi,
  trackEvent,
  trackPerformance,
  flush,
  setEnabled,
  getBufferStatus,
};
