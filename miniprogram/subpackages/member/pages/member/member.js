// subpackages/member/pages/member/member.js - 会员页面
const { callFunction, checkLogin } = require('../../../../utils/cloud');

// 获取全局导航栏高度
function getNavBarHeight() {
  try {
    const app = getApp();
    return app.globalData.navBarHeight || 88;
  } catch (e) {
    return 88;
  }
}

Page({
  data: {
    userInfo: null,
    vipLevel: 'free',
    vipLevelText: '普通用户',
    vipExpireTime: '',
    selectedPlan: 'month',
    navBarHeight: 88,
  },

  onLoad() {
    const navBarHeight = getNavBarHeight();
    this.setData({ navBarHeight });
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  goBack() {
    wx.navigateBack();
  },

  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    let vipLevelText = '普通用户';
    if (userInfo.vipLevel === 'month') vipLevelText = '月度会员';
    if (userInfo.vipLevel === 'year') vipLevelText = '年度会员';

    let vipExpireTime = '';
    if (userInfo.vipExpireTime) {
      const date = new Date(userInfo.vipExpireTime);
      vipExpireTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    this.setData({
      userInfo,
      vipLevel: userInfo.vipLevel || 'free',
      vipLevelText,
      vipExpireTime,
    });
  },

  selectPlan(e) {
    wx.vibrateShort({ type: 'light' });
    this.setData({ selectedPlan: e.currentTarget.dataset.plan });
  },

  async subscribe() {
    const { selectedPlan, userInfo } = this.data;
    
    // 检查是否已登录
    if (!checkLogin()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在创建订单...' });

    try {
      // 调用云函数创建订单
      const res = await callFunction('ai', { action: 'createOrder', plan: selectedPlan });
      
      wx.hideLoading();
      
      if (res.paySign) {
        // 小程序支付
        wx.requestPayment({
          timeStamp: res.timeStamp,
          nonceStr: res.nonceStr,
          package: res.package,
          signType: res.signType,
          paySign: res.paySign,
          success: () => {
            wx.showToast({ title: '支付成功', icon: 'success' });
            // 更新用户VIP状态
            const expireTime = selectedPlan === 'month' 
              ? Date.now() + 30 * 24 * 60 * 60 * 1000 
              : Date.now() + 365 * 24 * 60 * 60 * 1000;
            const newUserInfo = { ...userInfo, vipLevel: selectedPlan, vipExpireTime: expireTime };
            wx.setStorageSync('userInfo', newUserInfo);
            this.setData({ userInfo: newUserInfo, vipLevel: selectedPlan });
            this.loadUserInfo();
          },
          fail: (err) => {
            if (err.errMsg === 'requestPayment:fail cancel') {
              wx.showToast({ title: '支付取消', icon: 'none' });
            } else {
              wx.showToast({ title: '支付失败', icon: 'none' });
            }
          }
        });
      } else {
        // 演示模式（没有配置支付）
        wx.showToast({ title: '演示模式：支付功能待配置', icon: 'none' });
        // 模拟开通会员
        const expireTime = selectedPlan === 'month' 
          ? Date.now() + 30 * 24 * 60 * 60 * 1000 
          : Date.now() + 365 * 24 * 60 * 60 * 1000;
        const newUserInfo = { ...userInfo, vipLevel: selectedPlan, vipExpireTime: expireTime };
        wx.setStorageSync('userInfo', newUserInfo);
        this.setData({ userInfo: newUserInfo, vipLevel: selectedPlan });
        this.loadUserInfo();
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '支付服务暂不可用', icon: 'none' });
    }
  },

  onShareAppMessage() {
    return { title: '照片工坊 - 开通会员', path: '/subpackages/member/pages/member/member' };
  },
});
