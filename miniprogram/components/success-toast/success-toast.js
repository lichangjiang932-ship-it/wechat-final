Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '操作成功' },
    desc: { type: String, value: '' },
    iconType: { type: String, value: 'check' }, // check | heart | star
    duration: { type: Number, value: 1500 },
  },

  observers: {
    visible(val) {
      if (val && this.data.duration > 0) {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          this.setData({ visible: false });
          this.triggerEvent('close');
        }, this.data.duration);
      }
    },
  },

  lifetimes: {
    detached() {
      clearTimeout(this._timer);
    },
  },

  methods: {
    show(options = {}) {
      this.setData({
        visible: true,
        title: options.title || '操作成功',
        desc: options.desc || '',
        iconType: options.iconType || 'check',
      });
    },

    hide() {
      this.setData({ visible: false });
    },
  },
});
