const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const FREE_DAILY_LIMIT = parseInt(process.env.FREE_DAILY_LIMIT || '5', 10);

async function getUser(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}

function getTodayKey() {
  const now = new Date();
  // 北京时间 UTC+8
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return bj.toISOString().slice(0, 10);
}

function getVipExpireTime(user) {
  if (!user) return 0;
  const expireTime = Number(user.vipExpireTime || 0);
  return Number.isFinite(expireTime) ? expireTime : 0;
}

async function getUsageRecord(openid, date) {
  const res = await db.collection('ai_usage').where({ openid, date }).limit(1).get();
  return res.data[0] || null;
}

async function checkUsageLimit(openid) {
  if (!openid) return { allowed: false, msg: '无法获取用户身份' };

  try {
    const user = await getUser(openid);
    const isVip = getVipExpireTime(user) > Date.now();

    if (isVip) {
      return { allowed: true, isVip: true, used: 0, limit: -1 };
    }

    const today = getTodayKey();
    const usageRecord = await getUsageRecord(openid, today);
    const used = usageRecord?.count || 0;

    if (used >= FREE_DAILY_LIMIT) {
      return {
        allowed: false,
        isVip: false,
        used,
        limit: FREE_DAILY_LIMIT,
        msg: `今日免费次数已用完（${FREE_DAILY_LIMIT}次），开通会员可解锁无限次使用`,
      };
    }

    return { allowed: true, isVip: false, used, limit: FREE_DAILY_LIMIT };
  } catch (e) {
    console.error('checkUsageLimit error:', e);
    return { allowed: false, isVip: false, used: 0, limit: FREE_DAILY_LIMIT, msg: '系统繁忙，请稍后重试' };
  }
}

async function incrementUsage(openid) {
  const today = getTodayKey();
  const user = await getUser(openid);
  const isVip = getVipExpireTime(user) > Date.now();

  const usageRecord = await getUsageRecord(openid, today);
  if (usageRecord) {
    // 非会员：检查是否已超限
    if (!isVip && usageRecord.count >= FREE_DAILY_LIMIT) {
      return false;
    }
    await db.collection('ai_usage').doc(usageRecord._id).update({
      data: { count: _.inc(1) },
    });
    return true;
  }

  await db.collection('ai_usage').add({
    data: {
      openid,
      date: today,
      count: 1,
    },
  });
  return true;
}

async function getUsage(openid) {
  if (!openid) {
    return { code: -1, msg: '无法获取用户身份' };
  }

  try {
    const user = await getUser(openid);
    const isVip = getVipExpireTime(user) > Date.now();
    const today = getTodayKey();

    let used = 0;
    if (!isVip) {
      const usageRecord = await getUsageRecord(openid, today);
      used = usageRecord?.count || 0;
    }

    return {
      code: 0,
      data: {
        used,
        limit: isVip ? -1 : FREE_DAILY_LIMIT,
        isVip,
      },
    };
  } catch (e) {
    return { code: -1, msg: '获取用量失败' };
  }
}

async function renewMembership(openid, plan) {
  const plans = {
    month: 30,
    year: 365,
  };

  if (!plans[plan]) throw new Error('无效的会员套餐');

  const user = await getUser(openid);

  const now = Date.now();
  const currentExpire = getVipExpireTime(user);
  const baseTime = currentExpire > now ? currentExpire : now;
  const newExpire = baseTime + plans[plan] * 24 * 60 * 60 * 1000;

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

  return { success: true, membershipExpire: new Date(newExpire).toISOString() };
}

module.exports = {
  checkUsageLimit,
  incrementUsage,
  getUsage,
  renewMembership,
};
