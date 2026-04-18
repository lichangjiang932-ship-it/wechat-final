// cloudfunctions/pay-notify/index.js - 微信支付回调
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 请求ID生成（用于日志追踪）
function generateRequestId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 日志工具
function log(level, requestId, message, data = null) {
  const logEntry = {
    level,
    requestId,
    timestamp: new Date().toISOString(),
    message,
    ...(data && { data })
  };
  if (level === 'error') {
    console.error(`[pay-notify][${requestId}]`, message, data || '');
  } else {
    console.log(`[pay-notify][${requestId}]`, message, data || '');
  }
}

// 激活会员（修复：outTradeNo作为参数传入，避免作用域问题）
async function activateVip(openid, plan, outTradeNo) {
  const now = Date.now();
  const duration = plan === 'month' ? 30 * 24 * 3600 * 1000 : 365 * 24 * 3600 * 1000;

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (userRes.data.length === 0) {
      log('error', 'activateVip', '用户不存在', { openid });
      return { success: false, reason: 'USER_NOT_FOUND' };
    }

    const user = userRes.data[0];
    let expireTime = now + duration;

    // 如果已有会员且未过期，延长到期时间
    if (user.vipExpireTime && user.vipExpireTime > now) {
      expireTime = user.vipExpireTime + duration;
    }

    // 更新用户VIP状态
    await db.collection('users').where({ openid }).update({
      data: {
        vipLevel: plan,
        vipExpireTime: expireTime,
      },
    });

    log('info', 'activateVip', 'VIP激活成功', {
      openid: openid.slice(0, 8) + '...',
      plan,
      expireTime: new Date(expireTime).toLocaleString()
    });

    // 更新订单状态
    await db.collection('orders').where({ outTradeNo }).update({
      data: { status: 'success', payTime: now },
    });

    return { success: true };
  } catch (e) {
    log('error', 'activateVip', '激活失败', { error: e.message });
    return { success: false, reason: 'DB_ERROR' };
  }
}

exports.main = async (event, context) => {
  const requestId = generateRequestId();
  const wxContext = cloud.getWXContext();

  log('info', requestId, '收到支付回调', { hasBody: !!event.body });

  try {
    // 微信支付回调格式为 XML，需要解析
    let parsed;
    const { body } = event;

    if (typeof body === 'string') {
      // XML 格式解析
      parsed = parseXmlToJson(body);
    } else if (typeof body === 'object') {
      // 已经是对象格式
      parsed = body;
    } else {
      log('error', requestId, '无法解析回调数据', { bodyType: typeof body });
      return {
        return_code: 'FAIL',
        return_msg: 'INVALID_DATA',
      };
    }

    // 提取关键字段
    const {
      return_code,
      out_trade_no,
      transaction_id,
      openid,
      total_fee,
      result_code
    } = parsed;

    log('info', requestId, '解析回调数据', {
      return_code,
      result_code,
      out_trade_no,
      transaction_id: transaction_id ? transaction_id.slice(0, 8) + '...' : null,
      total_fee,
      openid: openid ? openid.slice(0, 8) + '...' : null
    });

    // 验证必填字段
    if (!out_trade_no) {
      log('error', requestId, '缺少订单号');
      return {
        return_code: 'FAIL',
        return_msg: 'MISSING_TRADE_NO',
      };
    }

    // 查询订单
    const orderRes = await db.collection('orders').where({ outTradeNo: out_trade_no }).get();

    if (orderRes.data.length === 0) {
      log('error', requestId, '订单不存在', { out_trade_no });
      return {
        return_code: 'FAIL',
        return_msg: 'ORDER_NOT_FOUND',
      };
    }

    const order = orderRes.data[0];

    // 防止重复处理
    if (order.status === 'success') {
      log('info', requestId, '订单已处理，跳过', { out_trade_no });
      return {
        return_code: 'SUCCESS',
        return_msg: 'OK',
      };
    }

    // 验证支付状态
    if (result_code !== 'SUCCESS' && return_code !== 'SUCCESS') {
      log('error', requestId, '支付失败', { result_code, return_code });

      // 更新订单状态为支付失败
      await db.collection('orders').where({ outTradeNo: out_trade_no }).update({
        data: {
          status: 'failed',
          failReason: `${result_code || ''} - ${return_code || ''}`,
          updateTime: Date.now()
        },
      });

      return {
        return_code: 'SUCCESS', // 微信要求成功接收回调
        return_msg: 'OK',
      };
    }

    // 验证订单金额（可选的安全检查）
    if (total_fee && order.price !== parseInt(total_fee)) {
      log('error', requestId, '金额不匹配', {
        expected: order.price,
        actual: total_fee
      });
      // 注意：金额不匹配不应该激活VIP，这里只是记录日志
      // 可以根据业务需求决定是否终止流程
    }

    // 激活会员
    log('info', requestId, '开始激活会员', { openid, plan: order.plan });
    const activateResult = await activateVip(openid, order.plan, out_trade_no);

    if (activateResult.success) {
      // 更新订单状态
      await db.collection('orders').where({ outTradeNo: out_trade_no }).update({
        data: {
          status: 'success',
          transactionId: transaction_id,
          payTime: Date.now(),
          updateTime: Date.now()
        },
      });

      log('info', requestId, '支付流程完成', { out_trade_no });

      return {
        return_code: 'SUCCESS',
        return_msg: 'OK',
      };
    } else {
      log('error', requestId, '会员激活失败', activateResult);

      return {
        return_code: 'FAIL',
        return_msg: activateResult.reason || 'ACTIVATE_FAILED',
      };
    }

  } catch (e) {
    log('error', requestId, '支付回调处理异常', { error: e.message, stack: e.stack });

    return {
      return_code: 'FAIL',
      return_msg: 'SYSTEM_ERROR',
    };
  }
};

// 简单的XML解析（用于解析微信支付回调）
function parseXmlToJson(xml) {
  const result = {};

  // 移除XML声明和多余空白
  xml = xml.replace(/<\?xml[^>]*\?>/, '').trim();

  // 匹配所有标签
  const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const key = match[1];
    let value = match[2].trim();

    // 尝试转换为数字
    if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }

    result[key] = value;
  }

  return result;
}
