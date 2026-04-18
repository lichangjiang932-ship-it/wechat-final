// cloudfunctions/tools/index.js - 工具配置查询 + 作品/收藏云端同步 + 小程序码
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 默认工具配置
const DEFAULT_TOOLS = [
  { id: 'enhance', name: '画质提升', icon: '✨', desc: '提升图片分辨率和清晰度', btnText: '开始提升' },
  { id: 'colorize', name: '线稿上色', icon: '🎨', desc: '给黑白线稿自动上色', btnText: '开始上色' },
  { id: 'style', name: '风格迁移', icon: '🖼️', desc: '将照片转换为不同艺术风格', btnText: '开始转换' },
  { id: 'extract', name: '线条提取', icon: '✏️', desc: '从照片中提取线条', btnText: '开始提取' },
];

exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {
    case 'list':
      return await listTools();

    // ===== 小程序码 =====
    case 'getMiniProgramCode':
      return await getMiniProgramCode(event.scene, event.page);

    // ===== 我的作品云端同步 =====
    case 'saveWork':
      return await saveWork(openid, event.work);
    case 'getWorks':
      return await getWorks(openid, event.limit || 100);
    case 'deleteWork':
      return await deleteWork(openid, event.workId);

    // ===== 我的收藏云端同步 =====
    case 'saveFavorite':
      return await saveFavorite(openid, event.item);
    case 'getFavorites':
      return await getFavorites(openid);
    case 'removeFavorite':
      return await removeFavorite(openid, event.itemId);

    default:
      return { code: -1, msg: '未知操作' };
  }
};

// ===== 小程序码生成 =====
async function getMiniProgramCode(scene = '', page = 'pages/index/index') {
  try {
    // 检查是否已有缓存的二维码
    const cacheKey = `wxacode_${scene || 'default'}`;
    
    // 调用微信接口生成小程序码
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: scene || ' ',
      page: page,
      width: 280,
      auto_color: false,
      line_color: { r: 201, g: 149, b: 107 }, // 品牌色
      is_hyaline: true, // 透明底
    });

    if (result.errCode === 0 && result.buffer) {
      // 上传到云存储
      const fileExt = 'png';
      const cloudPath = `wxacode/${cacheKey}_${Date.now()}.${fileExt}`;
      
      const uploadRes = await cloud.uploadFile({
        cloudPath,
        fileContent: Buffer.from(result.buffer, 'base64'),
      });

      return { code: 0, fileID: uploadRes.fileID };
    }

    return { code: -1, msg: '生成小程序码失败' };
  } catch (e) {
    console.error('getMiniProgramCode error:', e);
    return { code: -1, msg: e.message || '生成小程序码失败' };
  }
}

// 工具列表
async function listTools() {
  try {
    const res = await db.collection('tools').orderBy('sort', 'asc').get();
    if (res.data && res.data.length > 0) return { code: 0, data: res.data };
    return { code: 0, data: DEFAULT_TOOLS };
  } catch (e) {
    return { code: 0, data: DEFAULT_TOOLS };
  }
}

// ===== 我的作品 =====
async function saveWork(openid, work) {
  if (!openid) return { code: -1, msg: '未登录' };
  if (!work || typeof work !== 'object') return { code: -1, msg: '作品数据无效' };
  if (!work.url || typeof work.url !== 'string') return { code: -1, msg: '作品数据无效' };

  // 字段长度限制，防止超大载荷
  const sanitize = (val, max) => (typeof val === 'string' ? val.slice(0, max) : '');

  try {
    const data = {
      openid,
      fileID: sanitize(work.fileID, 200),
      url: sanitize(work.fileID || work.url, 200),
      title: sanitize(work.title, 100) || 'AI作品',
      prompt: sanitize(work.prompt, 500),
      style: sanitize(work.style, 50),
      createTime: typeof work.id === 'number' ? work.id : Date.now(),
    };
    const res = await db.collection('my_works').add({ data });
    return { code: 0, data: { id: res._id, msg: '保存成功' } };
  } catch (e) {
    console.error('saveWork error:', e);
    return { code: -1, msg: '保存失败' };
  }
}

async function getWorks(openid, limit = 100) {
  if (!openid) return { code: -1, msg: '未登录' };
  try {
    const res = await db.collection('my_works').where({ openid }).orderBy('createTime', 'desc').limit(limit).get();
    return { code: 0, data: res.data };
  } catch (e) {
    return { code: 0, data: [] };
  }
}

async function deleteWork(openid, workId) {
  if (!openid || !workId) return { code: -1, msg: '参数错误' };
  try {
    const workRes = await db.collection('my_works').doc(workId).get();
    const work = workRes.data;
    if (!work || work.openid !== openid) return { code: -1, msg: '无权限删除该作品' };

    await db.collection('my_works').doc(workId).remove();
    return { code: 0, msg: '删除成功' };
  } catch (e) {
    return { code: -1, msg: '删除失败' };
  }
}

// ===== 我的收藏 =====
async function saveFavorite(openid, item) {
  if (!openid) return { code: -1, msg: '未登录' };
  if (!item || typeof item !== 'object') return { code: -1, msg: '收藏数据无效' };
  if (!item.id || typeof item.id !== 'string') return { code: -1, msg: '收藏数据无效' };

  const sanitize = (val, max) => (typeof val === 'string' ? val.slice(0, max) : '');

  try {
    const exist = await db.collection('my_favorites').where({ openid, itemId: item.id }).count();
    if (exist.total > 0) return { code: 0, data: { msg: '已收藏' } };

    const data = {
      openid,
      itemId: sanitize(item.id, 100),
      title: sanitize(item.title, 100),
      cover: sanitize(item.cover || item.url, 200),
      likes: typeof item.likes === 'number' ? Math.max(0, Math.floor(item.likes)) : 0,
      createTime: Date.now(),
    };
    await db.collection('my_favorites').add({ data });
    return { code: 0, data: { msg: '收藏成功' } };
  } catch (e) {
    return { code: -1, msg: '收藏失败' };
  }
}

async function getFavorites(openid) {
  if (!openid) return { code: -1, msg: '未登录' };
  try {
    const res = await db.collection('my_favorites').where({ openid }).orderBy('createTime', 'desc').get();
    return { code: 0, data: res.data };
  } catch (e) {
    return { code: 0, data: [] };
  }
}

async function removeFavorite(openid, itemId) {
  if (!openid || !itemId) return { code: -1, msg: '参数错误' };
  try {
    await db.collection('my_favorites').where({ openid, itemId }).remove();
    return { code: 0, msg: '取消收藏成功' };
  } catch (e) {
    return { code: -1, msg: '取消收藏失败' };
  }
}