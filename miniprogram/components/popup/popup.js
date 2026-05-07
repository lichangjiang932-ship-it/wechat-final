Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    mask: { type: Boolean, value: true },
    maskClosable: { type: Boolean, value: true },
    showHandle: { type: Boolean, value: true },
    showClose: { type: Boolean, value: false },
    showFooter: { type: Boolean, value: false },
    scrollable: { type: Boolean, value: false },
    maxHeight: { type: String, value: '80vh' },
  },

  methods: {
    onMaskTap() {
      if (this.data.maskClosable) {
        this.triggerEvent('close');
      }
    },

    onClose() {
      this.triggerEvent('close');
    },
  },
});
