// utils/imageLoader.js - 图片懒加载优化
const { logger } = require('../config/constants');

// 图片缓存
const imageCache = new Map();
const MAX_CACHE_SIZE = 50; // 最大缓存数量

// 预加载队列
const preloadQueue = [];
let isPreloading = false;

/**
 * 懒加载图片
 * @param {string} src - 图片地址
 * @param {Object} options
 * @param {number} options.threshold - 提前加载距离(px)
 * @param {boolean} options.useCache - 是否使用缓存
 * @returns {Promise<string>}
 */
function lazyLoad(src, options = {}) {
  const { useCache = true } = options;

  if (!src) return Promise.resolve('');

  // 检查缓存
  if (useCache && imageCache.has(src)) {
    return Promise.resolve(imageCache.get(src));
  }

  return new Promise((resolve, reject) => {
    // 如果是本地图片或 base64，直接返回
    if (src.startsWith('/') || src.startsWith('data:')) {
      resolve(src);
      return;
    }

    // 网络图片，使用 wx.getImageInfo 预加载
    wx.getImageInfo({
      src,
      success: (res) => {
        // 加入缓存
        if (useCache) {
          addToCache(src, src);
        }
        resolve(src);
      },
      fail: (err) => {
        logger.warn('图片加载失败:', src, err.errMsg);
        resolve(src); // 即使失败也返回原地址，让 image 组件处理
      },
    });
  });
}

/**
 * 添加到缓存
 */
function addToCache(key, value) {
  // LRU 淘汰
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const firstKey = imageCache.keys().next().value;
    imageCache.delete(firstKey);
  }
  imageCache.set(key, value);
}

/**
 * 批量预加载图片
 * @param {string[]} urls - 图片地址数组
 * @param {number} concurrency - 并发数
 */
async function preloadImages(urls, concurrency = 3) {
  if (!urls || urls.length === 0) return;

  const validUrls = urls.filter(url => url && !imageCache.has(url));
  if (validUrls.length === 0) return;

  logger.info(`预加载 ${validUrls.length} 张图片`);

  // 分批加载
  for (let i = 0; i < validUrls.length; i += concurrency) {
    const batch = validUrls.slice(i, i + concurrency);
    await Promise.all(batch.map(url => lazyLoad(url).catch(() => {})));
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  imageCache.clear();
  logger.info('图片缓存已清除');
}

/**
 * 获取缓存信息
 */
function getCacheInfo() {
  return {
    size: imageCache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}

/**
 * 图片组件观察器（用于 IntersectionObserver 懒加载）
 */
class ImageObserver {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.1;
    this.observers = new Map();
  }

  /**
   * 观察图片元素
   * @param {string} selector - 元素选择器
   * @param {Function} onVisible - 可见时的回调
   * @param {Object} component - 组件实例
   */
  observe(selector, onVisible, component) {
    if (!component) return;

    const observer = component.createIntersectionObserver({
      thresholds: [this.threshold],
    });

    observer.relativeToViewport().observe(selector, (res) => {
      if (res.intersectionRatio > 0) {
        onVisible(res);
      }
    });

    this.observers.set(selector, observer);
  }

  /**
   * 取消观察
   */
  unobserve(selector) {
    const observer = this.observers.get(selector);
    if (observer) {
      observer.disconnect();
      this.observers.delete(selector);
    }
  }

  /**
   * 取消所有观察
   */
  disconnect() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }
}

/**
 * 节流函数
 */
function throttle(fn, delay = 200) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= delay) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 防抖函数
 */
function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

module.exports = {
  lazyLoad,
  preloadImages,
  clearCache,
  getCacheInfo,
  ImageObserver,
  throttle,
  debounce,
};