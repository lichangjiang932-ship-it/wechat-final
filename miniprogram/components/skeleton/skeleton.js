Component({
  properties: {
    loading: { type: Boolean, value: true },
    type: { type: String, value: 'index' }, // index | list | detail
    count: { type: Number, value: 3 }, // list 类型时的条数
  },
});
