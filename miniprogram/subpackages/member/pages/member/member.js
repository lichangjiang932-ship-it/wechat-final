// subpackages/member/pages/member/member.js - Editorial membership page
const { callFunction, checkLogin } = require('../../../../utils/cloud');
const { computeNavBar } = require('../../../../utils/common');
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
      vipExpireTime = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    wx.showLoading({ title: this.data.lang === 'en' ? 'Creating order…' : '创建订单…', mask: true });

    try {
      const res = await callFunction('ai', { action: 'createOrder', plan: selectedPlan });
      wx.hideLoading();

      const activate = () => {
        const expireTime = selectedPlan === 'month'
          ? Date.now() + 30 * 24 * 60 * 60 * 1000
          : Date.now() + 365 * 24 * 60 * 60 * 1000;
        const newUserInfo = { ...userInfo, vipLevel: selectedPlan, vipExpireTime: expireTime };
        wx.setStorageSync('userInfo', newUserInfo);
        this.setData({ userInfo: newUserInfo, vipLevel: selectedPlan });
        this.loadUserInfo();
      };

      if (res && res.paySign) {
        wx.requestPayment({
          timeStamp: res.timeStamp,
          nonceStr: res.nonceStr,
          package: res.package,
          signType: res.signType,
          paySign: res.paySign,
          success: () => {
            wx.showToast({ title: this.data.lang === 'en' ? 'Success' : '支付成功', icon: 'success' });
            activate();
          },
          fail: (err) => {
            const cancelled = err && err.errMsg === 'requestPayment:fail cancel';
            wx.showToast({
              title: this.data.lang === 'en'
                ? (cancelled ? 'Cancelled' : 'Payment failed')
                : (cancelled ? '支付取消' : '支付失败'),
              icon: 'none',
            });
          },
        });
      } else {
        wx.showToast({
          title: this.data.lang === 'en' ? 'Payment config error' : '支付配置异常，请联系客服',
          icon: 'none',
        });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({
        title: this.data.lang === 'en' ? 'Service unavailable' : '支付暂不可用',
        icon: 'none',
      });
    }
  },

  onShareAppMessage() {
    const title = this.data.lang === 'en'
      ? 'Miaosec Atelier — subscribe'
      : '微秒工作室 · 订阅会员';
    return { title, path: '/subpackages/member/pages/member/member' };
  },
});
