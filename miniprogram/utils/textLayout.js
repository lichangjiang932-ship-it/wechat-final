/**
 * utils/textLayout.js - 文本布局工具（小程序适配版）
 * 
 * 小程序中无法直接使用 Canvas 测量文本，但可以使用 Pretext 的算法
 * 这里提供小程序特定的文本处理工具
 */

/**
 * 计算文本在指定宽度下需要的行数
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（rpx）
 * @param {number} fontSize - 字体大小（rpx）
 * @returns {number} 行数
 */
function calculateLineCount(text, maxWidth, fontSize = 28) {
  if (!text || text.length === 0) return 0;
  
  // 估算每个字符的平均宽度（中文字符约为字体大小，英文约为 0.5 倍）
  let totalWidth = 0;
  for (const char of text) {
    // 判断是否为中文字符
    if (/[\u4e00-\u9fa5]/.test(char)) {
      totalWidth += fontSize;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      totalWidth += fontSize * 0.5;
    } else {
      // 其他字符（标点、emoji 等）
      totalWidth += fontSize * 0.8;
    }
  }
  
  return Math.ceil(totalWidth / maxWidth);
}

/**
 * 截断文本到指定行数
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（rpx）
 * @param {number} maxLines - 最大行数
 * @param {number} fontSize - 字体大小（rpx）
 * @returns {string} 截断后的文本
 */
function truncateToLines(text, maxWidth, maxLines, fontSize = 28) {
  if (!text) return '';
  
  const maxChars = Math.floor((maxWidth * maxLines) / fontSize) * 1.5;
  
  if (text.length <= maxChars) {
    return text;
  }
  
  return text.slice(0, Math.floor(maxChars) - 3) + '...';
}

/**
 * 智能换行：在合适的位置添加换行符
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（rpx）
 * @param {number} fontSize - 字体大小（rpx）
 * @returns {string} 换行后的文本
 */
function smartWrap(text, maxWidth, fontSize = 28) {
  if (!text) return '';
  
  const charsPerLine = Math.floor(maxWidth / fontSize);
  const result = [];
  let currentLine = '';
  let currentWidth = 0;
  
  for (const char of text) {
    const charWidth = /[\u4e00-\u9fa5]/.test(char) ? fontSize : fontSize * 0.5;
    
    if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
      result.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }
  
  if (currentLine.length > 0) {
    result.push(currentLine);
  }
  
  return result.join('\n');
}

/**
 * 计算文本块的总高度
 * @param {string} text - 文本内容
 * @param {number} maxWidth - 最大宽度（rpx）
 * @param {number} lineHeight - 行高（rpx）
 * @param {number} fontSize - 字体大小（rpx）
 * @returns {number} 总高度（rpx）
 */
function calculateTextHeight(text, maxWidth, lineHeight, fontSize = 28) {
  const lineCount = calculateLineCount(text, maxWidth, fontSize);
  return lineCount * lineHeight;
}

/**
 * 获取文本的预览摘要
 * @param {string} text - 完整文本
 * @param {number} limit - 字符限制
 * @returns {string} 摘要文本
 */
function getPreview(text, limit = 100) {
  if (!text || text.length <= limit) {
    return text || '';
  }
  
  // 尝试在句子结束处截断
  const truncated = text.slice(0, limit);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('！'),
    truncated.lastIndexOf('？'),
    truncated.lastIndexOf('.')
  );
  
  if (lastPeriod > limit * 0.7) {
    return truncated.slice(0, lastPeriod + 1);
  }
  
  return truncated + '...';
}

module.exports = {
  calculateLineCount,
  truncateToLines,
  smartWrap,
  calculateTextHeight,
  getPreview,
};
