Component({
  properties: {
    src: { type: String, value: '' },
    mode: { type: String, value: 'aspectFill' },
    shape: { type: String, value: 'rounded' }, // rounded | circle | none
    lazyLoad: { type: Boolean, value: true },
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
  },
});
