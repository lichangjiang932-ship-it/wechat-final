// utils/common.js - 公共工具函数

// ==================== 日志管理 ====================
const LOG_LEVEL = 1; // 0=debug, 1=info, 2=warn, 3=error

const logger = {
  debug: (...args) => LOG_LEVEL <= 0 && console.log('[app:debug]', ...args),
  info: (...args) => LOG_LEVEL <= 1 && console.log('[app:info]', ...args),
  warn: (...args) => LOG_LEVEL <= 2 && console.warn('[app:warn]', ...args),
  error: (...args) => LOG_LEVEL <= 3 && console.error('[app:error]', ...args),
};

// ==================== 导航栏计算 ====================
function computeNavBar() {
  try {
    const windowInfo = wx.getWindowInfo();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = windowInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height + statusBarHeight;
    return { navBarHeight, statusBarHeight };
  } catch (err) {
    logger.warn('导航栏计算失败', err.message);
    return { navBarHeight: 88, statusBarHeight: 20 };
  }
}

// ==================== 格式化时间 ====================
function formatTime(timestamp) {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==================== 存储管理 ====================
const Storage = {
  get: (key, defaultValue = null) => {
    try {
      const value = wx.getStorageSync(key);
      return value !== '' ? value : defaultValue;
    } catch (err) {
      logger.warn(`读取存储失败 ${key}:`, err.message);
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      wx.setStorageSync(key, value);
    } catch (err) {
      logger.error(`写入存储失败 ${key}:`, err.message);
    }
  },
  remove: (key) => {
    try {
      wx.removeStorageSync(key);
    } catch (err) {
      logger.warn(`删除存储失败 ${key}:`, err.message);
    }
  },
};

// ==================== 图片保存 ====================
async function saveImageToAlbum(url) {
  try {
    let filePath = url;
    if (url.startsWith('http')) {
      wx.showLoading({ title: '下载中...', mask: true });
      const res = await new Promise((resolve, reject) => {
        wx.downloadFile({ url, success: resolve, fail: reject });
      });
      filePath = res.tempFilePath;
      wx.hideLoading();
    }

    await new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => { logger.info('图片保存成功'); resolve(); },
        fail: (err) => {
          if (err.errMsg.includes('auth deny')) {
            wx.showModal({
              title: '需要权限',
              content: '请在设置中开启相册权限',
              success: (res) => { if (res.confirm) wx.openSetting(); },
            });
          }
          reject(err);
        },
      });
    });
    return true;
  } catch (err) {
    wx.hideLoading();
    logger.error('保存图片失败:', err.message);
    wx.showToast({ title: '保存失败', icon: 'none' });
    return false;
  }
}

// ==================== Bento 编辑式瀑布流 ====================
// 模仿首页「光的切片」画廊：4 列网格，每 5 张为一个块，块内格子大小不同：
//   ┌───┬───┬───┐
//   │ A │ B │ B │   A=2×2 大格   B=1×2 宽
//   │ A │ C │ D │   C/D=1×1 小   E=1×4 通栏
//   │ E │ E │ E │
// 每个块占 3 行 × 4 列。
function assignBentoAreas(items) {
  // grid-area: row-start / col-start / row-end / col-end (1-indexed, end-exclusive)
  const TEMPLATE = [
    (b) => `${3*b+1} / 1 / ${3*b+3} / 3`, // A: 2x2
    (b) => `${3*b+1} / 3 / ${3*b+2} / 5`, // B: 1x2 wide
    (b) => `${3*b+2} / 3 / ${3*b+3} / 4`, // C: 1x1
    (b) => `${3*b+2} / 4 / ${3*b+3} / 5`, // D: 1x1
    (b) => `${3*b+3} / 1 / ${3*b+4} / 5`, // E: 1x4 banner
  ];
  // 末尾不足 5 张时的紧凑收尾。block===0（总数本身就少）单独处理，避免空块。
  const TAIL = (b) => ({
    1: [`${3*b+1} / 1 / ${3*b+ (b===0?4:2)} / 5`], // 单张：首块时占满 3 行 hero，后续块只占 1 行 banner
    2: [`${3*b+1} / 1 / ${3*b+3} / 3`, `${3*b+1} / 3 / ${3*b+3} / 5`],
    3: [`${3*b+1} / 1 / ${3*b+3} / 3`, `${3*b+1} / 3 / ${3*b+2} / 5`, `${3*b+2} / 3 / ${3*b+3} / 5`],
    4: [`${3*b+1} / 1 / ${3*b+3} / 3`, `${3*b+1} / 3 / ${3*b+2} / 5`, `${3*b+2} / 3 / ${3*b+3} / 4`, `${3*b+2} / 4 / ${3*b+3} / 5`],
  });

  const out = [];
  let block = 0;
  let i = 0;
  while (i < items.length) {
    const remain = items.length - i;
    const useTail = remain < 5;
    if (useTail) {
      const slots = TAIL(block)[remain];
      for (let j = 0; j < slots.length && i < items.length; j++) {
        out.push({ ...items[i], _index: i, area: slots[j] });
        i++;
      }
    } else {
      for (let j = 0; j < TEMPLATE.length && i < items.length; j++) {
        out.push({ ...items[i], _index: i, area: TEMPLATE[j](block) });
        i++;
      }
    }
    block += 1;
  }
  return out;
}

// ==================== 瀑布流分列 ====================
// 贪心按当前列高分配，让两列尽量等高（真正的 masonry，比 i%2 更好看）。
// 每个 item 必须带 _h（估计高度，px）。返回 { indexed, columns: [[],[]] }。
function distributeMasonry(items, columnCount = 2) {
  const cols = Array.from({ length: columnCount }, () => ({ items: [], height: 0 }));
  const indexed = items.map((it, i) => ({ ...it, _index: i }));
  indexed.forEach((it) => {
    let target = cols[0];
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].height < target.height) target = cols[i];
    }
    target.items.push(it);
    target.height += (it._h || 320) + 16; // gap 也算一点
  });
  return { indexed, columns: cols.map(c => c.items) };
}

// 给 items 补齐 _h（基于真实图片宽高比）。columnWidthPx 是单列像素宽度。
// 已有 _h 或 meta.width/height 的会直接用，避免重复 getImageInfo。
async function resolveImageHeights(items, columnWidthPx) {
  // 收紧高宽比范围，避免竖图变成又长又窄的丝带——更整齐、更高级
  const MIN_RATIO = 0.85;  // 最矮：5:6
  const MAX_RATIO = 1.35;  // 最高：3:4 略长
  const clamp = (r) => Math.min(Math.max(r, MIN_RATIO), MAX_RATIO);
  const fallbackH = Math.round(columnWidthPx * 1.15); // 默认略竖

  const tasks = items.map(it => new Promise(resolve => {
    if (typeof it._h === 'number' && it._h > 0) return resolve(it);
    if (it.meta && it.meta.width && it.meta.height) {
      it._h = Math.round(columnWidthPx * clamp(it.meta.height / it.meta.width));
      return resolve(it);
    }
    const url = it.url || it.cover;
    if (!url || typeof url !== 'string') { it._h = fallbackH; return resolve(it); }
    if (url.startsWith('cloud://')) { it._h = fallbackH; return resolve(it); }
    wx.getImageInfo({
      src: url,
      success: (r) => {
        const ratio = (r.height && r.width) ? r.height / r.width : 1.15;
        it._h = Math.round(columnWidthPx * clamp(ratio));
        it.meta = it.meta || { width: r.width, height: r.height };
        resolve(it);
      },
      fail: () => { it._h = fallbackH; resolve(it); },
    });
  }));
  return Promise.all(tasks);
}

// 估算列宽（px）。给定页面左右内边距 + 列间距 + 列数。
function columnWidthPx({ pagePadding = 24, columnGap = 16, columnCount = 2 } = {}) {
  try {
    const w = wx.getWindowInfo().windowWidth;
    // 注意：传入的 pagePadding/columnGap 是 rpx；先转 px（750rpx = windowWidth）
    const rpx2px = w / 750;
    const sidePad = pagePadding * 2 * rpx2px;
    const gaps = columnGap * (columnCount - 1) * rpx2px;
    return Math.floor((w - sidePad - gaps) / columnCount);
  } catch (_) {
    return 170;
  }
}

module.exports = {
  logger,
  LOG_LEVEL,
  computeNavBar,
  formatTime,
  formatDate,
  Storage,
  saveImageToAlbum,
  distributeMasonry,
  resolveImageHeights,
  columnWidthPx,
  assignBentoAreas,
};
