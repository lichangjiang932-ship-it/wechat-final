const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const XPAY_OFFER_ID = process.env.XPAY_OFFER_ID || process.env.MIDAS_OFFER_ID || '';
const XPAY_APPKEY_PROD = process.env.XPAY_APPKEY_PROD || '';
const XPAY_APPKEY_SANDBOX = process.env.XPAY_APPKEY_SANDBOX || '';
const XPAY_APPKEY_FALLBACK = process.env.XPAY_APPKEY || process.env.MIDAS_APPKEY || '';
const VIRTUAL_NOTIFY_PATH = process.env.VIRTUAL_NOTIFY_PATH || '/mp/notify';

const PLAN_DAYS = { month: 30, year: 365 };

function getAppKeyByEnv(env) {
  if (String(env) === '1') return XPAY_APPKEY_SANDBOX || XPAY_APPKEY_FALLBACK;
  return XPAY_APPKEY_PROD || XPAY_APPKEY_FALLBACK;
}

function requestId() {
  return `vpay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function logInfo(rid, msg, data) { console.log(`[pay-notify-virtual][${rid}] ${msg}`, data || ''); }
function logWarn(rid, msg, data) { console.warn(`[pay-notify-virtual][${rid}] ${msg}`, data || ''); }
function logError(rid, msg, data) { console.error(`[pay-notify-virtual][${rid}] ${msg}`, data || ''); }

function hmacSha256Hex(message, key) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

function parseFormBody(body) {
  const out = {};
  if (!body || typeof body !== 'string') return out;
  body.split('&').forEach((pair) => {
    if (!pair) return;
    const eq = pair.indexOf('=');
    const k = eq < 0 ? pair : pair.slice(0, eq);
    const v = eq < 0 ? '' : pair.slice(eq + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch (_) {
      out[k] = v;
    }
  });
  return out;
}

function extractParams(event) {
  const headers = event.headers || {};
  const ct = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
  const query = event.queryStringParameters || event.queryString || {};
  const body = event.body;

  let parsedBody = {};
  if (ct.includes('application/json')) {
    try { parsedBody = body ? JSON.parse(body) : {}; } catch (_) { parsedBody = {}; }
  } else if (ct.includes('application/x-www-form-urlencoded')) {
    parsedBody = parseFormBody(body || '');
  } else if (typeof body === 'string' && body.startsWith('{')) {
    try { parsedBody = JSON.parse(body); } catch (_) { parsedBody = parseFormBody(body); }
  } else if (typeof body === 'string') {
    parsedBody = parseFormBody(body);
  } else if (body && typeof body === 'object') {
    parsedBody = body;
  }

  return { ...query, ...parsedBody };
}

function verifyMidasSig(params, appKey, path) {
  if (!appKey) return false;
  const sig = String(params.sig || params.signature || '').toLowerCase();
  if (!sig) return false;

  const payload = {};
  Object.keys(params).forEach((k) => {
    if (k === 'sig' || k === 'signature') return;
    const v = params[k];
    if (v === undefined || v === null || v === '') return;
    payload[k] = v;
  });

  const queryStr = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${payload[k]}`)
    .join('&');

  const material = path ? `${path}&${queryStr}` : queryStr;
  const expected = hmacSha256Hex(material, appKey);
  return expected === sig;
}

function ok() { return { errcode: 0, errmsg: 'OK' }; }
function fail(code, msg) { return { errcode: code, errmsg: msg }; }

async function getOrderByOutTradeNo(outTradeNo) {
  try {
    const r = await db.collection('virtual_orders').where({ outTradeNo }).limit(1).get();
    return r.data[0] || null;
  } catch (e) {
    if (e && e.errCode === -502005) return null; // 集合未创建
    throw e;
  }
}

async function getUser(openid) {
  try {
    const r = await db.collection('users').where({ openid }).limit(1).get();
    return r.data[0] || null;
  } catch (e) {
    if (e && e.errCode === -502005) return null; // 集合未创建
    throw e;
  }
}

// 集合不存在时自动建表后重试
async function safeAdd(collectionName, data) {
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

async function renewMembership(openid, plan) {
  const days = PLAN_DAYS[plan];
  if (!days) throw new Error('INVALID_PLAN');

  const user = await getUser(openid);
  const now = Date.now();
  const currentExpire = Number((user && user.vipExpireTime) || 0);
  const base = currentExpire > now ? currentExpire : now;
  const newExpire = base + days * 24 * 60 * 60 * 1000;

  if (user) {
    await db.collection('users').where({ openid }).update({
      data: { vipLevel: plan, vipExpireTime: newExpire, updateTime: now },
    });
  } else {
    await safeAdd('users', {
      openid,
      nickName: '',
      avatarUrl: '',
      phone: '',
      vipLevel: plan,
      vipExpireTime: newExpire,
      createTime: now,
      lastLoginTime: now,
      updateTime: now,
    });
  }

  return newExpire;
}

async function lockPendingOrder(outTradeNo, callbackRaw) {
  const now = Date.now();
  const r = await db.collection('virtual_orders')
    .where({ outTradeNo, status: 'pending' })
    .update({
      data: {
        status: 'processing',
        callbackRaw,
        processingAt: now,
        updateTime: now,
      },
    });
  return !!(r && r.stats && r.stats.updated > 0);
}

async function markOrderFailed(outTradeNo, reason, callbackRaw = null) {
  await db.collection('virtual_orders').where({ outTradeNo }).update({
    data: {
      status: 'failed',
      failReason: reason,
      callbackRaw,
      updateTime: Date.now(),
    },
  });
}

async function markOrderSuccess(outTradeNo, expireTime, params) {
  await db.collection('virtual_orders').where({ outTradeNo }).update({
    data: {
      status: 'success',
      billNo: params.billNo || params.bill_no || '',
      payTime: Date.now(),
      membershipExpireTime: expireTime,
      callbackRaw: params,
      updateTime: Date.now(),
    },
  });
}

// 兼容两种调用形态：
//  A) HTTP 推送（老路径）：event.body / event.headers / event.queryStringParameters
//  B) 云函数模式（消息推送 / 云调用）：event 直接是消息对象，比如
//     { MsgType:"event", Event:"xpay_goods_deliver_notify", OutTradeNo:"xvip...", ... }
//     验证请求时也是直接给 { signature, timestamp, nonce, echostr }
function isCloudCallPayload(event) {
  if (!event || typeof event !== 'object') return false;
  // HTTP 推送特有字段
  if (event.body !== undefined) return false;
  if (event.headers !== undefined) return false;
  if (event.httpMethod || event.requestPath || event.path) return false;
  // 云调用特有字段（任一命中即认为是云调用模式）
  if (event.MsgType || event.Event) return true;
  if (event.echostr && (event.signature || event.timestamp || event.nonce)) return true;
  if (event.OutTradeNo || event.PaymentOrderId) return true;
  return false;
}

// 消息推送首次配置时，微信会发一次带 echostr 的验证请求。
// 云函数模式下要把 echostr 字符串原样返回。
function tryHandleEchostr(event) {
  if (!event) return null;
  // 云函数模式：echostr 可能在顶层
  if (typeof event.echostr === 'string' && event.echostr) {
    return event.echostr;
  }
  // HTTP 模式：echostr 可能在 query string 里
  const qs = event.queryStringParameters || event.queryString || {};
  if (qs && typeof qs.echostr === 'string' && qs.echostr) {
    return qs.echostr;
  }
  return null;
}

async function processVirtualPayNotify(event) {
  const rid = requestId();
  const cloudCall = isCloudCallPayload(event);

  // 把原始 event 打到日志，便于第一次跑通时确认微信实际发的字段
  logInfo(rid, 'raw event received', {
    cloudCall,
    keys: Object.keys(event || {}),
    eventSample: cloudCall ? event : { hasBody: !!event.body, hasHeaders: !!event.headers },
  });

  // 云调用模式：event 直接就是消息对象，字段大写驼峰（OutTradeNo / PaymentOrderId / Status 等）
  // HTTP 模式：通过 extractParams 解析 body / query
  const params = cloudCall ? event : extractParams(event);

  // 字段抽取：兼容大小写、下划线、驼峰多种命名
  const outTradeNo =
    params.OutTradeNo || params.outTradeNo || params.out_trade_no ||
    params.bill_no || params.BillNo;
  const offerId =
    params.OfferId || params.offerId || params.offer_id;
  const payStateRaw =
    params.Status || params.payState || params.pay_state || params.status;
  const callbackAmt = Number(
    params.PayAmt || params.payAmt || params.pay_amount ||
    params.totalFee || params.total_fee || params.GoodsPrice || params.goodsPrice
  );

  logInfo(rid, 'parsed callback fields', {
    cloudCall,
    outTradeNo,
    offerId,
    payState: payStateRaw,
    paramKeys: Object.keys(params),
  });

  if (!outTradeNo) {
    logError(rid, 'missing outTradeNo', { paramKeys: Object.keys(params) });
    return cloudCall ? { errcode: -1, errmsg: 'MISSING_TRADE_NO' } : fail(-1, 'MISSING_TRADE_NO');
  }

  const order = await getOrderByOutTradeNo(outTradeNo);
  if (!order) {
    logError(rid, 'order not found', { outTradeNo });
    return cloudCall ? { errcode: -1, errmsg: 'ORDER_NOT_FOUND' } : fail(-1, 'ORDER_NOT_FOUND');
  }

  if (order.status === 'success') {
    logInfo(rid, 'duplicate callback, already success', { outTradeNo });
    return ok();
  }

  const appKey = getAppKeyByEnv(order.env);
  if (!appKey) {
    logError(rid, 'missing appkey for order env', { outTradeNo, env: order.env });
    return fail(-1, 'CONFIG_ERROR');
  }

  // 云调用模式下，能进到这个云函数说明就是微信平台调的（mp 后台绑定了云函数才能这样调）
  // 因此跳过 HMAC 验签；HTTP 模式仍然按老逻辑验签。
  if (!cloudCall) {
    const path = event.requestPath || event.path || VIRTUAL_NOTIFY_PATH;
    const sigOk = verifyMidasSig(params, appKey, path) || verifyMidasSig(params, appKey, '');
    if (!sigOk) {
      logError(rid, 'signature verify failed', { outTradeNo, path, env: order.env });
      return fail(-1, 'SIGN_ERROR');
    }
  }

  if (XPAY_OFFER_ID && offerId && String(offerId) !== String(XPAY_OFFER_ID)) {
    logError(rid, 'offerId mismatch', { expected: XPAY_OFFER_ID, actual: offerId, outTradeNo });
    return cloudCall ? { errcode: -1, errmsg: 'OFFER_MISMATCH' } : fail(-1, 'OFFER_MISMATCH');
  }

  // 状态判断：常见取值有 0 / 'success' / 'PAYED' / 'PAID' 等等
  const payStateStr = payStateRaw === undefined || payStateRaw === null ? '' : String(payStateRaw);
  const isSuccess =
    payStateStr === '' ||                  // 没传也按成功处理（云调用某些发货通知不带 status）
    payStateStr === '0' ||
    /^(success|payed|paid|delivered|ok)$/i.test(payStateStr);
  if (!isSuccess) {
    await markOrderFailed(outTradeNo, `PAY_STATE_${payStateStr}`, params);
    logWarn(rid, 'pay state not success', { outTradeNo, payState: payStateStr });
    return ok();
  }

  if (Number.isFinite(callbackAmt) && Number(order.priceFen || 0) > 0 && callbackAmt !== Number(order.priceFen)) {
    logError(rid, 'amount mismatch', { outTradeNo, callbackAmt, orderAmount: order.priceFen });
    await markOrderFailed(outTradeNo, 'AMOUNT_MISMATCH', params);
    return cloudCall ? { errcode: -1, errmsg: 'AMOUNT_MISMATCH' } : fail(-1, 'AMOUNT_MISMATCH');
  }

  const payOpenid =
    order.openid ||
    params.OpenId || params.openid ||
    params.FromUserName;  // 云调用消息推送格式里付款人 openid 通常在 FromUserName
  if (!payOpenid) {
    logError(rid, 'missing openid', { outTradeNo });
    return cloudCall ? { errcode: -1, errmsg: 'MISSING_OPENID' } : fail(-1, 'MISSING_OPENID');
  }

  const locked = await lockPendingOrder(outTradeNo, params);
  if (!locked) {
    const latest = await getOrderByOutTradeNo(outTradeNo);
    if (latest && latest.status === 'success') {
      return ok();
    }
    logInfo(rid, 'order is not in pending state', { outTradeNo, status: latest && latest.status });
    return ok();
  }

  try {
    const expireTime = await renewMembership(payOpenid, order.plan);
    await markOrderSuccess(outTradeNo, expireTime, params);
    logInfo(rid, 'callback processed success', { outTradeNo, openid: payOpenid, plan: order.plan });
    return ok();
  } catch (e) {
    logError(rid, 'deliver membership failed', { outTradeNo, message: e.message });
    await markOrderFailed(outTradeNo, `DELIVER_FAIL_${e.message}`, params);
    return cloudCall ? { errcode: -1, errmsg: 'DELIVER_FAIL' } : fail(-1, 'DELIVER_FAIL');
  }
}

async function compensateVirtualOrders() {
  const rid = requestId();
  const now = Date.now();
  const processingTimeoutMs = 5 * 60 * 1000;
  const pendingMaxAgeMs = 24 * 60 * 60 * 1000;

  let resetToPending = 0;
  let markedFailed = 0;

  const processingRes = await db.collection('virtual_orders').where({ status: 'processing' }).limit(100).get();
  for (const order of processingRes.data || []) {
    const processingAt = Number(order.processingAt || order.updateTime || order.createTime || 0);
    if (!processingAt || now - processingAt < processingTimeoutMs) continue;

    await db.collection('virtual_orders').doc(order._id).update({
      data: {
        status: 'pending',
        retryCount: Number(order.retryCount || 0) + 1,
        updateTime: now,
      },
    });
    resetToPending += 1;
  }

  const pendingRes = await db.collection('virtual_orders').where({ status: 'pending' }).limit(100).get();
  for (const order of pendingRes.data || []) {
    const createTime = Number(order.createTime || 0);
    if (!createTime || now - createTime < pendingMaxAgeMs) continue;

    await db.collection('virtual_orders').doc(order._id).update({
      data: {
        status: 'failed',
        failReason: 'CALLBACK_TIMEOUT',
        updateTime: now,
      },
    });
    markedFailed += 1;
  }

  logInfo(rid, 'compensation finished', { resetToPending, markedFailed });
  return { code: 0, data: { resetToPending, markedFailed } };
}

exports.main = async (event = {}) => {
  // 1) 内部触发：定时补偿任务
  if (event.action === 'compensateVirtualOrders') {
    return compensateVirtualOrders();
  }

  // 2) 消息推送首次配置时，微信会发一次 echostr 验证云函数能正常工作
  //    云函数模式下原样返回 echostr 字符串即可（一定要是字符串，不要包对象）
  const echostr = tryHandleEchostr(event);
  if (echostr) {
    const rid = requestId();
    logInfo(rid, 'echostr verification request', { echostr: echostr.slice(0, 16) + '...' });
    return echostr;
  }

  // 3) 正常发货通知
  try {
    return await processVirtualPayNotify(event);
  } catch (e) {
    const rid = requestId();
    logError(rid, 'unexpected error', { message: e.message, stack: e.stack, eventKeys: Object.keys(event || {}) });
    return fail(-1, 'SYSTEM_ERROR');
  }
};
