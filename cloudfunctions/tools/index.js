// cloudfunctions/tools/index.js - 工具配置查询 + 作品/收藏云端同步 + 小程序码
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 集合不存在时自动建表后重试。WeChat CloudBase 的 .add() 不会自动建集合，
// 必须显式 createCollection；否则返回 -502005 ResourceNotFound。
async function safeAdd(collectionName, data) {
  try {
    return await db.collection(collectionName).add({ data });
  } catch (e) {
    if (e && e.errCode === -502005) {
      try { await db.createCollection(collectionName); } catch (_) { /* 可能已存在 */ }
      return await db.collection(collectionName).add({ data });
    }
    throw e;
  }
}

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

    // ===== 我的上传云端同步 =====
    case 'saveUpload':
      return await saveUpload(openid, event.item);
    case 'getUploads':
      return await getUploads(openid, event.limit || 200);
    case 'deleteUpload':
      return await deleteUpload(openid, event.uploadId);

    // ===== 发现页 - 获取公开展览作品 =====
    case 'getGalleryWorks':
      return await getGalleryWorks(event);

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
    const res = await safeAdd('my_works', data);
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
    try {
      const exist = await db.collection('my_favorites').where({ openid, itemId: item.id }).count();
      if (exist.total > 0) return { code: 0, data: { msg: '已收藏' } };
    } catch (countErr) {
      console.warn('saveFavorite dedup skipped:', countErr && countErr.errMsg);
    }

    const data = {
      openid,
      itemId: sanitize(item.id, 100),
      title: sanitize(item.title, 100),
      cover: sanitize(item.cover || item.url, 200),
      likes: typeof item.likes === 'number' ? Math.max(0, Math.floor(item.likes)) : 0,
      createTime: Date.now(),
    };
    await safeAdd('my_favorites', data);
    return { code: 0, data: { msg: '收藏成功' } };
  } catch (e) {
    console.error('saveFavorite error:', e);
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

// ===== 我的上传 =====
async function saveUpload(openid, item) {
  if (!openid) return { code: -1, msg: '未登录' };
  if (!item || typeof item !== 'object') return { code: -1, msg: '上传数据无效' };
  if (!item.fileID || typeof item.fileID !== 'string') return { code: -1, msg: 'fileID 必填' };

  const sanitize = (val, max) => (typeof val === 'string' ? val.slice(0, max) : '');
  const now = Date.now();

  try {
    // 防止重复上传同一张（按 fileID + openid 去重）
    // 集合可能尚未创建，查询失败时跳过去重、继续执行 add（add 会自动建集合）
    try {
      const exist = await db.collection('my_uploads')
        .where({ openid, fileID: item.fileID })
        .count();
      if (exist.total > 0) {
        return { code: 0, data: { msg: '已存在', duplicate: true } };
      }
    } catch (countErr) {
      console.warn('saveUpload dedup skipped:', countErr && countErr.errMsg);
    }

    const data = {
      openid,
      fileID: sanitize(item.fileID, 200),
      url: sanitize(item.url || item.fileID, 200),
      name: sanitize(item.name, 100) || '未命名',
      size: typeof item.size === 'number' ? Math.min(item.size, 50 * 1024 * 1024) : 0,
      uploadTime: item.uploadTime || now,
      createTime: now,
    };
    const res = await safeAdd('my_uploads', data);
    return { code: 0, data: { id: res._id, msg: '保存成功' } };
  } catch (e) {
    console.error('saveUpload error:', e);
    return { code: -1, msg: '保存失败' };
  }
}

async function getUploads(openid, limit = 200) {
  if (!openid) return { code: -1, msg: '未登录' };
  try {
    const res = await db.collection('my_uploads')
      .where({ openid })
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get();
    return { code: 0, data: res.data };
  } catch (e) {
    console.error('getUploads error:', e);
    return { code: 0, data: [] };
  }
}

async function deleteUpload(openid, uploadId) {
  if (!openid || !uploadId) return { code: -1, msg: '参数错误' };
  try {
    const itemRes = await db.collection('my_uploads').doc(uploadId).get();
    const item = itemRes.data;
    if (!item || item.openid !== openid) return { code: -1, msg: '无权限删除' };
    await db.collection('my_uploads').doc(uploadId).remove();
    return { code: 0, msg: '删除成功' };
  } catch (e) {
    return { code: -1, msg: '删除失败' };
  }
}

// ===== 发现页 - 获取公开展览作品 =====
// 兼容多种字段命名：title/name, fileID/url/image/imageUrl/cover/img, prompt/desc/description, style/type/styleId, createTime/created_at/timestamp
async function getGalleryWorks({ page = 1, pageSize = 20, category, keyword } = {}) {
  try {
    const skip = (Math.max(1, page) - 1) * pageSize;
    let query = db.collection('my_works');

    // 分类筛选：尝试匹配 style / styleId / type / category 字段
    if (category && category !== '推荐') {
      const styleValues = getCategoryStyleValues(category);
      if (styleValues) {
        query = query.where(_.or([
          { style: _.in(styleValues) },
          { styleId: _.in(styleValues) },
          { type: _.in(styleValues) },
          { category: _.in(styleValues) },
        ]));
      }
    }

    // 关键词搜索：匹配多种可能的标题/描述字段
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();
      const regExp = db.RegExp({ regexp: kw, options: 'i' });
      query = query.where(_.or([
        { title: regExp },
        { name: regExp },
        { prompt: regExp },
        { desc: regExp },
        { description: regExp },
      ]));
    }

    // 按创建时间倒序，分页（不使用 field 投影，兼容不同字段结构）
    const countRes = await query.count();
    const total = countRes.total;

    const res = await query
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    // 格式化为发现页所需的数据结构（兼容多种字段命名）
    const works = res.data.map((item, index) => {
      const cover = item.fileID || item.url || item.image || item.imageUrl || item.cover || item.img || '';
      const style = item.style || item.styleId || item.type || item.category || '';
      return {
        id: item._id,
        title: item.title || item.name || 'AI作品',
        cover,
        likes: item.likes || 0,
        h: 280 + (index % 4) * 40,
        category: mapStyleToCategory(style),
        prompt: item.prompt || item.desc || item.description || '',
        style,
        createTime: item.createTime || item.created_at || item.timestamp || 0,
      };
    });

    return {
      code: 0,
      data: {
        works,
        total,
        page,
        pageSize,
        hasMore: skip + works.length < total,
      },
    };
  } catch (e) {
    console.error('getGalleryWorks error:', e);
    return { code: -1, msg: '获取作品失败' };
  }
}

// 展示分类对应的 style 值
function getCategoryStyleValues(category) {
  const map = {
    '写真': ['real', 'portrait', '写真'],
    '证件照': ['real', 'portrait', 'idphoto', '证件照'],
    '艺术': ['oil', 'watercolor', 'chinese', 'fantasy', 'sketch', 'cyber', '3d', '艺术', '油画', '水彩', '国风'],
    '动漫': ['anime', 'clay', 'pixel', 'comic', '动漫', '二次元'],
  };
  return map[category] || null;
}

// style 字段映射到展示分类
function mapStyleToCategory(style) {
  if (!style) return '推荐';
  const s = String(style).toLowerCase();
  const map = {
    real: '写真', portrait: '写真', idphoto: '证件照',
    oil: '艺术', watercolor: '艺术', chinese: '艺术', fantasy: '艺术', sketch: '艺术', cyber: '艺术', '3d': '艺术',
    anime: '动漫', clay: '动漫', pixel: '动漫', comic: '动漫',
    写真: '写真', 证件照: '证件照', 艺术: '艺术', 动漫: '动漫',
    油画: '艺术', 水彩: '艺术', 国风: '艺术', 二次元: '动漫',
  };
  return map[s] || '推荐';
}