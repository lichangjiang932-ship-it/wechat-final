// cloudfunctions/pay-notify/index.js - 微信支付回调
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const usage = require('../ai/usage');

function generateRequestId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function log(level, requestId, message, data = null) {
  if (level === 'error') {
    console.error(`[pay-notify][${requestId}]`, message, data || '');
  } else {
    console.log(`[pay-notify][${requestId}]`, message, data || '');
  }
}

exports.main = async (event, context) => {
  const requestId = generateRequestId();

  log('info', requestId, '收到支付回调', { hasBody: !!event.body });

  try {
    const { body } = event;
    let parsed;

    if (typeof body === 'string') {
      parsed = parseXmlToJson(body);
    } else if (typeof body === 'object' && body) {
      parsed = body;
    } else {
      log('error', requestId, '无法解析回调数据', { bodyType: typeof body });
      return { return_code: 'FAIL', return_msg: 'INVALID_DATA' };
    }

    const {
      return_code,
      out_trade_no,
      transaction_id,
      openid,
      total_fee,
      result_code,
    } = parsed;

    log('info', requestId, '解析回调数据', {
      return_code,
      result_code,
      out_trade_no,
      transaction_id: transaction_id ? `${transaction_id.slice(0, 8)}...` : null,
      total_fee,
      openid: openid ? `${openid.slice(0, 8)}...` : null,
    });

    if (!out_trade_no) {
      log('error', requestId, '缺少订单号');
      return { return_code: 'FAIL', return_msg: 'MISSING_TRADE_NO' };
    }

    const orderRes = await db.collection('orders').where({ outTradeNo: out_trade_no }).get();
    if (orderRes.data.length === 0) {
      log('error', requestId, '订单不存在', { out_trade_no });
      return { return_code: 'FAIL', return_msg: 'ORDER_NOT_FOUND' };
    }

    const order = orderRes.data[0];

    if (order.status === 'success') {
      log('info', requestId, '订单已处理，跳过', { out_trade_no });
      return { return_code: 'SUCCESS', return_msg: 'OK' };
    }

    if (result_code !== 'SUCCESS' && return_code !== 'SUCCESS') {
      log('error', requestId, '支付失败', { result_code, return_code });
      await db.collection('orders').where({ outTradeNo: out_trade_no }).update({
        data: {
          status: 'failed',
          failReason: `${result_code || ''} - ${return_code || ''}`,
          updateTime: Date.now(),
        },
      });

      return { return_code: 'SUCCESS', return_msg: 'OK' };
    }

    if (total_fee && order.price !== parseInt(total_fee, 10)) {
      log('error', requestId, '金额不匹配', {
        expected: order.price,
        actual: total_fee,
      });
      return { return_code: 'FAIL', return_msg: 'AMOUNT_MISMATCH' };
    }

    if (openid && order.openid && openid !== order.openid) {
      log('error', requestId, '订单用户不匹配', {
        expected: order.openid,
        actual: openid,
      });
      return { return_code: 'FAIL', return_msg: 'OPENID_MISMATCH' };
    }

    log('info', requestId, '开始激活会员', { openid, plan: order.plan });
    const activateResult = await usage.renewMembership(openid, order.plan);

    if (!activateResult.success) {
      log('error', requestId, '会员激活失败', activateResult);
      return { return_code: 'FAIL', return_msg: activateResult.reason || 'ACTIVATE_FAILED' };
    }

    await db.collection('orders').where({ outTradeNo: out_trade_no }).update({
      data: {
        status: 'success',
        transactionId: transaction_id,
        payTime: Date.now(),
        updateTime: Date.now(),
      },
    });

    log('info', requestId, '支付流程完成', { out_trade_no });
    return { return_code: 'SUCCESS', return_msg: 'OK' };
  } catch (e) {
    log('error', requestId, '支付回调处理异常', { error: e.message, stack: e.stack });
    return { return_code: 'FAIL', return_msg: 'SYSTEM_ERROR' };
  }
};

function parseXmlToJson(xml) {
  const result = {};
  xml = xml.replace(/<\?xml[^>]*\?>/, '').trim();

  const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    const key = match[1];
    let value = match[2].trim();
    if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    result[key] = value;
  }

  return result;
}
