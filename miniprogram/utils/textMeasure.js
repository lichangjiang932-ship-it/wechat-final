/**
 * utils/textMeasure.js - 文本测量工具
 * 基于 @chenglou/pretext 实现无 DOM 测量
 * 
 * 使用场景：
 * 1. 计算动态文本高度（评论、描述等）
 * 2. 检测文本是否溢出容器
 * 3. Canvas 文本渲染布局
 */

const { prepare, layout, prepareWithSegments, layoutWithLines, walkLineRanges } = require('@chenglou/pretext');

// 缓存已准备的文本
const preparedCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * 准备文本（带缓存）
 * @param {string} text - 要测量的文本
 * @param {string} font - 字体，如 '16px PingFang SC'
 * @param {object} options - 选项 { whiteSpace: 'normal' | 'pre-wrap' }
 * @returns {object} prepared - 准备好的文本对象
 */
function prepareText(text, font, options = {}) {
  const cacheKey = `${text}|${font}|${options.whiteSpace || 'normal'}`;
  
  if (preparedCache.has(cacheKey)) {
    return preparedCache.get(cacheKey);
  }
  
  const prepared = prepare(text, font, options);
  
  // 限制缓存大小
  if (preparedCache.size >= MAX_CACHE_SIZE) {
    const firstKey = preparedCache.keys().next().value;
    preparedCache.delete(firstKey);
  }
  
  preparedCache.set(cacheKey, prepared);
  return prepared;
}

/**
 * 计算文本在指定宽度下的高度
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（px）
 * @param {number} lineHeight - 行高（px）
 * @param {string} font - 字体
 * @returns {object} { height, lineCount }
 */
function measureTextHeight(text, maxWidth, lineHeight, font = '16px PingFang SC') {
  const prepared = prepareText(text, font);
  return layout(prepared, maxWidth, lineHeight);
}

/**
 * 检测文本是否会在指定宽度下换行
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（px）
 * @param {string} font - 字体
 * @returns {boolean} 是否会换行
 */
function willTextWrap(text, maxWidth, font = '16px PingFang SC') {
  const prepared = prepareText(text, font);
  const { lineCount } = layout(prepared, maxWidth, 20);
  return lineCount > 1;
}

/**
 * 获取文本的自然宽度（不换行时的宽度）
 * @param {string} text - 文本内容
 * @param {string} font - 字体
 * @returns {number} 自然宽度
 */
function measureNaturalWidth(text, font = '16px PingFang SC') {
  const prepared = prepareWithSegments(text, font);
  let maxW = 0;
  walkLineRanges(prepared, 10000, line => {
    if (line.width > maxW) maxW = line.width;
  });
  return maxW;
}

/**
 * 获取文本的所有行
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度
 * @param {number} lineHeight - 行高
 * @param {string} font - 字体
 * @returns {array} 行数组 [{ text, width, start, end }, ...]
 */
function getTextLines(text, maxWidth, lineHeight, font = '16px PingFang SC') {
  const prepared = prepareWithSegments(text, font);
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight);
  return lines;
}

/**
 * 截断文本到指定行数
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度
 * @param {number} maxLines - 最大行数
 * @param {string} font - 字体
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxWidth, maxLines, font = '16px PingFang SC') {
  const prepared = prepareWithSegments(text, font);
  const { lines } = layoutWithLines(prepared, maxWidth, 20);
  
  if (lines.length <= maxLines) {
    return text;
  }
  
  // 截取前 maxLines 行
  const truncatedLines = lines.slice(0, maxLines);
  const lastLine = truncatedLines[truncatedLines.length - 1];
  
  // 在最后一行添加省略号
  return truncatedLines.map(l => l.text).join('').slice(0, -3) + '...';
}

/**
 * 清除缓存
 */
function clearCache() {
  preparedCache.clear();
}

module.exports = {
  prepareText,
  measureTextHeight,
  willTextWrap,
  measureNaturalWidth,
  getTextLines,
  truncateText,
  clearCache,
};
