# 类目-功能对照检查清单（提审用）

## 一、深度合成类目

- 选择类目：`深度合成-AI绘画`
- 实际功能：文本生图、图生图、AI海报合成
- 结论：类目与功能一致

## 二、显著标识

以下页面必须首屏可见“AI生成 / 人工智能生成”说明：

- `pages/create/create`（创作与结果主操作页）
- `pages/index/index`（首页展示流）
- `pages/discover/discover`（发现页展示流）
- `pages/favorites/favorites`（收藏页）
- `pages/likes/likes`（喜欢页）
- `subpackages/history/pages/history`（历史作品页）

结果图层面：

- 结果图右上角角标保留（AI生成）
- 保存到相册图片保留水印（AI生成）

## 三、虚拟支付

- 会员虚拟商品（`vip_month`、`vip_year`）全端走 `wx.requestVirtualPayment`
- 不使用 `wx.requestPayment` 购买虚拟商品
- 服务端有发货回调与补偿机制

## 四、提审截图包建议

至少准备以下截图：

1. 首页 AI 显著标识
2. 创作页 AI 显著标识
3. 结果页 AI 显著标识（含角标）
4. 会员购买页（显示虚拟支付）
5. 支付成功后会员状态更新页
