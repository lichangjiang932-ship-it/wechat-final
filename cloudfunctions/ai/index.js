// cloudfunctions/ai/index.js - AI云函数（DeepSeek提示词增强 + 即梦图像生成）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const usage = require('./usage');
const axios = require('axios');
const crypto = require('crypto');

// 安全的日志函数（不暴露敏感信息）
const log = {
  info: (...args) => console.log('[ai]', ...args),
  warn: (...args) => console.warn('[ai]', ...args),
  error: (...args) => console.error('[ai]', ...args),
};

// ============ 通用 axios 配置 ============
const AXIOS_TIMEOUT = parseInt(process.env.AXIOS_TIMEOUT_MS || '30000', 10);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ============ 配置 ============
// DeepSeek API配置
// 在微信云开发控制台配置环境变量：
// - DEEPSEEK_API_KEY: DeepSeek API密钥（从 https://platform.deepseek.com 获取）
// - DEEPSEEK_MODEL: 模型名（默认 deepseek-chat）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL    = process.env.DEEPSEEK_MODEL    || 'deepseek-chat';

// 即梦/火山视觉API配置
const JIMENG_AK = process.env.JIMENG_AK || '';
const JIMENG_SK = process.env.JIMENG_SK || '';
const JIMENG_BASE_URL = 'https://visual.volcengineapi.com';
const JIMENG_SERVICE = 'cv';
const JIMENG_REGION = 'cn-north-1';
const JIMENG_ACTION_SUBMIT = 'CVSync2AsyncSubmitTask';
const JIMENG_ACTION_QUERY = 'CVSync2AsyncGetResult';
const JIMENG_VERSION = '2022-08-31';

// 日志（不暴露密钥）
log.info('初始化完成', 'JIMENG_AK已配置:', !!JIMENG_AK);

// ============ 火山引擎 API 签名 ============
function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

function sha256Hex(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function getVolcengineAuth(method, path, queryStr, headers, body, ak, sk, service, region, now) {
  const date = (now || new Date()).toISOString().replace(/[:\-]|\.\d{3}/g, '');
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

  const signingKey = hmacSha256(sk, date.slice(0, 8));
  const k1 = hmacSha256(signingKey, region);
  const k2 = hmacSha256(k1, service);
  const k3 = hmacSha256(k2, 'request');
  const signature = hmacSha256(k3, stringToSign).toString('hex');

  return `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function encodeRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildCanonicalQuery(params) {
  return Object.keys(params)
    .sort()
    .map(k => `${encodeRFC3986(k)}=${encodeRFC3986(String(params[k]))}`)
    .join('&');
}

function getVolcengineHeaders(action, body, ak, sk, service, region) {
  const now = new Date();
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const queryStr = buildCanonicalQuery({ Action: action, Version: JIMENG_VERSION });

  const headers = {
    'Content-Type': 'application/json',
    'Host': 'visual.volcengineapi.com',
    'X-Date': now.toISOString().replace(/[:\-]|\.\d{3}/g, ''),
    'X-Content-Sha256': sha256Hex(bodyStr),
  };

  const auth = getVolcengineAuth('POST', '/', queryStr, headers, bodyStr, ak, sk, service, region, now);
  headers.Authorization = auth;

  return { headers, queryStr };
}

// ============ 请求ID生成 ============
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ 集合不存在时自动建表（首次部署） ============
async function safeAdd(collectionName, data) {
  const db = cloud.database();
  try {
    return await db.collection(collectionName).add({ data });
  } catch (e) {
    if (e && e.errCode === -502005) {
      try { await db.createCollection(collectionName); } catch (_) {}
      return await db.collection(collectionName).add({ data });
    }
    throw e;
  }
}

// ============ 即梦 API 提交：碰到并发限制(429/50430) 退避重试 ============
// 火山引擎免费/低配版并发数很低(常见 1-3 并发)，多个用户同时点生成时容易触发
async function postJimengWithBackoff(url, body, headers, requestId, label = 'submit') {
  // 并发=1 场景：退避时间要覆盖生成时长（15~40s），默认最长退避 55s，总退避约 106s
  const RATE_LIMIT_RETRIES = parseInt(process.env.RATE_LIMIT_RETRIES || '4', 10);
  const BACKOFF_MS = (process.env.RATE_LIMIT_BACKOFF_MS || '6000,15000,30000,55000')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await axios.post(url, body, { headers, timeout: AXIOS_TIMEOUT });
    } catch (e) {
      const status = e?.response?.status;
      const apiCode = e?.response?.data?.code;
      const isRateLimit =
        status === 429 ||
        apiCode === 50430 ||
        /reach.*concurrent.*limit/i.test(e?.response?.data?.message || '');

      if (isRateLimit && attempt < RATE_LIMIT_RETRIES) {
        const delay = BACKOFF_MS[attempt] || BACKOFF_MS[BACKOFF_MS.length - 1] || 60000;
        log.warn(requestId, `[${label}] 触发并发限制(50430)，${delay}ms 后重试 ${attempt + 1}/${RATE_LIMIT_RETRIES}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }
  // 不会到达此处（要么 return 要么 throw）
  throw new Error('postJimengWithBackoff: unreachable');
}

// ============================================================
//  Skill Enhancer — 单轮 Skill 路由 + Prompt 增强
//  流程：路由 → Skill增强 → 生成（最多2次LLM调用，无迭代循环）
//  对应 GEMS 论文：保留 Planner/Skill，去掉 Verifier/Refiner
// ============================================================

// ---- 视觉风格渲染指令（STYLE SKILLS — 对应用户选择的风格卡片） ----
const STYLE_SKILLS = {
  real:       'Render as photorealism: golden-hour or soft-diffused natural light, shallow depth of field, DSLR lens character, authentic skin pores and fabric weave, genuine unprocessed atmosphere.',
  anime:      'Render as Japanese anime: expressive detailed eyes with catchlights, clean precise linework, vibrant saturated palette, dynamic pose with energy lines, Makoto Shinkai / Ghibli atmospheric lighting.',
  oil:        'Render as oil painting: visible impasto brushstrokes, warm Venetian palette, chiaroscuro drama, thick paint texture, old-masters compositional balance.',
  watercolor: 'Render as watercolor: transparent layered washes, wet-on-wet blooms, luminous paper whites showing through, delicate bleeding edges, airy and luminous.',
  sketch:     'Render as pencil sketch: confident hatching and cross-hatching, full tonal range, paper grain visible, gestural expressive marks, graphite sheen on highlights.',
  chinese:    'Render as Chinese ink painting (水墨): generous negative space (留白), ink-wash gradients deep black to misty silver, classical motifs (bamboo, pine, mist, craggy rocks), xieyi freehand brushwork, poetic stillness.',
  cyber:      'Render as cyberpunk: neon reflections on rain-slicked pavement, volumetric smog, layered holographic ads, vertiginous tower density, hard rim lighting with ink-black shadows.',
  '3d':       'Render as high-quality CGI: physically-based materials, three-point cinematic lighting with fill and rim, subsurface scattering on organic surfaces, photorealistic cast shadows, octane/V-Ray render quality.',
  clay:       'Render as clay stop-motion: smooth rounded organic forms, soft pastel palette, gentle ambient occlusion creases, matte tactile surface, warm studio fill lighting, chibi toy proportions.',
  pixel:      'Render as pixel art: clean 16-32 bit sprites, readable iconic silhouette, restrained dithered palette, strong outline with 1px precision, retro game aesthetic.',
  comic:      'Render as comic book: bold 2-4px black outlines, Ben-Day dot or cel shading, flat saturated fills, dynamic diagonal action lines, pop-art color punches.',
  fantasy:    'Render as dreamy fantasy: ethereal soft rim backlight, bioluminescent particle bokeh, pastel aurora gradient sky, magical chromatic glow, painterly impressionist finish.',
};

// ---- 内容技能库（CONTENT SKILLS — 按画面主体自动路由） ----
// 类比 GEMS skill_manager 扫描 SKILL.md 得到的清单
const CONTENT_SKILLS = {
  portrait: {
    name: '人像写真',
    triggerWhen: 'prompt mentions a person, people, face, girl, boy, man, woman, character, figure, portrait, 人, 女, 男, 少女, 少年, 人物',
    doNotTrigger: 'for landscapes without humans, animals, pure objects, or abstract concepts',
    instructions: `Portrait photography skill:
- Subject: describe age range, expression, pose with specific adjectives (e.g. "soft smile", "contemplative gaze")
- Lighting: choose one — golden-hour backlight halo, Rembrandt side shadow, studio softbox wrap, window diffusion
- Composition: eye-level or slight low-angle, subject at rule-of-thirds intersection, shallow DOF isolating face
- Background: contextual but blurred (bokeh), color-complementary to subject clothing
- Detail: natural skin texture, catchlights in irises, individual hair strands, fabric weave visible`,
  },
  landscape: {
    name: '风光建筑',
    triggerWhen: 'prompt describes outdoor scenery, nature, mountains, ocean, forest, city skyline, buildings, sky, 风景, 山, 海, 城市, 建筑, 天空, 森林',
    doNotTrigger: 'for close-up portraits, product shots, or purely abstract concepts',
    instructions: `Landscape & architecture skill:
- Perspective: wide-angle with strong foreground interest anchoring depth, leading lines to hero subject
- Atmosphere: specify weather and time — golden hour, blue hour, heavy overcast, dawn mist, storm drama
- Scale: include size-reference elements (tree, person silhouette) to convey grandeur
- Layers: foreground texture + mid-ground focus + atmospheric background haze
- Light direction: side light for texture, backlight for silhouette rim, diffused overcast for mood`,
  },
  creative: {
    name: '创意概念',
    triggerWhen: 'prompt involves fantasy, magic, surreal, abstract, dream, imaginary, impossible, concept art, 幻想, 梦幻, 奇幻, 超现实, 概念, 魔法, 抽象',
    doNotTrigger: 'for realistic documentary photography or straightforward object shots',
    instructions: `Creative concept art skill:
- Core metaphor: identify the central visual metaphor and amplify it with one unexpected scale juxtaposition
- Surreal element: combine one organic + one geometric form in tension
- Color symbolism: dominant color with single complementary accent to reinforce emotional theme
- Impossible light: add one physically-impossible light source (light from within, upward shadow, dual suns)
- Texture contrast: pair smooth glass/metal with rough bark/stone for tactile richness`,
  },
  product: {
    name: '静物产品',
    triggerWhen: 'prompt focuses on inanimate objects, food, drink, beverage, plants, animals, items, 食物, 饮料, 植物, 动物, 物品, 产品, 静物, 猫, 狗',
    doNotTrigger: 'for scenes primarily featuring people or large-scale environments',
    instructions: `Still life & product skill:
- Isolation: minimal background — pure white, gradient grey, or single-color contextual surface
- Lighting: three-point studio or single window with white-card fill, no harsh cast shadows
- Detail: macro-level material quality — glossy reflection, translucent glow, matte powder, liquid meniscus
- Composition: rule of odds (group of 3), intentional placement angle (30-45° elevated view)
- Context: at most 1-2 complementary prop items to imply story without cluttering`,
  },
};

// 质量后缀（"describe the good" 原则 — 不用 negative prompts）
const QUALITY_BOOST = ', best quality, highly detailed, masterpiece, sharp focus, professional composition';

// 画幅比例 → 即梦 API 需要的宽高（即梦 v4.0 接受的范围 512~2048）
// 客户端 ratioMap：{ '1:1': 1, '3:4': 2, '4:3': 3, '9:16': 5, '16:9': 4 }
const RATIO_DIMENSIONS = {
  1: { width: 1024, height: 1024 }, // 1:1
  2: { width: 768,  height: 1024 }, // 3:4
  3: { width: 1024, height: 768 },  // 4:3
  4: { width: 1280, height: 720 },  // 16:9
  5: { width: 720,  height: 1280 }, // 9:16
};

function resolveDimensions(ratioCode) {
  return RATIO_DIMENSIONS[ratioCode] || RATIO_DIMENSIONS[1];
}

// ============ Step 1 — 路由决策（Planner Decision，轻量快速） ============
// 让 MLLM 从内容技能清单里选一个 skill_id，或回答 NONE
// max_tokens=10，温度=0，成本极低（通常 <0.01元/次）
async function routeToContentSkill(rawPrompt, requestId) {
  if (!DEEPSEEK_API_KEY || !DEEPSEEK_MODEL) return null;

  const manifest = Object.entries(CONTENT_SKILLS)
    .map(([id, s]) => `- ${id} (${s.name}): trigger when ${s.triggerWhen}. Do NOT trigger: ${s.doNotTrigger}.`)
    .join('\n');

  const decisionPrompt = `You are a routing module. Given the skill list and user prompt, reply with exactly one skill_id or NONE. Default to NONE if unsure or if the prompt is simple.

Skills:
${manifest}

User prompt: "${rawPrompt}"

Reply with ONLY a single word: one of [${Object.keys(CONTENT_SKILLS).join(', ')}, NONE]. No explanation.`;

  try {
    const res = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: decisionPrompt }],
        max_tokens: 10,
        temperature: 0,
      },
      { headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );

    const reply = (res.data?.choices?.[0]?.message?.content || '').trim().toLowerCase().split(/\s/)[0];
    if (CONTENT_SKILLS[reply]) {
      log.info(requestId, `内容路由 → ${reply} (${CONTENT_SKILLS[reply].name})`);
      return reply;
    }
    log.info(requestId, '内容路由 → NONE');
    return null;
  } catch (e) {
    log.warn(requestId, '路由失败，跳过:', e.message);
    return null;
  }
}

// ============ Step 2 — Skill 增强（单次 LLM 调用，合并 content + style 指令） ============
async function applySkillEnhancement(rawPrompt, contentSkillId, styleId, mode, requestId) {
  if (!DEEPSEEK_API_KEY || !DEEPSEEK_MODEL) return null;

  const contentInstructions = contentSkillId ? CONTENT_SKILLS[contentSkillId].instructions : '';
  const styleInstructions   = STYLE_SKILLS[styleId] || '';
  const modeNote = mode === 'img2img'
    ? 'Image-to-image mode: preserve the subject identity and composition from the reference, apply style changes only.'
    : '';

  const prompt = `You are an expert prompt engineer for the Jimeng (即梦) image generation model.

Enhance the user's brief description into a high-quality English image generation prompt.

## Content Skill Instructions
${contentInstructions || 'No specific content skill. Use general best practices for the subject matter.'}

## Visual Style
${styleInstructions || 'No specific style selected. Keep realistic unless the subject implies otherwise.'}

${modeNote}

## Output Rules
- Return ONLY the final enhanced prompt text
- English only, no Chinese, no explanation, no quotes, no prefixes
- Under 130 words, dense with specific visual descriptors
- Describe what IS present — never use negative terms (no, without, avoid, etc.)

## User Input
${rawPrompt}`;

  try {
    const res = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.72,
      },
      { headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 12000 }
    );

    const enhanced = res.data?.choices?.[0]?.message?.content?.trim();
    if (enhanced && enhanced.length > 10) {
      log.info(requestId, `Skill增强完成 [content=${contentSkillId || 'NONE'}, style=${styleId || 'NONE'}]:`, enhanced.slice(0, 60));
      return enhanced;
    }
  } catch (e) {
    log.warn(requestId, 'Skill增强失败（降级用原始提示词）:', e.message);
  }
  return null;
}

// ============ 统一入口：路由 → 增强 → 质量后缀 ============
// 触发Skill时：2次LLM调用（路由+增强）+ 1次生成 = 3次
// 未触发Skill：1次LLM调用（增强）+ 1次生成 = 2次
async function buildFinalPrompt(rawPrompt, styleId, mode, requestId) {
  // 路由：找内容技能（如用户已选 style 且该 style 同时是内容 skill，可跳过路由）
  const contentSkillId = await routeToContentSkill(rawPrompt, requestId);

  // 增强：合并内容技能 + 视觉风格指令，单次调用
  const enhanced = await applySkillEnhancement(rawPrompt, contentSkillId, styleId, mode, requestId);

  const base = enhanced || rawPrompt;
  return {
    finalPrompt: base + QUALITY_BOOST,
    contentSkillId,
    contentSkillName: contentSkillId ? CONTENT_SKILLS[contentSkillId].name : null,
  };
}

// ============ 会员价格配置 ============
const VIP_PRICES = {
  month: { price: 19.9, days: 30, name: '月度会员' },
  year: { price: 199, days: 365, name: '年度会员' },
};

const IS_TEST_MODE = String(process.env.IS_TEST_MODE || 'false').toLowerCase() === 'true';
const PAY_NOTIFY_URL = process.env.PAY_NOTIFY_URL || '';
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID || '';
const WECHAT_PAY_KEY = process.env.WECHAT_PAY_KEY || '';
const WECHAT_UNIFIED_ORDER_URL = process.env.WECHAT_UNIFIED_ORDER_URL || 'https://api.mch.weixin.qq.com/pay/unifiedorder';
// 测试模式白名单：逗号分隔的 openid 列表，为空则拒绝所有测试请求
const TEST_MODE_OPENIDS = (process.env.TEST_MODE_OPENIDS || '').split(',').map(s => s.trim()).filter(Boolean);

function validatePlan(plan) {
  if (!VIP_PRICES[plan]) return { valid: false, msg: '不支持的会员套餐' };
  return { valid: true, ...VIP_PRICES[plan] };
}

const MAX_PROMPT_LENGTH = 500;

// ============ 主入口 ============
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event;
  const openid = wxContext.OPENID;
  const requestId = generateRequestId();

  if (!action) {
    log.warn(requestId, '缺少操作类型', { openid });
    return { code: -1, msg: '请求参数错误：缺少操作类型' };
  }
  if (!openid) {
    log.warn(requestId, '无法获取用户身份');
    return { code: -1, msg: '用户身份验证失败，请重新登录' };
  }

  log.info(`${requestId} 收到请求:`, action, { openid });

  try {
    switch (action) {
      // ===== 即梦图像生成 =====
      case 'generate': // 文生图
        log.info(requestId, '文生图请求');
        if (event.prompt && event.prompt.length > MAX_PROMPT_LENGTH) return { code: -1, msg: `描述不能超过${MAX_PROMPT_LENGTH}字` };
        // 内容安全审核（微信要求，不过不能上线）
        {
          const sec = await msgSecCheck(event.prompt, openid, requestId);
          if (!sec.pass) return { code: -1, msg: sec.msg || '内容含违规信息，请修改后重试' };
        }
        return await jimengGenerate(openid, event.prompt, event.styleId || '', event.imageRatio || 1, requestId);

      case 'img2img': // 图生图
        log.info(requestId, '图生图请求');
        if (event.prompt && event.prompt.length > MAX_PROMPT_LENGTH) return { code: -1, msg: `描述不能超过${MAX_PROMPT_LENGTH}字` };
        if (event.prompt) {
          const sec = await msgSecCheck(event.prompt, openid, requestId);
          if (!sec.pass) return { code: -1, msg: sec.msg || '内容含违规信息，请修改后重试' };
        }
        return await jimengImg2Img(openid, event.prompt, event.styleId || '', event.imageFileID, event.imageRatio || 1, requestId);

      // ===== 用户用量 ==========
      case 'usage':
        return await usage.getUsage(openid);

      case 'createOrder':
        const planInfo = validatePlan(event.plan);
        if (!planInfo.valid) return { code: -1, msg: planInfo.msg };
        return await createOrder(openid, event.plan, requestId, event);

      // ===== AI 海报文案生成 =====
      case 'caption':
        return await generatePosterCaption(event, openid, requestId);

      default:
        log.warn(requestId, '未知操作', { action });
        return { code: -1, msg: '不支持的操作类型' };
    }
  } catch (e) {
    let userMsg = '服务器异常，请稍后重试';
    if (e.isAxiosError) userMsg = '网络请求失败，请检查网络';
    else if (e.message && e.message.includes('timeout')) userMsg = '请求超时，请稍后重试';

    log.error(requestId, '异常:', e.message, { stack: e.stack, openid, action });
    return { code: -1, msg: userMsg };
  }
};

// ============ 即梦API - 生成（统一入口） ============
async function _generateImage(openid, prompt, styleId, imageRatio, requestId, imageFileID) {
  const limitCheck = await usage.checkUsageLimit(openid);
  if (!limitCheck.allowed) return { code: -1, msg: limitCheck.msg };

  if (!JIMENG_AK || !JIMENG_SK) {
    log.error(requestId, '即梦API未配置');
    return { code: -1, msg: 'AI绘图服务暂未开启' };
  }

  try {
    const mode = imageFileID ? 'img2img' : 'text2img';
    log.info(requestId, mode === 'img2img' ? '开始图生图' : '开始文生图');

    // 图生图：获取原图临时链接
    let imageUrl = null;
    if (imageFileID) {
      const tempRes = await cloud.getTempFileURL({ fileList: [imageFileID] });
      imageUrl = tempRes.fileList[0]?.tempFileURL;
      if (!imageUrl) return { code: -1, msg: '参考图获取失败' };
    }

    // Skill Enhancer: 路由 → 增强 → 生成
    const { finalPrompt, contentSkillName } = await buildFinalPrompt(prompt, styleId, mode, requestId);
    log.info(requestId, `最终提示词 [skill=${contentSkillName || 'NONE'}]:`, finalPrompt.slice(0, 80));

    const dim = resolveDimensions(imageRatio);
    const body = {
      req_key: 'jimeng_t2i_v40',
      prompt: finalPrompt,
      width: dim.width,
      height: dim.height,
      force_single: true,
      return_url: true, // 让即梦返回图片URL，不返回 base64（避免响应体过大）
    };
    if (imageUrl) body.image_urls = [imageUrl];

    const submitReq = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
    const submitUrl = `${JIMENG_BASE_URL}/?${submitReq.queryStr}`;
    const response = await postJimengWithBackoff(submitUrl, body, submitReq.headers, requestId, 'submit');

    const submitData = response.data || {};

    // 火山引擎签名/网关层错误（鉴权、签名等）
    if (submitData.ResponseMetadata?.Error) {
      const err = submitData.ResponseMetadata.Error;
      log.error(requestId, '即梦提交失败(网关):', err.Code, err.Message);
      return { code: -1, msg: `提交任务失败: ${err.Message || err.Code || '网关错误'}` };
    }
    // 即梦 API 业务层错误（10000 = 成功；其他都是错误）
    if (typeof submitData.code === 'number' && submitData.code !== 10000) {
      log.error(requestId, '即梦提交失败(业务):', submitData.code, submitData.message);
      const userMsg = submitData.message && submitData.message.length < 80
        ? `提交任务失败: ${submitData.message}`
        : '提交任务失败，请检查描述或参考图';
      return { code: -1, msg: userMsg };
    }
    const taskId = submitData?.Data?.task_id
      || submitData?.Data?.taskId
      || submitData?.Data?.TaskId
      || submitData?.data?.task_id
      || submitData?.data?.taskId
      || submitData?.data?.TaskId
      || submitData?.Result?.task_id
      || submitData?.Result?.taskId
      || submitData?.Result?.TaskId
      || submitData?.task_id
      || submitData?.taskId
      || submitData?.TaskId;

    if (!taskId) {
      log.error(requestId, '提交响应未返回taskId', {
        topLevelKeys: Object.keys(submitData || {}),
        dataKeys: Object.keys(submitData?.Data || submitData?.data || submitData?.Result || {}),
        response: JSON.stringify(submitData || {}).slice(0, 1200),
      });
      return { code: -1, msg: '未获取到任务ID' };
    }
    log.info(requestId, '任务已提交:', taskId);

    // 轮询等待结果
    const result = await pollTaskResult(taskId, body, requestId, mode === 'img2img' ? 'i2i' : 't2i', imageFileID);
    if (result.code !== 0) return result;

    // 上传到云存储：URL → 下载后上传；base64 → 解码后直接上传
    let fileID;
    if (result.imageUrl) {
      fileID = await downloadAndUpload(result.imageUrl, requestId);
    } else if (result.imageBase64) {
      fileID = await uploadBase64ToCloud(result.imageBase64, requestId);
    } else {
      return { code: -1, msg: '未获取到生成结果' };
    }

    // 更新用量（上传成功后才计数）
    await usage.incrementUsage(openid);

    log.info(requestId, '生成完成:', fileID);

    return { code: 0, data: { fileID, url: result.imageUrl || '', enhancedPrompt: finalPrompt, skillName: contentSkillName } };
  } catch (e) {
    const status = e?.response?.status;
    const respData = e?.response?.data;
    const upstreamErr = respData?.ResponseMetadata?.Error || {};
    log.error(requestId, '生成异常:', {
      message: e.message,
      status,
      upstreamCode: upstreamErr.Code,
      upstreamMessage: upstreamErr.Message,
      upstreamRequestId: respData?.ResponseMetadata?.RequestId,
      response: typeof respData === 'string' ? respData.slice(0, 400) : JSON.stringify(respData || {}).slice(0, 800),
    });
    return { code: -1, msg: formatError(e) };
  }
}

// ============ 即梦API - 文生图 ============
async function jimengGenerate(openid, prompt, styleId, imageRatio, requestId) {
  return _generateImage(openid, prompt, styleId, imageRatio, requestId, null);
}

// ============ 即梦API - 图生图 ============
async function jimengImg2Img(openid, prompt, styleId, imageFileID, imageRatio, requestId) {
  return _generateImage(openid, prompt, styleId, imageRatio, requestId, imageFileID);
}
// ============ 轮询任务结果 ============
// 即梦 v4.0 一张图通常需要 15~40 秒。轮询窗口必须覆盖此区间。
// 默认窗口：30 × 2.5s = 75 秒（云函数 timeout=180s，留足余量给提交退避/下载/上传）
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '2500', 10); // ms
const POLL_MAX_ATTEMPTS = parseInt(process.env.POLL_MAX_ATTEMPTS || '30', 10);
const POLL_RETRY_LIMIT = parseInt(process.env.POLL_RETRY_LIMIT || '1', 10);

async function pollTaskResult(taskId, submitBody, requestId, type, imageFileID) {
  let retryCount = 0;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    try {
      const body = {
        req_key: 'jimeng_t2i_v40',
        task_id: taskId,
      };
      const queryReq = getVolcengineHeaders(JIMENG_ACTION_QUERY, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
      const queryUrl = `${JIMENG_BASE_URL}/?${queryReq.queryStr}`;
      const response = await postJimengWithBackoff(queryUrl, body, queryReq.headers, requestId, 'query');

      const queryResp = response.data || {};

      // 即梦 API 业务层错误：code !== 10000（如内容审核拒绝、任务不存在等）
      if (typeof queryResp.code === 'number' && queryResp.code !== 10000) {
        log.error(requestId, '即梦查询失败(业务):', queryResp.code, queryResp.message);
        const userMsg = queryResp.message && queryResp.message.length < 80
          ? `生成失败: ${queryResp.message}`
          : '生成失败，可能触发内容审核，请调整描述';
        return { code: -1, msg: userMsg };
      }

      const respData = queryResp?.Data || queryResp?.data || queryResp?.Result || queryResp?.result || {};
      const statusRaw = respData?.status || respData?.task_status || respData?.state || '';
      const status = String(statusRaw).toLowerCase();

      if (status === 'failed' || status === 'error' || status === 'not_found' || status === 'expired') {
        const failReason = respData?.reason || respData?.fail_reason || respData?.message || '';
        if (retryCount < POLL_RETRY_LIMIT) {
          retryCount++;
          log.warn(requestId, `任务失败(${failReason})，重新提交第${retryCount}次`);
          try {
            // 图生图：重新获取临时链接（旧链接可能过期）
            let resubmitBody = submitBody;
            if (type === 'i2i' && imageFileID) {
              const freshUrl = await cloud.getTempFileURL({ fileList: [imageFileID] });
              const freshImageUrl = freshUrl.fileList[0]?.tempFileURL;
              if (freshImageUrl) {
                resubmitBody = { ...submitBody, image_urls: [freshImageUrl] };
              } else {
                log.warn(requestId, '重新获取临时链接失败，使用旧链接');
              }
            }
            const resubmitReq = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, resubmitBody, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
            const resubmitUrl = `${JIMENG_BASE_URL}/?${resubmitReq.queryStr}`;
            const resubmit = await postJimengWithBackoff(resubmitUrl, resubmitBody, resubmitReq.headers, requestId, 'resubmit');
            const resubmitData = resubmit.data || {};
            // 复用提交时的 taskId 解析路径
            const newTaskId = resubmitData?.data?.task_id
              || resubmitData?.Data?.task_id
              || resubmitData?.Result?.task_id
              || resubmitData?.task_id;
            if (newTaskId) {
              taskId = newTaskId;
              log.info(requestId, `重新提交成功: ${newTaskId}`);
            } else {
              log.warn(requestId, '重新提交未返回taskId，跳过本轮');
            }
          } catch (re) {
            log.warn(requestId, '重新提交失败:', re.message);
          }
          continue;
        }
        return { code: -1, msg: failReason ? `生成失败: ${failReason}` : '生成失败，请调整描述后重试' };
      }

      if (status === 'finished' || status === 'succeeded' || status === 'success' || status === 'done') {
        // 优先解析 URL
        const urlCandidates = []
          .concat(Array.isArray(respData?.image_urls) ? respData.image_urls : [])
          .concat(Array.isArray(respData?.images) ? respData.images : [])
          .concat(Array.isArray(respData?.image_list) ? respData.image_list : [])
          .concat(Array.isArray(respData?.result) ? respData.result : [])
          .filter(Boolean);

        let imageUrl = null;
        for (const it of urlCandidates) {
          if (typeof it === 'string' && /^https?:\/\//.test(it)) { imageUrl = it; break; }
          if (it && typeof it === 'object') {
            const u = it.image_url || it.url;
            if (typeof u === 'string' && /^https?:\/\//.test(u)) { imageUrl = u; break; }
          }
        }
        if (!imageUrl) {
          if (typeof respData?.image_url === 'string') imageUrl = respData.image_url;
          else if (typeof respData?.url === 'string') imageUrl = respData.url;
        }
        if (imageUrl) return { code: 0, imageUrl };

        // 回落：base64 数据（即梦 v4.0 默认返回 binary_data_base64）
        const b64Arr = Array.isArray(respData?.binary_data_base64) ? respData.binary_data_base64 : null;
        const b64 = (b64Arr && b64Arr[0])
          || respData?.binary_data
          || respData?.image_base64
          || null;
        if (b64 && typeof b64 === 'string' && b64.length > 100) {
          return { code: 0, imageBase64: b64 };
        }

        log.error(requestId, '任务完成但未解析到图片URL或base64', {
          topLevelKeys: Object.keys(queryResp || {}),
          dataKeys: Object.keys(respData || {}),
          response: JSON.stringify(queryResp || {}).slice(0, 1200),
        });
        return { code: -1, msg: '未获取到生成结果' };
      }

      log.info(requestId, `轮询 ${attempt + 1}/${POLL_MAX_ATTEMPTS}, 状态:`, status || statusRaw || 'unknown');
    } catch (e) {
      log.warn(requestId, '轮询异常:', e.message);
    }
  }

  // 注意：避免使用「超时」二字，否则客户端 errorHandler 会把它识别为 TIMEOUT 类型自动重试
  return { code: -1, msg: 'AI 渲染时间较长，请稍后在「我的作品」查看，或重新生成' };
}


// ============ 上传 base64 图片到云存储 ============
function detectImageMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  // GIF: 'GIF8'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif';
  // WEBP: 'RIFF'....'WEBP'
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
  return null;
}

async function uploadBase64ToCloud(b64, requestId) {
  try {
    // 去掉 data URI 前缀（若有）
    const cleaned = b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const buffer = Buffer.from(cleaned, 'base64');

    if (buffer.length === 0) throw new Error('base64 解码后为空');
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`文件过大: ${buffer.length} 字节，超过限制 ${MAX_IMAGE_SIZE} 字节`);
    }

    const mime = detectImageMimeFromBuffer(buffer) || 'image/png';
    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = extMap[mime] || 'png';
    const fileName = `${requestId}_${Date.now()}.${ext}`;

    const uploadRes = await cloud.uploadFile({
      cloudPath: `ai-results/${fileName}`,
      fileContent: buffer,
    });

    return uploadRes.fileID;
  } catch (e) {
    log.error(requestId, 'base64上传失败:', e.message);
    throw new Error('图片上传失败');
  }
}

// ============ 下载并上传到云存储 ============
async function downloadAndUpload(imageUrl, requestId) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: AXIOS_TIMEOUT,
      maxContentLength: MAX_IMAGE_SIZE,
      maxBodyLength: MAX_IMAGE_SIZE,
    });

    // 校验内容类型
    const contentType = response.headers['content-type'] || '';
    const baseType = contentType.split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.includes(baseType)) {
      log.error(requestId, '非法内容类型:', baseType);
      throw new Error(`不支持的文件类型: ${baseType}`);
    }

    // 校验文件大小（兜底）
    const buffer = Buffer.from(response.data);
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`文件过大: ${buffer.length} 字节，超过限制 ${MAX_IMAGE_SIZE} 字节`);
    }

    const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = extMap[baseType] || 'png';
    const fileName = `${requestId}_${Date.now()}.${ext}`;

    const uploadRes = await cloud.uploadFile({
      cloudPath: `ai-results/${fileName}`,
      fileContent: buffer,
    });

    return uploadRes.fileID;
  } catch (e) {
    log.error(requestId, '上传失败:', e.message);
    throw new Error('图片上传失败');
  }
}

function randomNonceStr() {
  return Math.random().toString(36).slice(2, 18);
}

function toFen(yuan) {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function buildWeChatMd5Sign(params, apiKey) {
  const keys = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort();
  const stringA = keys.map(k => `${k}=${params[k]}`).join('&');
  const signTemp = `${stringA}&key=${apiKey}`;
  return crypto.createHash('md5').update(signTemp, 'utf8').digest('hex').toUpperCase();
}

function objectToXml(obj) {
  const body = Object.keys(obj)
    .map(k => `<${k}><![CDATA[${String(obj[k])}]]></${k}>`)
    .join('');
  return `<xml>${body}</xml>`;
}

function parseXmlToJson(xml) {
  const result = {};
  if (!xml || typeof xml !== 'string') return result;
  const cleaned = xml.replace(/<\?xml[^>]*\?>/i, '').trim();
  const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/\1>/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    const key = match[1];
    const cdataValue = match[2];
    const plainValue = match[3];
    const value = (cdataValue !== undefined ? cdataValue : plainValue || '').trim();
    result[key] = value;
  }
  return result;
}

function buildClientPaySign({ timeStamp, nonceStr, pkg }) {
  const signParams = {
    appId: WECHAT_APPID,
    timeStamp,
    nonceStr,
    package: pkg,
    signType: 'MD5',
  };
  return buildWeChatMd5Sign(signParams, WECHAT_PAY_KEY);
}

function getClientIp(event) {
  return event?.clientIP || event?.clientIp || event?.ip || '127.0.0.1';
}

// ============ 会员支付 ============
async function createOrder(openid, plan, requestId, event = {}) {
  if (!PAY_NOTIFY_URL && !IS_TEST_MODE) {
    return { code: -1, msg: '支付服务暂不可用' };
  }

  const planInfo = VIP_PRICES[plan];
  if (!planInfo) return { code: -1, msg: '不支持的套餐' };

  // 演示模式已关闭，强制走真实支付流程
  if (IS_TEST_MODE) {
    log.warn(requestId, '演示模式已禁用，拒绝测试模式请求');
    return { code: -1, msg: '支付服务暂不可用' };
  }

  if (!WECHAT_APPID || !WECHAT_MCH_ID || !WECHAT_PAY_KEY || !PAY_NOTIFY_URL) {
    log.error(requestId, '支付参数未配置完整');
    return { code: -1, msg: '支付配置不完整' };
  }

  const totalFee = toFen(planInfo.price);
  if (!totalFee || totalFee < 1) {
    return { code: -1, msg: '订单金额异常' };
  }

  const outTradeNo = `vip${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const nonceStr = randomNonceStr();
  const spbillCreateIp = getClientIp(event);

  const unifiedOrderParams = {
    appid: WECHAT_APPID,
    mch_id: WECHAT_MCH_ID,
    nonce_str: nonceStr,
    body: `${planInfo.name}-微秒相机会员`,
    out_trade_no: outTradeNo,
    total_fee: totalFee,
    spbill_create_ip: spbillCreateIp,
    notify_url: PAY_NOTIFY_URL,
    trade_type: 'JSAPI',
    openid,
    sign_type: 'MD5',
  };

  unifiedOrderParams.sign = buildWeChatMd5Sign(unifiedOrderParams, WECHAT_PAY_KEY);

  try {
    const reqXml = objectToXml(unifiedOrderParams);
    const payRes = await axios.post(WECHAT_UNIFIED_ORDER_URL, reqXml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: AXIOS_TIMEOUT,
      responseType: 'text',
      transformResponse: [data => data],
    });

    const parsed = parseXmlToJson(payRes.data || '');

    if (parsed.return_code !== 'SUCCESS') {
      log.error(requestId, '统一下单失败(return_code)', { return_msg: parsed.return_msg });
      return { code: -1, msg: parsed.return_msg || '统一下单失败' };
    }
    if (parsed.result_code !== 'SUCCESS') {
      log.error(requestId, '统一下单失败(result_code)', { err_code: parsed.err_code, err_code_des: parsed.err_code_des });
      return { code: -1, msg: parsed.err_code_des || '统一下单失败' };
    }

    const prepayId = parsed.prepay_id;
    if (!prepayId) {
      return { code: -1, msg: '未获取到预支付ID' };
    }

    const nowSec = String(Math.floor(Date.now() / 1000));
    const clientNonce = randomNonceStr();
    const pkg = `prepay_id=${prepayId}`;
    const paySign = buildClientPaySign({ timeStamp: nowSec, nonceStr: clientNonce, pkg });

    await safeAdd('orders', {
      openid,
      plan,
      planName: planInfo.name,
      price: planInfo.price,
      priceFen: totalFee,
      outTradeNo,
      prepayId,
      status: 'pending',
      requestId,
      notifyUrl: PAY_NOTIFY_URL,
      createTime: Date.now(),
      updateTime: Date.now(),
    });

    return {
      code: 0,
      data: {
        timeStamp: nowSec,
        nonceStr: clientNonce,
        package: pkg,
        signType: 'MD5',
        paySign,
        outTradeNo,
      },
    };
  } catch (e) {
    log.error(requestId, 'createOrder异常', e.message);
    return { code: -1, msg: formatError(e) };
  }
}

// ============ 错误处理 ============
function formatError(e) {
  const msg = e.message || '';
  const status = e?.response?.status;

  // 先判断 HTTP 状态码，避免把 4xx 误报成“网络连接失败”
  if (status === 400) {
    const upstreamMsg = e?.response?.data?.ResponseMetadata?.Error?.Message;
    if (upstreamMsg) return `请求参数错误：${upstreamMsg}`;
    return '请求参数错误（请检查图生图参考图或提示词）';
  }
  if (status === 401 || status === 403) return 'API认证失败，请检查配置';
  if (status === 404) return '服务地址不可用，请检查接口配置';
  if (status === 408 || status === 504) return '请求超时，请重试';
  if (status === 429) {
    // 即梦并发上限：50430
    const apiCode = e?.response?.data?.code;
    if (apiCode === 50430) return 'AI 绘图服务繁忙，请稍候 30 秒再试';
    return '请求过于频繁，请稍后重试';
  }
  if (status >= 500) return '上游服务暂时不可用，请稍后重试';

  // 再判断网络层错误
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('socket hang up')) {
    return '网络连接失败';
  }
  if (msg.includes('timeout') || msg.includes('超时')) return '请求超时，请重试';
  if (msg.includes('401') || msg.includes('认证')) return 'API认证失败，请检查配置';
  if (msg.includes('429') || msg.includes('限额') || msg.includes('rate limit')) return '请求过于频繁，请稍后重试';

  return '服务暂时不可用，请稍后重试';
}

// ============================================================
// 内容安全审核（微信 security.msgSecCheck v2）
// ============================================================
async function msgSecCheck(content, openid, requestId) {
  if (!content || !content.trim()) return { pass: true };
  try {
    const res = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 1, // 1: 资料 2: 评论 3: 论坛 4: 社交日志（用 1 通用）
      content: String(content).slice(0, 5000),
      openid,
    });
    if (res && res.errCode === 0) {
      // result.suggest: pass / review / risky
      const suggest = (res.result && res.result.suggest) || 'pass';
      if (suggest === 'pass') return { pass: true };
      log.warn(requestId, '内容安全审核未通过', { suggest, label: res.result && res.result.label });
      return { pass: false, msg: '内容含违规信息，请修改后重试' };
    }
    log.warn(requestId, '内容安全接口返回异常', res);
    // 接口异常时为不阻塞用户体验，默认放行（线上可改为拦截）
    return { pass: true };
  } catch (e) {
    log.error(requestId, 'msgSecCheck 异常:', e.message);
    // 接口报错时放行（保证服务可用），但应在监控里告警
    return { pass: true };
  }
}

// ============================================================
// AI 海报文案生成（基于 DeepSeek 短文本润色）
// ============================================================
async function generatePosterCaption(event, openid, requestId) {
  const keyword = String(event.keyword || '').trim().slice(0, 20);
  const name = String(event.name || '').trim().slice(0, 12);
  if (!keyword) return { code: -1, msg: '请提供关键词' };

  // 内容安全过滤
  const sec = await msgSecCheck(`${name} ${keyword}`, openid, requestId);
  if (!sec.pass) return { code: -1, msg: sec.msg };

  if (!DEEPSEEK_API_KEY || !DEEPSEEK_MODEL) {
    return { code: 0, caption: `热爱${keyword}的小朋友，让${keyword}成为成长里最亮的一束光。` };
  }

  const prompt = `你是一位儿童教育文案作者。为一名小朋友写一句童趣文案，要求：
- 不超过 30 个汉字
- 体现 "${keyword}" 这个特点
- 温暖、积极、有画面感
- 只输出文案本身，不加引号、不加解释`;

  try {
    const axios = require('axios');
    const r = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 80,
      },
      { headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const caption = (r.data?.choices?.[0]?.message?.content || '').trim()
      .replace(/^["「『]|["」』]$/g, '')
      .slice(0, 40);
    if (!caption) throw new Error('empty caption');

    // 出参也过一次审核
    const sec2 = await msgSecCheck(caption, openid, requestId);
    if (!sec2.pass) return { code: 0, caption: `热爱${keyword}的小朋友，让${keyword}成为成长里最亮的一束光。` };

    return { code: 0, caption };
  } catch (e) {
    log.warn(requestId, 'generatePosterCaption 失败，降级:', e.message);
    return { code: 0, caption: `热爱${keyword}的小朋友，让${keyword}成为成长里最亮的一束光。` };
  }
}
