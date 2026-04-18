// cloudfunctions/user/index.js - 用户云函数
const cloud = require('wx-server-sdk');
const jwt = require('jsonwebtoken');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[user] 致命错误: JWT_SECRET 环境变量未配置，服务拒绝启动');
  throw new Error('JWT_SECRET is not configured');
}

function generateToken(openid) {
  return jwt.sign(
    { openid, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function getRandomEmoji() {
  const emojis = ['🎨', '🖌️', '🎭', '🌟', '🌈', '🦄', '🐱', '🦊', '🐼', '🌻', '🎪', '🎸', '🎵', '🦋', '🌸'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

async function findUser(openid) {
  const res = await db.collection('users').where({ openid }).get();
  return res.data[0] || null;
}

async function createUser(openid, extraFields = {}) {
  const now = Date.now();
  const user = {
    openid,
    nickName: '',
    avatarUrl: '',
    avatarEmoji: getRandomEmoji(),
    phone: '',
    vipLevel: 'free',
    vipExpireTime: null,
    createTime: now,
    lastLoginTime: now,
    ...extraFields,
  };
  const addRes = await db.collection('users').add({ data: user });
  user._id = addRes._id;
  return user;
}

async function updateLoginTime(userId) {
  await db.collection('users').doc(userId).update({
    data: { lastLoginTime: Date.now() },
  });
}

async function wxLogin(openid) {
  if (!openid) return { code: -1, msg: '无法获取用户身份' };

  try {
    let user = await findUser(openid);
    if (!user) {
      user = await createUser(openid);
    } else {
      await updateLoginTime(user._id);
    }

    const token = generateToken(openid);
    const { _id, ...safeUser } = user;
    return { code: 0, data: { ...safeUser, token } };
  } catch (e) {
    console.error('[user] wxLogin error:', e);
    return { code: -1, msg: '服务暂时不可用，请稍后重试' };
  }
}

async function phoneLogin(openid, code) {
  if (!openid) return { code: -1, msg: '无法获取用户身份' };
  if (!code || typeof code !== 'string') return { code: -1, msg: '授权码无效' };

  try {
    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    const phone = phoneRes?.phoneInfo?.phoneNumber;
    if (!phone) return { code: -1, msg: '获取手机号失败' };

    let user = await findUser(openid);
    if (!user) {
      user = await createUser(openid, { phone });
    } else {
      await db.collection('users').doc(user._id).update({
        data: { phone, lastLoginTime: Date.now() },
      });
      user.phone = phone;
    }

    const token = generateToken(openid);
    const { _id, ...safeUser } = user;
    return { code: 0, data: { ...safeUser, token } };
  } catch (e) {
    console.error('[user] phoneLogin error:', e);
    if (e.errMsg && e.errMsg.includes('invalid code')) {
      return { code: -1, msg: '授权码已过期，请重新获取' };
    }
    return { code: -1, msg: '手机号登录失败，请稍后重试' };
  }
}

async function getUserInfo(openid) {
  if (!openid) return { code: -1, msg: '无法获取用户身份' };

  try {
    const user = await findUser(openid);
    if (!user) return { code: -1, msg: '用户不存在' };
    const { _id, ...safeUser } = user;
    return { code: 0, data: safeUser };
  } catch (e) {
    console.error('[user] getUserInfo error:', e);
    return { code: -1, msg: '获取用户信息失败' };
  }
}

async function updateProfile(openid, payload = {}) {
  if (!openid) return { code: -1, msg: '无法获取用户身份' };

  const updates = {};
  if (typeof payload.nickName === 'string') {
    updates.nickName = payload.nickName.slice(0, 50);
  }
  if (typeof payload.avatarUrl === 'string') {
    updates.avatarUrl = payload.avatarUrl;
  }
  if (typeof payload.avatarEmoji === 'string') {
    updates.avatarEmoji = payload.avatarEmoji;
  }

  if (Object.keys(updates).length === 0) {
    return { code: -1, msg: '没有可更新的内容' };
  }

  try {
    const user = await findUser(openid);
    if (!user) return { code: -1, msg: '用户不存在' };

    updates.lastLoginTime = Date.now();
    await db.collection('users').doc(user._id).update({
      data: updates,
    });

    const updatedUser = { ...user, ...updates };
    const { _id, ...safeUser } = updatedUser;
    return { code: 0, data: safeUser };
  } catch (e) {
    console.error('[user] updateProfile error:', e);
    return { code: -1, msg: '更新用户信息失败' };
  }
}

exports.main = async (event) => {
  const { action } = event || {};
  if (!action || typeof action !== 'string') {
    return { code: -1, msg: '缺少操作类型参数' };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {
    case 'wxLogin':
      return await wxLogin(openid);
    case 'phoneLogin':
      return await phoneLogin(openid, event.code);
    case 'getInfo':
    case 'getProfile':
      return await getUserInfo(openid);
    case 'updateProfile':
      return await updateProfile(openid, event);
    default:
      return { code: -1, msg: '未知操作' };
  }
};
