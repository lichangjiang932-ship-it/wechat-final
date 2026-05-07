// cloudfunctions/pay-notify/index.js - 微信支付回调（含验签 + 幂等 + 会员开通）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const WECHAT_PAY_KEY = process.env.WECHAT_PAY_KEY || '';
const WECHAT_APPID = process.env.WECHAT_APPID || '';
const WECHAT_MCH_ID = process.env.WECHAT_MCH_ID || '';

const PLAN_DAYS = {
  month: 30,
  year: 365,
};

function generateRequestId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function logInfo(requestId, message, data) {
  console.log(`[pay-notify][${requestId}] ${message}`, data || '');
}

function logError(requestId, message, data) {
  console.error(`[pay-notify][${requestId}] ${message}`, data || '');
}

function xmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function responseXml(returnCode, returnMsg) {
  return `<xml><return_code><![CDATA[${xmlEscape(returnCode)}]]></return_code><return_msg><![CDATA[${xmlEscape(returnMsg)}]]></return_msg></xml>`;
}

function extractXmlBody(event) {
  if (!event) return '';
  if (typeof event === 'string') return event;
  if (typeof event.body === 'string') return event.body;
  if (typeof event.rawBody === 'string') return event.rawBody;
  return '';
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

function verifyWeChatPaySign(params, sign, apiKey) {
  if (!sign || !apiKey) return false;
  const keys = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .sort();

  const stringA = keys.map(k => `${k}=${params[k]}`).join('&');
  const signTemp = `${stringA}&key=${apiKey}`;
  const localSign = crypto.createHash('md5').update(signTemp, 'utf8').digest('hex').toUpperCase();
  return localSign === String(sign).toUpperCase();
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function isAmountMatch(order, callbackTotalFeeFen) {
  const actual = normalizeMoney(callbackTotalFeeFen);
  if (actual === null) return true; // 回调无金额时不拦截

  const candidates = [
    order.totalFee,
    order.total_fee,
    order.amountFen,
    order.priceFen,
    order.amount,
    order.price,
  ]
    .map(v => normalizeMoney(v))
    .filter(v => v !== null);

  // 兼容“元”字段
  if (normalizeMoney(order.price) !== null) {
    candidates.push(Math.round(Number(order.price) * 100));
  }
  if (normalizeMoney(order.amount) !== null) {
    candidates.push(Math.round(Number(order.amount) * 100));
  }

  if (candidates.length === 0) return true;
  return candidates.includes(actual);
}

async function getUser(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}

function getVipExpireTime(user) {
  if (!user) return 0;
  const expireTime = Number(user.vipExpireTime || 0);
  return Number.isFinite(expireTime) ? expireTime : 0;
}

async function renewMembership(openid, plan) {
  const days = PLAN_DAYS[plan];
  if (!days) throw new Error('INVALID_PLAN');

  const user = await getUser(openid);
  const now = Date.now();
  const currentExpire = getVipExpireTime(user);
  const baseTime = currentExpire > now ? currentExpire : now;
  const newExpire = baseTime + days * 24 * 60 * 60 * 1000;

  if (user) {
    await db.collection('users').where({ openid }).update({
      data: {
        vipLevel: plan,
        vipExpireTime: newExpire,
        updateTime: now,
      },
    });
  } else {
    await db.collection('users').add({
      data: {
        openid,
        nickName: '',
        avatarUrl: '',
        avatarEmoji: '',
        phone: '',
        vipLevel: plan,
        vipExpireTime: newExpire,
        createTime: now,
        lastLoginTime: now,
        updateTime: now,
      },
    });
  }

  return { success: true, membershipExpire: newExpire };
}

async function getOrderByOutTradeNo(outTradeNo) {
  const orderRes = await db.collection('orders').where({ outTradeNo }).limit(1).get();
  return orderRes.data[0] || null;
}

exports.main = async (event) => {
  const requestId = generateRequestId();

  try {
    if (!WECHAT_PAY_KEY) {
      logError(requestId, '缺少 WECHAT_PAY_KEY 环境变量');
      return responseXml('FAIL', 'CONFIG_ERROR');
    }

    const bodyXml = extractXmlBody(event);
    const parsed = bodyXml ? parseXmlToJson(bodyXml) : (event && typeof event.body === 'object' ? event.body : {});

    logInfo(requestId, '收到支付回调', {
      hasXml: !!bodyXml,
      out_trade_no: parsed.out_trade_no,
      result_code: parsed.result_code,
      return_code: parsed.return_code,
    });

    if (!parsed || Object.keys(parsed).length === 0) {
      return responseXml('FAIL', 'INVALID_DATA');
    }

    const sign = parsed.sign;
    if (!verifyWeChatPaySign(parsed, sign, WECHAT_PAY_KEY)) {
      logError(requestId, '回调验签失败', { out_trade_no: parsed.out_trade_no });
      return responseXml('FAIL', 'SIGN_ERROR');
    }

    if (WECHAT_APPID && parsed.appid && parsed.appid !== WECHAT_APPID) {
      logError(requestId, 'appid 不匹配', { expected: WECHAT_APPID, actual: parsed.appid });
      return responseXml('FAIL', 'APPID_MISMATCH');
    }

    if (WECHAT_MCH_ID && parsed.mch_id && parsed.mch_id !== WECHAT_MCH_ID) {
      logError(requestId, 'mch_id 不匹配', { expected: WECHAT_MCH_ID, actual: parsed.mch_id });
      return responseXml('FAIL', 'MCHID_MISMATCH');
    }

    const outTradeNo = parsed.out_trade_no;
    if (!outTradeNo) {
      return responseXml('FAIL', 'MISSING_TRADE_NO');
    }

    const order = await getOrderByOutTradeNo(outTradeNo);
    if (!order) {
      logError(requestId, '订单不存在', { outTradeNo });
      return responseXml('FAIL', 'ORDER_NOT_FOUND');
    }

    if (order.status === 'success') {
      logInfo(requestId, '重复回调，订单已成功', { outTradeNo });
      return responseXml('SUCCESS', 'OK');
    }

    const returnCode = parsed.return_code;
    const resultCode = parsed.result_code;
    if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
      await db.collection('orders').where({ outTradeNo }).update({
        data: {
          status: 'failed',
          failReason: `${returnCode || ''}/${resultCode || ''}`,
          callbackRaw: parsed,
          updateTime: Date.now(),
        },
      });
      logError(requestId, '支付失败', { outTradeNo, returnCode, resultCode });
      return responseXml('SUCCESS', 'OK');
    }

    if (!isAmountMatch(order, parsed.total_fee)) {
      logError(requestId, '金额不匹配', {
        outTradeNo,
        callbackTotalFee: parsed.total_fee,
        orderPrice: order.price,
        orderPriceFen: order.priceFen,
      });
      return responseXml('FAIL', 'AMOUNT_MISMATCH');
    }

    const payOpenid = order.openid || parsed.openid;
    if (!payOpenid) {
      logError(requestId, '缺少 openid', { outTradeNo });
      return responseXml('FAIL', 'MISSING_OPENID');
    }

    if (order.openid && parsed.openid && order.openid !== parsed.openid) {
      logError(requestId, 'openid 不匹配', { outTradeNo, orderOpenid: order.openid, callbackOpenid: parsed.openid });
      return responseXml('FAIL', 'OPENID_MISMATCH');
    }

    const plan = order.plan;
    if (!PLAN_DAYS[plan]) {
      logError(requestId, '订单套餐非法', { outTradeNo, plan });
      return responseXml('FAIL', 'PLAN_ERROR');
    }

    const renewRes = await renewMembership(payOpenid, plan);

    await db.collection('orders').where({ outTradeNo }).update({
      data: {
        status: 'success',
        transactionId: parsed.transaction_id || '',
        bankType: parsed.bank_type || '',
        callbackRaw: parsed,
        payTime: Date.now(),
        updateTime: Date.now(),
        membershipExpireTime: renewRes.membershipExpire,
      },
    });

    logInfo(requestId, '支付回调处理成功', { outTradeNo, plan, openid: payOpenid });
    return responseXml('SUCCESS', 'OK');
  } catch (e) {
    logError(requestId, '支付回调处理异常', { message: e.message, stack: e.stack });
    return responseXml('FAIL', 'SYSTEM_ERROR');
  }
};
