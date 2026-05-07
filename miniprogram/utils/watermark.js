// utils/watermark.js
// 通过 Canvas 2D 在图片右下角合成极小的「AI生成」字样。
// 用法：
//   const newPath = await addAIWatermark(localFilePath, 'watermarkCanvas', this);
// 前置条件：调用页面的 wxml 中有一个 type="2d" 的 canvas，且其 id 与第二个参数一致。

/**
 * 给一张本地图片合成「AI生成」水印
 * @param {string} srcPath        本地临时路径（http://tmp/... 或 wxfile://...）
 * @param {string} canvasId       页面中 <canvas type="2d"> 的 id
 * @param {object} pageOrComp     调用方 this（页面或自定义组件实例）
 * @param {object} [options]
 * @param {string} [options.text='AI生成']
 * @param {string} [options.position='bottom-right']  bottom-right | bottom-left | bottom-center
 * @returns {Promise<string>}     合成后图片的本地临时路径
 */
async function addAIWatermark(srcPath, canvasId, pageOrComp, options = {}) {
  const {
    text = 'AI生成',
    position = 'bottom-right',
  } = options;

  if (!srcPath) throw new Error('源图路径为空');
  if (!canvasId) throw new Error('canvasId 缺失');

  // 1. 读图片元信息（宽高、本地真实路径）
  const info = await new Promise((resolve, reject) => {
    wx.getImageInfo({ src: srcPath, success: resolve, fail: reject });
  });
  const width = info.width;
  const height = info.height;
  if (!width || !height) throw new Error('无法获取图片尺寸');

  // 2. 拿 canvas 2d 节点
  const canvasNode = await new Promise((resolve, reject) => {
    const query = pageOrComp && pageOrComp.createSelectorQuery
      ? pageOrComp.createSelectorQuery()
      : wx.createSelectorQuery();
    query.select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (res && res[0] && res[0].node) resolve(res[0].node);
        else reject(new Error('未找到 canvas 节点：#' + canvasId));
      });
  });

  // 3. 设置 canvas 内部尺寸 = 图片实际像素
  canvasNode.width = width;
  canvasNode.height = height;
  const ctx = canvasNode.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  // 4. 加载源图
  const img = canvasNode.createImage();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = info.path; // 一定要用 info.path（本地真实路径），http URL 在 canvas 里会失败
  });
  ctx.drawImage(img, 0, 0, width, height);

  // 5. 绘制水印（极小、低存在感、但清晰可读）
  // 字号按图片宽度自适应，保证在不同尺寸下视觉权重一致
  const fontSize = Math.max(14, Math.round(width * 0.022));
  const pad = Math.round(fontSize * 0.55);
  const margin = Math.round(fontSize * 0.9);

  ctx.font = `500 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textBaseline = 'middle';

  const textWidth = Math.ceil(ctx.measureText(text).width);
  const boxW = textWidth + pad * 2;
  const boxH = fontSize + Math.round(pad * 1.1);

  let boxX, boxY;
  if (position === 'bottom-left') {
    boxX = margin;
    boxY = height - margin - boxH;
  } else if (position === 'bottom-center') {
    boxX = Math.round((width - boxW) / 2);
    boxY = height - margin - boxH;
  } else {
    // bottom-right (默认)
    boxX = width - margin - boxW;
    boxY = height - margin - boxH;
  }

  // 半透明黑色圆角胶囊背景
  const radius = Math.round(boxH / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  // 文字（白色 + 轻微阴影增强对比）
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 2;
  ctx.textAlign = 'center';
  ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2 + 1);
  ctx.shadowBlur = 0;

  // 6. 导出为本地临时文件
  const tempFilePath = await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: canvasNode,
      x: 0, y: 0,
      width, height,
      destWidth: width,
      destHeight: height,
      fileType: 'jpg',
      quality: 0.92,
      success: r => resolve(r.tempFilePath),
      fail: reject,
    }, pageOrComp || undefined);
  });

  return tempFilePath;
}

// 圆角矩形 path
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

module.exports = { addAIWatermark };
