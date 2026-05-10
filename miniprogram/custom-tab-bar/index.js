// Floating glass dock — editorial ember
Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index',       icon: 'home' },
      { pagePath: '/pages/discover/discover', icon: 'compass' },
      { pagePath: '/pages/create/create',     icon: 'plus', center: true },
      { pagePath: '/pages/favorites/favorites', icon: 'bookmark' },
      { pagePath: '/pages/my/my',             icon: 'user' }
    ]
  },
  attached() {
    // Respect safe area
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : {};
      if (info.safeArea && info.screenHeight) {
        this.setData({ safeBottom: info.screenHeight - info.safeArea.bottom });
      }
    } catch (e) {}
  },
  methods: {
    onTap(e) {
      const i = e.currentTarget.dataset.i;
      const target = this.data.list[i];
      wx.switchTab({ url: target.pagePath });
      this.setData({ selected: i });
    }
  }
});
