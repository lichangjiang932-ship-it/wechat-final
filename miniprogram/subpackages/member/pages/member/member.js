// subpackages/member/pages/member/member.js - Editorial membership page
const { callFunction, checkLogin } = require('../../../../utils/cloud');
const { computeNavBar, isIOSPlatform } = require('../../../../utils/common');
const i18n = require('../../../../utils/i18n');
const themeMod = require('../../../../utils/theme');

const PERKS = [
  { n: 1, titleKey: 'member.perk.unlimited', subKey: 'member.perk.unlimited.sub' },
  { n: 2, titleKey: 'member.perk.hd',        subKey: 'member.perk.hd.sub' },
  { n: 3, titleKey: 'member.perk.styles',    subKey: 'member.perk.styles.sub' },
  { n: 4, titleKey: 'member.perk.priority',  subKey: 'member.perk.priority.sub' },
];

Page({
  data: {
    userInfo: {},
    vipLevel: 'free',
    vipExpireTime: '',
    selectedPlan: 'year',   // default to most editorial / best-value plan
    navBarHeight: 44,
    statusBarHeight: 20,
    lang: 'zh',
    theme: 'dark',
    themeClass: 'theme-dark',
    i18n: {},
    perks: PERKS,
    isIOS: false,
  },

  _applyLang(lang) {
    this.setData({ lang, i18n: i18n.pack(lang) });
  },

  onLoad() {
    const { navBarHeight, statusBarHeight } = computeNavBar();
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    this.setData({
      navBarHeight,
      statusBarHeight,
      theme,
      themeClass: themeMod.themeClass(theme),
      isIOS: isIOSPlatform(),
    });
    this._applyLang(lang);
    this.loadUserInfo();
  },

  onShow() {
    const lang = i18n.getLang();
    const theme = themeMod.getTheme();
    if (lang !== this.data.lang) this._applyLang(lang);
    if (theme !== this.data.theme) {
      this.setData({ theme, themeClass: themeMod.themeClass(theme) });
    }
    this.loadUserInfo();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    let vipExpireTime = '';
    if (userInfo.vipExpireTime) {
      const d = new Date(userInfo.vipExpireTime);
      if (!isNaN(d.getTime())) {
        vipExpireTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    this.setData({
      userInfo,
      vipLevel: userInfo.vipLevel || 'free',
      vipExpireTime,
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/my/my' }) });
  },

  selectPlan(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectedPlan: e.currentTarget.dataset.plan });
  },

  async subscribe() {
    const { selectedPlan, userInfo } = this.data;
    if (!checkLogin()) {
      wx.showToast({ title: this.data.lang === 'en' ? 'Please sign in' : '请先登录', icon: 'none' });
      return;
    }
    await this.subscribeVirtual(selectedPlan, userInfo);
  },

  // ============ Unified virtual payment ============
  // ============ iOS：小程序虚拟支付 ============
  async subscribeVirtual(plan, userInfo) {
    const isEn = this.data.lang === 'en';
    wx.showLoading({ title: isEn ? 'Creating order…' : '创建订单…', mask: true });

    let res;
    try {
      // 取 wx.login 的 code（服务端用它换 sessionKey 给 signData 签名）
      const loginCode = await new Promise((resolve) => {
        wx.login({ success: r => resolve(r.code || ''), fail: () => resolve('') });
      });

      // silent: cloud.js 出错时会自己 showToast，会把 showLoading 顶掉，
      // 让本页统一管理 loading/toast，避免 hideLoading 与已消失的 loading 不配对告警
      res = await callFunction('ai', {
        action: 'createVirtualOrder',
        plan,
        platform: this.data.isIOS ? 'ios' : 'android',
        code: loginCode,
      }, { silent: true });
    } catch (e) {
      wx.hideLoading();
      const msg = (e && e.message) ? e.message : (isEn ? 'Service unavailable' : '支付暂不可用');
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }
    wx.hideLoading();

    if (!res || !res.signData || !res.paySig) {
      wx.showToast({ title: isEn ? 'Payment config error' : '支付配置异常', icon: 'none' });
      return;
    }

    if (typeof wx.requestVirtualPayment !== 'function') {
      wx.showModal({
        title: isEn ? 'Update WeChat' : '请升级微信',
        content: isEn ? 'Please update WeChat to the latest version.' : '当前微信版本不支持虚拟支付，请升级后再试。',
        showCancel: false,
      });
      return;
    }

    console.log('[virtualPay] req:', {
      signData: res.signData,
      paySig: res.paySig,
      signature: res.signature || '',
      mode: res.mode || 'short_series_goods',
      env: res.env,
    });
    const outTradeNo = res.outTradeNo;
    wx.requestVirtualPayment({
      signData: res.signData,
      paySig: res.paySig,
      signature: res.signature || '',
      mode: res.mode || 'short_series_goods',
      env: res.env,
      success: async (ok) => {
        console.log('[virtualPay] success:', ok);
        // 主动让云函数发货（不依赖微信回调），保证支付成功后会员立即到账
        try {
          const deliverRes = await callFunction('ai', {
            action: 'deliverVirtualOrder',
            outTradeNo,
          }, { silent: true });
          console.log('[virtualPay] deliver:', deliverRes);
        } catch (e) {
          console.error('[virtualPay] deliver failed:', e && e.message);
          // 发货失败不阻断 UI；refreshVipStateAfterPayment 会再轮询拿最终状态
        }
        wx.showToast({ title: isEn ? 'Success' : '支付成功', icon: 'success' });
        await this.refreshVipStateAfterPayment(plan, userInfo);
      },
      fail: (err) => {
        // 把完整错误打到 console，方便排查
        console.error('[virtualPay] fail:', err);
        const errMsg = (err && err.errMsg) || '';
        const errCode = (err && (err.errCode !== undefined ? err.errCode : err.errcode));
        const cancelled = /cancel/i.test(errMsg);
        const detail = [errCode, errMsg].filter(v => v !== undefined && v !== '').join(' ');
        wx.showModal({
          title: isEn ? 'Payment failed' : '支付失败',
          content: cancelled
            ? (isEn ? 'Cancelled' : '支付取消')
            : (detail || (isEn ? 'Unknown error' : '未知错误')),
          showCancel: false,
        });
      },
    });
  },

  async refreshVipStateAfterPayment(plan, fallbackUserInfo = {}) {
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const user = await callFunction('user', { action: 'getInfo' }, { silent: true });
        if (user) {
          // 合并云端字段（vipLevel/vipExpireTime）和本地填的头像昵称，
          // 否则云端 nickName/avatarUrl 为空会把本地登录态覆盖成游客。
          const localUser = wx.getStorageSync('userInfo') || {};
          const merged = {
            ...localUser,
            ...user,
            nickName: user.nickName || localUser.nickName || '',
            avatarUrl: user.avatarUrl || localUser.avatarUrl || '',
          };
          wx.setStorageSync('userInfo', merged);
          this.setData({ userInfo: merged, vipLevel: merged.vipLevel || 'free' });
          this.loadUserInfo();
          if (merged.vipLevel === plan && Number(merged.vipExpireTime || 0) > Date.now()) return;
        }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    // 重试都没拿到正确状态：保留付款前的 userInfo（含头像昵称），不要清空
    const localUser = wx.getStorageSync('userInfo') || {};
    const keepUser = { ...localUser, ...fallbackUserInfo };
    wx.setStorageSync('userInfo', keepUser);
    wx.showToast({
      title: this.data.lang === 'en' ? 'Status syncing shortly' : '支付已完成，会员状态稍后同步',
      icon: 'none',
    });
  },

  onShareAppMessage() {
    const title = this.data.lang === 'en'
      ? 'Miaosec Atelier — subscribe'
      : '微秒工作室 · 订阅会员';
    return { title, path: '/subpackages/member/pages/member/member' };
  },
});
