// components/privacy-popup/privacy-popup.js
// 全局隐私授权弹窗：响应 wx.onNeedPrivacyAuthorization
Component({
  data: {
    visible: false,
    privacyContractName: '《用户隐私保护指引》',
  },

  lifetimes: {
    attached() {
      // 微信基础库 2.32.3+ 才支持
      if (!wx.onNeedPrivacyAuthorization) return;
      wx.getPrivacySetting({
        success: (res) => {
          // res.needAuthorization === true 表示需要弹窗
          if (res.needAuthorization) {
            this.setData({
              visible: true,
              privacyContractName: res.privacyContractName || '《用户隐私保护指引》',
            });
          }
        },
      });
      // 当其他 API 触发隐私授权时也弹窗
      wx.onNeedPrivacyAuthorization((resolve) => {
        this._resolvePrivacy = resolve;
        this.setData({ visible: true });
      });
    },
  },

  methods: {
    onAgree() {
      this.setData({ visible: false });
      if (this._resolvePrivacy) {
        this._resolvePrivacy({ event: 'agree', buttonId: 'agree-btn' });
        this._resolvePrivacy = null;
      }
      this.triggerEvent('agree');
    },
    onDisagree() {
      this.setData({ visible: false });
      if (this._resolvePrivacy) {
        this._resolvePrivacy({ event: 'disagree' });
        this._resolvePrivacy = null;
      }
      this.triggerEvent('disagree');
    },
    openPrivacyContract() {
      wx.openPrivacyContract({
        fail: () => {
          // 兜底：跳到本地隐私页
          wx.navigateTo({ url: '/subpackages/policy/pages/privacy/privacy' });
        },
      });
    },
    noop() {},
  },
});
