# 小程序上线收费配置（虚拟支付 + AI 合规）

## 1. 必配环境变量（cloudfunctions/ai）

在云开发控制台给 `ai` 云函数配置：

- `XPAY_OFFER_ID`：虚拟支付 OfferId
- `XPAY_ENV`：支付环境（`0=正式`，`1=沙箱`）
- `XPAY_APPKEY_PROD`：正式 AppKey
- `XPAY_APPKEY_SANDBOX`：沙箱 AppKey
- `XPAY_PAYSIG_URI`：paySig 签名 URI（默认 `/cgi-bin/midas-mp/rest`）

兼容字段（可选，老配置迁移期使用）：

- `XPAY_APPKEY`
- `XPAY_SIGN_PATH`
- `MIDAS_OFFER_ID`
- `MIDAS_ENV`
- `MIDAS_APPKEY`

> 生产发版必须 `XPAY_ENV=0`，否则 `createVirtualOrder` 会直接拒绝下单。

## 2. 必配环境变量（cloudfunctions/pay-notify-virtual）

在 `pay-notify-virtual` 云函数配置：

- `XPAY_OFFER_ID`
- `XPAY_APPKEY_PROD`
- `XPAY_APPKEY_SANDBOX`
- `VIRTUAL_NOTIFY_PATH`（可选，默认 `/mp/notify`）

## 3. 公众号后台配置

微信公众平台 -> 小程序虚拟支付：

1. 开通并签约虚拟支付商户
2. 发布道具：`vip_month`、`vip_year`
3. 配置发货通知地址为 `pay-notify-virtual` HTTP 地址
4. 核对 OfferId 与云函数环境变量一致

## 4. 运行时策略

- 全端（iOS/Android）统一调用 `wx.requestVirtualPayment`
- iOS 不允许沙箱；iOS 下若 `XPAY_ENV=1` 会被服务端拒绝
- 会员到账以服务端订单终态为准，不以前端 success 为准

## 5. 回调补偿

`pay-notify-virtual` 支持后台补偿任务：

- action: `compensateVirtualOrders`
- 建议创建云定时触发（例如每 5 分钟）

补偿逻辑：

- `processing` 超时订单回退到 `pending`
- 长时间 `pending` 订单标记 `failed(CALLBACK_TIMEOUT)`

## 6. 提审前核对清单

- [ ] 服务类目包含：深度合成-AI绘画
- [ ] AI 生成主页面首屏有“AI生成/人工智能生成”显著标识
- [ ] 结果图角标与保存图水印保留
- [ ] 虚拟支付道具已发布（`vip_month`、`vip_year`）
- [ ] 发货回调地址可达并验证通过
- [ ] Android 真机支付链路通过
- [ ] iOS 真机（正式环境）小额支付链路通过
