// cloudfunctions/user/index.js - 鐢ㄦ埛浜戝嚱鏁?const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// JWT瀵嗛挜 - 浠庣幆澧冨彉閲忚鍙栵紙瀹夊叏鎬ф敼杩涳級
// 鍦ㄥ井淇′簯寮€鍙戞帶鍒跺彴閰嶇疆鐜鍙橀噺锛欽WT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || 'art-ai-mini-secret-key-2024-dev';

// 鐢熸垚token锛堝甫杩囨湡鏃堕棿锛?function generateToken(openid) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { openid, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '365d' }
  );
}

// 楠岃瘉token
function verifyToken(token) {
  const jwt = require('jsonwebtoken');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// 鍙傛暟鏍￠獙宸ュ叿鍑芥暟
function validateString(value, fieldName, maxLength = 50) {
  if (typeof value !== 'string') {
    return { valid: false, msg: `${fieldName}蹇呴』涓哄瓧绗︿覆` };
  }
  if (value.length > maxLength) {
    return { valid: false, msg: `${fieldName}闀垮害涓嶈兘瓒呰繃${maxLength}涓瓧绗 };
  }
  return { valid: true };
}

exports.main = async (event, context) => {
  const { action } = event;

  // 鍙傛暟鍩虹鏍￠獙
  if (!action || typeof action !== 'string') {
    return { code: -1, msg: '缂哄皯鎿嶄綔绫诲瀷鍙傛暟' };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 鏃ュ織璁板綍锛堜究浜庤皟璇曞拰闂鎺掓煡锛?  console.log(`[user] action: ${action}, openid: ${openid ? openid.slice(0, 8) + '...' : 'null'}`);

  switch (action) {
    case 'wxLogin':
      return await wxLogin(openid);
    case 'phoneLogin':
      // 鍙傛暟鏍￠獙
      if (!event.code) {
        return { code: -1, msg: '缂哄皯鎵嬫満鍙锋巿鏉冪爜' };
      }
      return await phoneLogin(openid, event.code);
    case 'getInfo':
      return await getUserInfo(openid);
    default:
      return { code: -1, msg: '鏈煡鎿嶄綔' };
  }
};

// 寰俊涓€閿櫥褰?async function wxLogin(openid) {
  if (!openid) {
    return { code: -1, msg: '鏃犳硶鑾峰彇鐢ㄦ埛韬唤' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();

    let user;
    if (userRes.data.length === 0) {
      // 鏂扮敤鎴凤紝鍒涘缓璁板綍
      user = {
        openid,
        nickName: '',
        avatarUrl: '',
        avatarEmoji: getRandomEmoji(),
        phone: '',
        vipLevel: 'free',
        vipExpireTime: null,
        createTime: Date.now(),
        lastLoginTime: Date.now(),
      };
      const addRes = await db.collection('users').add({ data: user });
      user._id = addRes._id;
      console.log(`[user] 鏂扮敤鎴锋敞鍐? ${openid.slice(0, 8)}...`);
    } else {
      user = userRes.data[0];
      await db.collection('users').doc(user._id).update({
        data: { lastLoginTime: Date.now() },
      });
      console.log(`[user] 鐢ㄦ埛鐧诲綍: ${openid.slice(0, 8)}...`);
    }

    const token = generateToken(openid);
    return {
      code: 0,
      data: { ...user, token },
    };
  } catch (e) {
    console.error('[user] wxLogin error:', e);
    // 鏁版嵁搴撻泦鍚堜笉瀛樺湪鏃讹紝杩斿洖閿欒淇℃伅鑰岄潪涓存椂鐢ㄦ埛
    return { code: -1, msg: '鏈嶅姟鏆傛椂涓嶅彲鐢紝璇风◢鍚庨噸璇? };
  }
}

// 鎵嬫満鍙风櫥褰?async function phoneLogin(openid, code) {
  if (!openid) {
    return { code: -1, msg: '鏃犳硶鑾峰彇鐢ㄦ埛韬唤' };
  }

  if (!code || typeof code !== 'string') {
    return { code: -1, msg: '鎺堟潈鐮佹棤鏁? };
  }

  try {
    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    if (!phoneRes.phoneInfo || !phoneRes.phoneInfo.phoneNumber) {
      return { code: -1, msg: '鑾峰彇鎵嬫満鍙峰け璐? };
    }
    const phone = phoneRes.phoneInfo.phoneNumber;

    const userRes = await db.collection('users').where({ openid }).get();

    let user;
    if (userRes.data.length === 0) {
      user = {
        openid,
        nickName: '',
        avatarUrl: '',
        avatarEmoji: getRandomEmoji(),
        phone,
        vipLevel: 'free',
        vipExpireTime: null,
        createTime: Date.now(),
        lastLoginTime: Date.now(),
      };
      const addRes = await db.collection('users').add({ data: user });
      user._id = addRes._id;
      console.log(`[user] 鏂扮敤鎴锋敞鍐?鎵嬫満鍙?: ${openid.slice(0, 8)}...`);
    } else {
      user = userRes.data[0];
      await db.collection('users').doc(user._id).update({
        data: { phone, lastLoginTime: Date.now() },
      });
      user.phone = phone;
      console.log(`[user] 鐢ㄦ埛鏇存柊鎵嬫満鍙? ${openid.slice(0, 8)}...`);
    }

    const token = generateToken(openid);
    return {
      code: 0,
      data: { ...user, token },
    };
  } catch (e) {
    console.error('[user] phoneLogin error:', e);
    // 鍖哄垎涓嶅悓绫诲瀷鐨勯敊璇?    if (e.errMsg && e.errMsg.includes('invalid code')) {
      return { code: -1, msg: '鎺堟潈鐮佸凡杩囨湡锛岃閲嶆柊鑾峰彇' };
    }
    return { code: -1, msg: '鎵嬫満鍙风櫥褰曞け璐ワ紝璇风◢鍚庨噸璇? };
  }
}

// 鑾峰彇鐢ㄦ埛淇℃伅
async function getUserInfo(openid) {
  if (!openid) {
    return { code: -1, msg: '鏃犳硶鑾峰彇鐢ㄦ埛韬唤' };
  }

  try {
    const userRes = await db.collection('users').where({ openid }).get();
    if (userRes.data.length === 0) {
      return { code: -1, msg: '鐢ㄦ埛涓嶅瓨鍦? };
    }
    // 涓嶈繑鍥炴晱鎰熶俊鎭?    const user = userRes.data[0];
    delete user._id; // 绉婚櫎鏁版嵁搴揑D
    return { code: 0, data: user };
  } catch (e) {
    console.error('[user] getUserInfo error:', e);
    return { code: -1, msg: '鑾峰彇鐢ㄦ埛淇℃伅澶辫触' };
  }
}

// 闅忔満emoji澶村儚
function getRandomEmoji() {
  const emojis = ['馃帹', '馃枌锔?, '馃幁', '馃専', '馃寛', '馃', '馃惐', '馃', '馃惣', '馃尰', '馃帾', '馃幐', '馃幍', '馃', '馃尭'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}
