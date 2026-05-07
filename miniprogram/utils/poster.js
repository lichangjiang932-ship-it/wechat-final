// utils/poster.js - 分享海报生成
const { logger } = require('../config/constants');

/**
 * 生成分享海报
 * @param {Object} options
 * @param {string} options.imageUrl - 作品图片URL
 * @param {string} options.title - 标题
 * @param {string} options.prompt - 提示词
 * @returns {Promise<string>} 临时文件路径
 */
async function generatePoster(options) {
  const { imageUrl, title = 'AI创作', prompt = '' } = options;

  return new Promise((resolve, reject) => {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    const dpr = systemInfo.pixelRatio || 2;
    
    // 海报尺寸
    const canvasWidth = 375;
    const canvasHeight = 600;
    
    // 创建离屏 canvas（需要基础库 2.9.0+）
    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: canvasWidth * dpr,
      height: canvasHeight * dpr,
    });
    const ctx = canvas.getContext('2d');
    
    // 缩放
    ctx.scale(dpr, dpr);
    
    // 绘制背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // 绘制顶部渐变
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
    gradient.addColorStop(0, '#C9956B');
    gradient.addColorStop(1, '#B07D55');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, 80);
    
    // 绘制标题
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('照片工坊', canvasWidth / 2, 50);
    
    // 绘制作品图片区域
    ctx.fillStyle = '#F8F6F3';
    ctx.fillRect(20, 100, canvasWidth - 40, 350);
    
    // 绘制作品标题
    ctx.fillStyle = '#3A3530';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    const displayTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
    ctx.fillText(displayTitle, 30, 480);
    
    // 绘制提示词
    if (prompt) {
      ctx.fillStyle = '#7A7268';
      ctx.font = '14px sans-serif';
      const displayPrompt = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;
      ctx.fillText(displayPrompt, 30, 510);
    }
    
    // 绘制底部提示
    ctx.fillStyle = '#9A9288';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('长按识别小程序码，立即体验', canvasWidth / 2, 560);
    
    ctx.fillText('AI 让照片更有温度', canvasWidth / 2, 580);
    
    // 导出图片
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      destWidth: canvasWidth * dpr,
      destHeight: canvasHeight * dpr,
      fileType: 'jpg',
      quality: 0.9,
      success: (res) => {
        logger.info('海报生成成功');
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        logger.error('海报生成失败:', err.message);
        reject(err);
      },
    });
  });
}

/**
 * 保存海报到相册
 * @param {string} tempFilePath - 临时文件路径
 */
async function savePosterToAlbum(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
        resolve(true);
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要权限',
            content: '请在设置中开启相册权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting();
            },
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
        reject(err);
      },
    });
  });
}

/**
 * 使用 canvas 2d 绘制海报（兼容低版本）
 * @param {Object} options
 * @param {string} canvasId - canvas ID
 * @param {Object} component - 组件实例（页面中传 this）
 */
async function generatePosterWithCanvas(options) {
  const { imageUrl, title = 'AI创作', prompt = '', canvasId, component } = options;

  return new Promise((resolve, reject) => {
    const query = wx.createSelectorQuery().in(component);
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          reject(new Error('Canvas 节点获取失败'));
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        
        canvas.width = 375 * dpr;
        canvas.height = 600 * dpr;
        ctx.scale(dpr, dpr);

        // 绘制背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 375, 600);

        // 绘制顶部
        const gradient = ctx.createLinearGradient(0, 0, 375, 0);
        gradient.addColorStop(0, '#C9956B');
        gradient.addColorStop(1, '#B07D55');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 375, 80);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('照片工坊', 375 / 2, 50);

        // 图片区域
        ctx.fillStyle = '#F8F6F3';
        ctx.fillRect(20, 100, 335, 350);

        // 标题
        ctx.fillStyle = '#3A3530';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'left';
        const displayTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
        ctx.fillText(displayTitle, 30, 480);

        // 提示词
        if (prompt) {
          ctx.fillStyle = '#7A7268';
          ctx.font = '14px sans-serif';
          const displayPrompt = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;
          ctx.fillText(displayPrompt, 30, 510);
        }

        // 底部
        ctx.fillStyle = '#9A9288';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('长按识别小程序码，立即体验', 375 / 2, 560);
        ctx.fillText('AI 让照片更有温度', 375 / 2, 580);

        // 导出
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: 375,
          height: 600,
          destWidth: 375 * dpr,
          destHeight: 600 * dpr,
          fileType: 'jpg',
          quality: 0.9,
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        });
      });
  });
}

module.exports = {
  generatePoster,
  savePosterToAlbum,
  generatePosterWithCanvas,
};