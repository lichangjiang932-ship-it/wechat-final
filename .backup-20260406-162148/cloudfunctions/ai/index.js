// cloudfunctions/ai/index.js - AI云函数（豆包视觉 + 即梦图像生成）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const axios = require('axios');
const crypto = require('crypto');

// 安全的日志函数（不暴露敏感信息）
const log = {
  info: (...args) => console.log('[ai]', ...args),
  warn: (...args) => console.warn('[ai]', ...args),
  error: (...args) => console.error('[ai]', ...args),
};

// ============ 配置 ============
// 豆包大模型API配置
const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || '';
const DOUBAO_VISION_MODEL = process.env.DOUBAO_VISION_MODEL || '';
const DOUBAO_BASE_URL = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

// 即梦/火山视觉API配置
const JIMENG_AK = process.env.JIMENG_AK || '';
const JIMENG_SK = process.env.JIMENG_SK || '';
const JIMENG_BASE_URL = 'https://visual.volcengineapi.com';
const JIMENG_SERVICE = 'cv';
const JIMENG_REGION = 'cn-north-1';
const JIMENG_ACTION_SUBMIT = 'CVSync2AsyncSubmitTask';
const JIMENG_ACTION_QUERY = 'CVSync2AsyncGetResult';
const JIMENG_VERSION = '2022-08-31';
const JIMENG_REQ_KEY = 'jimeng_t2i_v40';

// 日志（不暴露密钥）
log.info('初始化完成', 'JIMENG_AK已配置:', !!JIMENG_AK);

// ============ 火山引擎 API 签名 ============
function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

function sha256Hex(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function getVolcengineAuth(method, path, queryStr, headers, body, ak, sk, service, region) {
  const now = new Date();
  const date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const credentialScope = `${date.split('T')[0]}/${region}/${service}/request`;

  const sortedHeaders = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v.trim()}`)
    .join('\n');

  const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
  const hashedPayload = sha256Hex(body || '');
  const canonicalRequest = `${method}\n${path}\n${queryStr}\n${sortedHeaders}\n\n${signedHeaders}\n${hashedPayload}`;
  const stringToSign = `HMAC-SHA256\n${date}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const signingKey = hmacSha256(`TC3-HMAC-SHA256`, date.slice(0, 8));
  const k1 = hmacSha256(signingKey, region);
  const k2 = hmacSha256(k1, service);
  const k3 = hmacSha256(k2, 'request');
  const signature = hmacSha256(k3, stringToSign).toString('hex');

  return `${service}3-HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function getVolcengineHeaders(action, body, ak, sk, service, region) {
  const now = new Date();
  const date = now.toISOString();
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);

  const headers = {
    'Content-Type': 'application/json',
    'X-Date': date.replace(/[:\-]|\.\d{3}/g, ''),
    'X-Action': action,
    'X-Version': '2022-08-31',
  };

  const queryStr = '';
  const auth = getVolcengineAuth('POST', '/', queryStr, headers, bodyStr, ak, sk, service, region);
  headers['Authorization'] = auth;

  return headers;
}

// ============ 请求ID生成 ============
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ 输入验证 ============
function validatePrompt(prompt) {
  if (!prompt) return { valid: false, msg: '请输入描述' };
  if (prompt.length > 2000) return { valid: false, msg: '描述不能超过2000字' };
  return { valid: true };
}

function validateImageFileId(fileID) {
  if (!fileID) return { valid: false, msg: '请上传参考图' };
  if (!fileID.startsWith('cloud://')) return { valid: false, msg: '图片上传失败，请重试' };
  return { valid: true };
}

// ============ 会员价格配置 ============
const VIP_PRICES = {
  month: { price: 19.9, days: 30, name: '月度会员' },
  year: { price: 199, days: 365, name: '年度会员' },
};

function validatePlan(plan) {
  if (!VIP_PRICES[plan]) return { valid: false, msg: '不支持的会员套餐' };
  return { valid: true, ...VIP_PRICES[plan] };
}

// ============ 主入口 ============
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event;
  const openid = wxContext.OPENID;
  const requestId = generateRequestId();

  if (!action) return { code: -1, msg: '缺少操作类型' };
  if (!openid) return { code: -1, msg: '无法获取用户身份' };

  log.info(`${requestId} 收到请求:`, action);

  try {
    switch (action) {
      // ===== 即梦图像生成 =====
      case 'generate': // 文生图
        log.info(requestId, '文生图请求');
        return await jimengGenerate(openid, event.prompt, event.imageRatio || 1, requestId);

      case 'img2img': // 图生图
        log.info(requestId, '图生图请求');
        return await jimengImg2Img(openid, event.prompt, event.imageFileID, event.imageRatio || 1, requestId);

      // ===== 豆包视觉 =====
      case 'critique':
        log.info(requestId, '作品点评请求');
        return await doubaoCritique(openid, event.imageFileID, requestId);

      case 'analyze':
        log.info(requestId, '配色分析请求');
        return await doubaoAnalyze(openid, event.imageFileID, requestId);

      // ===== 用户用量 ==========
      case 'usage':
        return await getUsage(openid);

      case 'createOrder':
        const planInfo = validatePlan(event.plan);
        if (!planInfo.valid) return { code: -1, msg: planInfo.msg };
        return await createOrder(openid, event.plan, requestId);

      default:
        return { code: -1, msg: '未知操作' };
    }
  } catch (e) {
    log.error(requestId, '异常:', e.message);
    return { code: -1, msg: e.message || '服务异常' };
  }
};

// ============ 即梦API - 文生图 ============
async function jimengGenerate(openid, prompt, imageRatio, requestId) {
  const limitCheck = await checkUsageLimit(openid);
  if (!limitCheck.allowed) return { code: -1, msg: limitCheck.msg };

  if (!JIMENG_AK || !JIMENG_SK) {
    log.error(requestId, '即梦API未配置');
    return { code: -1, msg: 'AI绘图服务暂未开启' };
  }

  try {
    log.info(requestId, '开始文生图');

    const body = {
      model: 'jimeng-v4',
      prompt: prompt,
      image_ratio: imageRatio,
    };

    const headers = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
    const response = await axios.post(`${JIMENG_BASE_URL}/`, { ...body, Action: JIMENG_ACTION_SUBMIT, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers });

    if (response.data.ResponseMetadata?.Error) {
      const err = response.data.ResponseMetadata.Error;
      log.error(requestId, '即梦提交失败:', err.Code, err.Message);
      return { code: -1, msg: '提交任务失败' };
    }

    const taskId = response.data?.Data?.task_id;
    if (!taskId) return { code: -1, msg: '未获取到任务ID' };
    log.info(requestId, '任务已提交:', taskId);

    // 轮询等待结果
    const result = await pollTaskResult(taskId, prompt, requestId, 't2i');
    if (result.code !== 0) return result;

    // 下载并上传到云存储
    const fileID = await downloadAndUpload(result.imageUrl, requestId);
    log.info(requestId, '文生图完成:', fileID);

    // 更新用量
    await incrementUsage(openid);

    return { code: 0, fileID, url: result.imageUrl };
  } catch (e) {
    log.error(requestId, '文生图异常:', e.message);
    return { code: -1, msg: formatError(e) };
  }
}

// ============ 即梦API - 图生图 ============
async function jimengImg2Img(openid, prompt, imageFileID, imageRatio, requestId) {
  const limitCheck = await checkUsageLimit(openid);
  if (!limitCheck.allowed) return { code: -1, msg: limitCheck.msg };

  if (!JIMENG_AK || !JIMENG_SK) {
    log.error(requestId, '即梦API未配置');
    return { code: -1, msg: 'AI绘图服务暂未开启' };
  }

  try {
    log.info(requestId, '开始图生图');

    // 获取原图临时链接
    const tempRes = await wx.cloud.getTempFileURL({ fileList: [imageFileID] });
    const imageUrl = tempRes.fileList[0]?.tempFileURL;
    if (!imageUrl) return { code: -1, msg: '参考图获取失败' };

    const body = {
      model: 'jimeng-v4',
      prompt: prompt,
      image_url: imageUrl,
      image_ratio: imageRatio,
    };

    const headers = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
    const response = await axios.post(`${JIMENG_BASE_URL}/`, { ...body, Action: JIMENG_ACTION_SUBMIT, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers });

    if (response.data.ResponseMetadata?.Error) {
      const err = response.data.ResponseMetadata.Error;
      log.error(requestId, '即梦提交失败:', err.Code);
      return { code: -1, msg: '提交任务失败' };
    }

    const taskId = response.data?.Data?.task_id;
    if (!taskId) return { code: -1, msg: '未获取到任务ID' };
    log.info(requestId, '任务已提交:', taskId);

    const result = await pollTaskResult(taskId, prompt, requestId, 'i2i');
    if (result.code !== 0) return result;

    const fileID = await downloadAndUpload(result.imageUrl, requestId);
    log.info(requestId, '图生图完成:', fileID);

    await incrementUsage(openid);

    return { code: 0, fileID, url: result.imageUrl };
  } catch (e) {
    log.error(requestId, '图生图异常:', e.message);
    return { code: -1, msg: formatError(e) };
  }
}

// ============ 轮询任务结果 ============
async function pollTaskResult(taskId, prompt, requestId, type) {
  const maxAttempts = 30;
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));

    try {
      const body = { task_id: taskId };
      const headers = getVolcengineHeaders(JIMENG_ACTION_QUERY, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
      const response = await axios.post(`${JIMENG_BASE_URL}/`, { ...body, Action: JIMENG_ACTION_QUERY, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers });

      const respData = response.data?.Data;
      const status = respData?.status;

      if (status === 'failed') {
        log.error(requestId, '任务失败:', respData.failed_reason);
        return { code: -1, msg: '生成失败，请重试' };
      }

      if (status === 'finished') {
        const images = respData?.images;
        if (images && images.length > 0) {
          return { code: 0, imageUrl: images[0].image_url };
        }
        return { code: -1, msg: '未获取到生成结果' };
      }

      log.info(requestId, `轮询 ${i + 1}/${maxAttempts}, 状态:`, status);
    } catch (e) {
      log.warn(requestId, '轮询异常:', e.message);
    }
  }

  return { code: -1, msg: '生成超时，请重试' };
}

// ============ 下载并上传到云存储 ============
async function downloadAndUpload(imageUrl, requestId) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const ext = imageUrl.split('.').pop() || 'png';
    const fileName = `${requestId}_${Date.now()}.${ext}`;

    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `ai-results/${fileName}`,
      fileContent: buffer,
    });

    return uploadRes.fileID;
  } catch (e) {
    log.error(requestId, '上传失败:', e.message);
    throw new Error('图片上传失败');
  }
}

// ============ 豆包视觉 - 作品点评 ============
async function doubaoCritique(openid, imageFileID, requestId) {
  if (!DOUBAO_API_KEY || !DOUBAO_VISION_MODEL) {
    return { code: -1, msg: '视觉分析服务暂未开启' };
  }

  try {
    const tempRes = await wx.cloud.getTempFileURL({ fileList: [imageFileID] });
    const imageUrl = tempRes.fileList[0]?.tempFileURL;
    if (!imageUrl) return { code: -1, msg: '图片获取失败' };

    const response = await axios.post(
      `${DOUBAO_BASE_URL}/chat/completions`,
      {
        model: DOUBAO_VISION_MODEL,
        messages: [
          { role: 'user', content: [
            { type: 'text', text: '请从构图、色彩、光影、技法、创意等方面详细点评这张图片，并给出改进建议。' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]}
        ],
        max_tokens: 1000,
      },
      { headers: { 'Authorization': `Bearer ${DOUBAO_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const critique = response.data?.choices?.[0]?.message?.content || '暂时无法生成点评';
    return { code: 0, critique };
  } catch (e) {
    log.error(requestId, '点评异常:', e.message);
    return { code: -1, msg: '点评生成失败' };
  }
}

// ============ 豆包视觉 - 配色分析 ============
async function doubaoAnalyze(openid, imageFileID, requestId) {
  if (!DOUBAO_API_KEY || !DOUBAO_VISION_MODEL) {
    return { code: -1, msg: '视觉分析服务暂未开启' };
  }

  try {
    const tempRes = await wx.cloud.getTempFileURL({ fileList: [imageFileID] });
    const imageUrl = tempRes.fileList[0]?.tempFileURL;
    if (!imageUrl) return { code: -1, msg: '图片获取失败' };

    const response = await axios.post(
      `${DOUBAO_BASE_URL}/chat/completions`,
      {
        model: DOUBAO_VISION_MODEL,
        messages: [
          { role: 'user', content: [
            { type: 'text', text: '请分析这张图片的配色方案，包括主色、辅色、对比色等，并推荐几个搭配方案。' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]}
        ],
        max_tokens: 800,
      },
      { headers: { 'Authorization': `Bearer ${DOUBAO_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const analysis = response.data?.choices?.[0]?.message?.content || '暂时无法分析';
    return { code: 0, analysis };
  } catch (e) {
    log.error(requestId, '分析异常:', e.message);
    return { code: -1, msg: '配色分析失败' };
  }
}

// ============ 用量管理 ============
async function checkUsageLimit(openid) {
  const FREE_DAILY_LIMIT = 5;
  const isVip = await checkVipStatus(openid);
  if (isVip) return { allowed: true, isVip: true };

  const today = new Date().toISOString().split('T')[0];
  try {
    const res = await db.collection('ai_usage').where({ openid, date: today }).get();
    const used = res.data[0]?.count || 0;
    if (used >= FREE_DAILY_LIMIT) return { allowed: false, msg: `今日免费次数已用完（${FREE_DAILY_LIMIT}次），开通会员可解锁无限次使用` };
    return { allowed: true, isVip: false, used, limit: FREE_DAILY_LIMIT };
  } catch (e) {
    return { allowed: true, isVip: false };
  }
}

async function incrementUsage(openid) {
  const today = new Date().toISOString().split('T')[0];
  try {
    await db.collection('ai_usage').where({ openid, date: today }).update({
      data: { count: _.inc(1) },
    });
  } catch (e) {
    try {
      await db.collection('ai_usage').add({ data: { openid, date: today, count: 1 } });
    } catch (e2) {}
  }
}

async function getUsage(openid) {
  const FREE_DAILY_LIMIT = 5;
  const today = new Date().toISOString().split('T')[0];
  const isVip = await checkVipStatus(openid);
  let used = 0;

  if (!isVip) {
    try {
      const res = await db.collection('ai_usage').where({ openid, date: today }).get();
      used = res.data[0]?.count || 0;
    } catch (e) {}
  }

  return {
    code: 0,
    data: { used, limit: isVip ? -1 : FREE_DAILY_LIMIT, isVip },
  };
}

async function checkVipStatus(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get();
    const user = res.data[0];
    if (!user || !user.vipLevel || !user.vipExpireTime) return false;
    return user.vipExpireTime > Date.now();
  } catch (e) {
    return false;
  }
}

// ============ 会员支付 ============
async function createOrder(openid, plan, requestId) {
  const IS_TEST_MODE = true; // 演示模式
  const PAY_NOTIFY_URL = '';

  if (!PAY_NOTIFY_URL && !IS_TEST_MODE) {
    return { code: -1, msg: '支付服务暂不可用' };
  }

  const planInfo = VIP_PRICES[plan];
  if (!planInfo) return { code: -1, msg: '不支持的套餐' };

  if (IS_TEST_MODE) {
    // 演示模式：直接开通会员
    const expireTime = Date.now() + planInfo.days * 24 * 60 * 60 * 1000;
    try {
      await db.collection('users').where({ openid }).update({
        data: { vipLevel: plan, vipExpireTime: expireTime, updateTime: Date.now() },
      });
      log.info(requestId, '演示模式开通会员:', plan);
      return { code: 0, demo: true, msg: '演示模式，会员已开通' };
    } catch (e) {
      try {
        await db.collection('users').add({
          data: { openid, vipLevel: plan, vipExpireTime: expireTime, createTime: Date.now() },
        });
        return { code: 0, demo: true, msg: '演示模式，会员已开通' };
      } catch (e2) {
        return { code: -1, msg: '开通失败' };
      }
    }
  }

  // 真实支付流程（需配置微信支付）
  return { code: -1, msg: '支付功能待配置' };
}

// ============ 错误处理 ============
function formatError(e) {
  if (e.message.includes('401') || e.message.includes('认证')) return 'API认证失败，请检查配置';
  if (e.message.includes('429') || e.message.includes('限额')) return '请求过于频繁，请稍后重试';
  if (e.message.includes('network') || e.message.includes('网络')) return '网络连接失败';
  if (e.message.includes('timeout')) return '请求超时，请重试';
  return '服务暂时不可用，请稍后重试';
}
