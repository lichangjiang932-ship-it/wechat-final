Component({
  properties: {
    src: { type: String, value: '' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    tag: { type: String, value: '' },
    tagType: { type: String, value: 'hot' }, // hot | new | vip
    size: { type: String, value: 'medium' }, // small | medium | large | banner
    showActions: { type: Boolean, value: false },
    data: { type: Object, value: {} },
  },

  data: {
    loaded: false,
    error: false,
  },

  observers: {
    src(newSrc) {
      if (newSrc) {
        this.setData({ loaded: false, error: false });
      }
    },
  },

  methods: {
    onLoad() {
      this.setData({ loaded: true });
    },

    onError() {
      this.setData({ error: true, loaded: true });
    },

    onTap() {
      this.triggerEvent('tap', { data: this.data.data });
    },
  },
});
