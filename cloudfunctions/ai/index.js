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
  const auth = getVolcengineAuth('POST', '/', queryStr, headers, bodyStr, ak, sk, service, region, now);
  headers['Authorization'] = auth;

  return headers;
}

// ============ 请求ID生成 ============
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        return await jimengGenerate(openid, event.prompt, event.styleId || '', event.imageRatio || 1, requestId);

      case 'img2img': // 图生图
        log.info(requestId, '图生图请求');
        if (event.prompt && event.prompt.length > MAX_PROMPT_LENGTH) return { code: -1, msg: `描述不能超过${MAX_PROMPT_LENGTH}字` };
        return await jimengImg2Img(openid, event.prompt, event.styleId || '', event.imageFileID, event.imageRatio || 1, requestId);

      // ===== 用户用量 ==========
      case 'usage':
        return await usage.getUsage(openid);

      case 'createOrder':
        const planInfo = validatePlan(event.plan);
        if (!planInfo.valid) return { code: -1, msg: planInfo.msg };
        return await createOrder(openid, event.plan, requestId);

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

    const body = {
      model: 'jimeng-v4',
      prompt: finalPrompt,
      image_ratio: imageRatio,
    };
    if (imageUrl) body.image_url = imageUrl;

    const headers = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
    const response = await axios.post(`${JIMENG_BASE_URL}/`, { ...body, Action: JIMENG_ACTION_SUBMIT, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers, timeout: AXIOS_TIMEOUT });

    if (response.data.ResponseMetadata?.Error) {
      const err = response.data.ResponseMetadata.Error;
      log.error(requestId, '即梦提交失败:', err.Code, err.Message);
      return { code: -1, msg: '提交任务失败' };
    }

    const taskId = response.data?.Data?.task_id;
    if (!taskId) return { code: -1, msg: '未获取到任务ID' };
    log.info(requestId, '任务已提交:', taskId);

    // 轮询等待结果
    const result = await pollTaskResult(taskId, body, requestId, mode === 'img2img' ? 'i2i' : 't2i', imageFileID);
    if (result.code !== 0) return result;

    // 下载并上传到云存储
    const fileID = await downloadAndUpload(result.imageUrl, requestId);

    // 更新用量（下载上传成功后才计数）
    await usage.incrementUsage(openid);

    log.info(requestId, '生成完成:', fileID);

    return { code: 0, data: { fileID, url: result.imageUrl, enhancedPrompt: finalPrompt, skillName: contentSkillName } };
  } catch (e) {
    log.error(requestId, '生成异常:', e.message);
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
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10); // ms
const POLL_MAX_ATTEMPTS = parseInt(process.env.POLL_MAX_ATTEMPTS || '20', 10);
const POLL_RETRY_LIMIT = parseInt(process.env.POLL_RETRY_LIMIT || '2', 10);

async function pollTaskResult(taskId, submitBody, requestId, type, imageFileID) {
  let retryCount = 0;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    try {
      const body = { task_id: taskId };
      const headers = getVolcengineHeaders(JIMENG_ACTION_QUERY, body, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
      const response = await axios.post(`${JIMENG_BASE_URL}/`, { ...body, Action: JIMENG_ACTION_QUERY, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers, timeout: AXIOS_TIMEOUT });

      const respData = response.data?.Data;
      const status = respData?.status;

      if (status === 'failed') {
        if (retryCount < POLL_RETRY_LIMIT) {
          retryCount++;
          log.warn(requestId, `任务失败，重新提交第${retryCount}次`);
          try {
            // 图生图：重新获取临时链接（旧链接可能过期）
            let resubmitBody = submitBody;
            if (type === 'i2i' && imageFileID) {
              const freshUrl = await cloud.getTempFileURL({ fileList: [imageFileID] });
              const freshImageUrl = freshUrl.fileList[0]?.tempFileURL;
              if (freshImageUrl) {
                resubmitBody = { ...submitBody, image_url: freshImageUrl };
              } else {
                log.warn(requestId, '重新获取临时链接失败，使用旧链接');
              }
            }
            const submitHeaders = getVolcengineHeaders(JIMENG_ACTION_SUBMIT, resubmitBody, JIMENG_AK, JIMENG_SK, JIMENG_SERVICE, JIMENG_REGION);
            const resubmit = await axios.post(`${JIMENG_BASE_URL}/`, { ...resubmitBody, Action: JIMENG_ACTION_SUBMIT, Service: JIMENG_SERVICE, Region: JIMENG_REGION }, { headers: submitHeaders, timeout: AXIOS_TIMEOUT });
            const newTaskId = resubmit.data?.Data?.task_id;
            if (newTaskId) {
              taskId = newTaskId;
              retryCount = 0; // 新任务，重置计数
              log.info(requestId, `重新提交成功: ${newTaskId}`);
            } else {
              log.warn(requestId, '重新提交未返回taskId，跳过本轮');
            }
          } catch (re) {
            log.warn(requestId, '重新提交失败:', re.message);
          }
          continue;
        }
        return { code: -1, msg: '生成失败，请重试' };
      }

      if (status === 'finished') {
        const images = respData?.images;
        if (images && images.length > 0) {
          return { code: 0, imageUrl: images[0].image_url };
        }
        return { code: -1, msg: '未获取到生成结果' };
      }

      log.info(requestId, `轮询 ${attempt + 1}/${POLL_MAX_ATTEMPTS}, 状态:`, status);
    } catch (e) {
      log.warn(requestId, '轮询异常:', e.message);
    }
  }

  return { code: -1, msg: '生成超时，请重试' };
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

// ============ 会员支付 ============
async function createOrder(openid, plan, requestId) {
  if (!PAY_NOTIFY_URL && !IS_TEST_MODE) {
    return { code: -1, msg: '支付服务暂不可用' };
  }

  const planInfo = VIP_PRICES[plan];
  if (!planInfo) return { code: -1, msg: '不支持的套餐' };

  if (IS_TEST_MODE) {
    try {
      const result = await usage.renewMembership(openid, plan);
      log.info(requestId, '演示模式开通会员:', plan);
      return { code: 0, demo: true, msg: '演示模式，会员已开通', data: result };
    } catch (e) {
      return { code: -1, msg: '开通失败' };
    }
  }

  return { code: -1, msg: '支付功能待配置' };
}

// ============ 错误处理 ============
function formatError(e) {
  const msg = e.message || '';
  if (e.isAxiosError || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return '网络连接失败';
  if (msg.includes('401') || msg.includes('认证')) return 'API认证失败，请检查配置';
  if (msg.includes('429') || msg.includes('限额') || msg.includes('rate limit')) return '请求过于频繁，请稍后重试';
  if (msg.includes('timeout') || msg.includes('超时')) return '请求超时，请重试';
  return '服务暂时不可用，请稍后重试';
}
