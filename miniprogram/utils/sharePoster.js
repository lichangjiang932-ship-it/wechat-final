// utils/sharePoster.js - 朋友圈分享海报
const { logger } = require('../config/constants');

/**
 * 获取小程序码
 * 需要云函数调用 wxacode.getUnlimited
 * @param {string} scene - 页面参数，如 "id=123"
 * @param {string} page - 页面路径
 * @returns {Promise<string>} 小程序码临时路径
 */
async function getMiniProgramCode(scene = '', page = 'pages/index/index') {
  try {
    const result = await wx.cloud.callFunction({
      name: 'tools',
      data: {
        action: 'getMiniProgramCode',
        scene,
        page,
      },
    });

    if (result?.code === 0 && result.fileID) {
      // 获取临时链接
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: [result.fileID],
      });
      return tempRes.fileList[0]?.tempFileURL || '';
    }
    return '';
  } catch (err) {
    logger.error('获取小程序码失败:', err.message);
    return '';
  }
}

/**
 * 生成分享海报（带小程序码）
 * @param {Object} options
 * @param {string} options.imageUrl - 作品图片URL
 * @param {string} options.title - 作品标题
 * @param {string} options.prompt - 提示词
 * @returns {Promise<string>} 海报临时路径
 */
async function generateSharePoster(options) {
  const { imageUrl, title = 'AI创作', prompt = '' } = options;

  logger.info('生成分享海报:', { title });

  // 获取小程序码
  const codeUrl = await getMiniProgramCode();

  // 画布尺寸
  const canvasWidth = 375;
  const canvasHeight = 600;
  const dpr = wx.getSystemInfoSync().pixelRatio || 2;

  const canvas = wx.createOffscreenCanvas({
    type: '2d',
    width: canvasWidth * dpr,
    height: canvasHeight * dpr,
  });
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 1. 绘制背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. 顶部渐变
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
  gradient.addColorStop(0, '#C9956B');
  gradient.addColorStop(1, '#B07D55');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, 100);

  // 3. 标题
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('照片工坊', canvasWidth / 2, 60);

  // 4. 作品图片区域
  ctx.fillStyle = '#F8F6F3';
  ctx.fillRect(20, 120, canvasWidth - 40, 280);

  // 如果有作品图，绘制
  if (imageUrl) {
    try {
      const img = canvas.createImage();
      await new Promise((resolveImg, rejectImg) => {
        img.onload = resolveImg;
        img.onerror = rejectImg;
        img.src = imageUrl;
      });
      ctx.drawImage(img, 20, 120, canvasWidth - 40, 280);
    } catch (e) {
      logger.warn('绘制作品图片失败:', e.message);
    }
  }

  // 5. 作品标题
  ctx.fillStyle = '#3A3530';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  const displayTitle = title.length > 20 ? title.slice(0, 20) + '...' : title;
  ctx.fillText(displayTitle, 30, 440);

  // 6. 提示词
  if (prompt) {
    ctx.fillStyle = '#7A7268';
    ctx.font = '14px sans-serif';
    const displayPrompt = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    ctx.fillText(displayPrompt, 30, 470);
  }

  // 7. 小程序码区域
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(30, 490, 100, 100);
  ctx.strokeStyle = '#EDE9E4';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 490, 100, 100);

  // 绘制小程序码
  if (codeUrl) {
    try {
      const codeImg = canvas.createImage();
      await new Promise((resolveImg, rejectImg) => {
        codeImg.onload = resolveImg;
        codeImg.onerror = rejectImg;
        codeImg.src = codeUrl;
      });
      ctx.drawImage(codeImg, 35, 495, 90, 90);
    } catch (e) {
      logger.warn('绘制小程序码失败:', e.message);
      ctx.fillStyle = '#EDE9E4';
      ctx.fillRect(35, 495, 90, 90);
    }
  }

  // 8. 扫码提示
  ctx.fillStyle = '#3A3530';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('长按扫码体验', 145, 520);

  ctx.fillStyle = '#7A7268';
  ctx.font = '12px sans-serif';
  ctx.fillText('AI 让照片更有温度', 145, 545);

  // 9. 底部
  ctx.fillStyle = '#F8F6F3';
  ctx.fillRect(0, canvasHeight - 50, canvasWidth, 50);

  // 导出
  return new Promise((resolve, reject) => {
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
        logger.info('分享海报生成成功');
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        logger.error('分享海报导出失败:', err.message);
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

module.exports = {
  getMiniProgramCode,
  generateSharePoster,
  savePosterToAlbum,
};