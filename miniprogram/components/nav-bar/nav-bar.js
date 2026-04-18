// components/nav-bar/nav-bar.js
Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: true },
    bgColor: { type: String, value: 'rgba(248, 246, 243, 0.88)' },
    titleColor: { type: String, value: 'var(--text-primary)' },
    subtitleColor: { type: String, value: 'var(--text-hint)' },
    titleSize: { type: Number, value: 34 },
    backDelta: { type: Number, value: 1 },
  },

  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
  },

  lifetimes: {
    attached() {
      try {
        const windowInfo = wx.getWindowInfo();
        const menuBtn = wx.getMenuButtonBoundingClientRect();
        this.setData({
          statusBarHeight: windowInfo.statusBarHeight,
          navBarHeight: (menuBtn.top - windowInfo.statusBarHeight) * 2 + menuBtn.height + windowInfo.statusBarHeight,
        });
      } catch (e) {
        console.warn('[nav-bar] 高度计算失败:', e.message);
      }
    },
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
      wx.navigateBack({ delta: this.data.backDelta });
    },
  },
});
