# 妙摄 Miaosec — AI 图像创作小程序

一款编辑刊风格的 AI 图像创作小程序，支持 AI 写真、风格迁移、童趣海报等功能。

## 功能特性

### 核心功能
- **AI 创作** — 文生图 / 图生图，多风格预设
- **童趣海报** — 4 步生成儿童才艺主题海报（Canvas 程序化绘制）
- **作品收藏** — 个人作品库 + 公共画廊
- **会员订阅** — 微信支付集成

### 页面结构

主包：

| 页面 | 路径 |
|------|------|
| 首页 | `/pages/index/index` |
| 发现 | `/pages/discover/discover` |
| 创作 | `/pages/create/create` |
| 收藏 | `/pages/favorites/favorites` |
| 我的 | `/pages/my/my` |
| 喜欢 | `/pages/likes/likes` |
| 上传 | `/pages/upload/upload` |

分包：

| 分包 | 路径 |
|------|------|
| 详情预览 | `/subpackages/preview/pages/preview/preview` |
| 设置 | `/subpackages/settings/pages/settings/settings` |
| 历史 | `/subpackages/history/pages/history/history` |
| 会员 | `/subpackages/member/pages/member/member` |
| 海报 | `/subpackages/poster/pages/poster/poster` |
| 隐私政策 | `/subpackages/policy/pages/privacy/privacy` |
| 用户协议 | `/subpackages/policy/pages/terms/terms` |

## 设计系统

参见 [DESIGN.md](./DESIGN.md)。

- 字体：PingFang SC / Cabinet Grotesk / Kaiti SC（不用 Inter / Roboto）
- 配色：ink/cream/ember 编辑刊三色 token
- 不使用 emoji 作为 UI 装饰，统一用 SVG mask icons

## 技术栈

- **前端**：微信小程序原生
- **后端**：微信云开发（云函数 + 云数据库 + 云存储）
- **AI**：即梦 API（火山引擎，图像生成）+ DeepSeek（提示词优化、文案）
- **支付**：微信小程序支付

## 项目结构

```
miaosec/
├── miniprogram/
│   ├── app.{js,json,wxss}
│   ├── components/         # 通用组件（含 privacy-popup）
│   ├── custom-tab-bar/     # 自定义底部 tab
│   ├── config/             # 数据 / 常量
│   ├── utils/              # cloud / i18n / theme / poster ...
│   ├── pages/              # 主包页面
│   ├── subpackages/        # 分包（preview/settings/history/member/poster/policy）
│   ├── images/             # 静态图标 + tab 图标
│   ├── privacyDescription.json   # 微信审核必备
│   └── styles/
├── cloudfunctions/
│   ├── ai/                 # AI 生成 + 内容安全 + 创建订单
│   ├── pay-notify/         # 微信支付回调
│   ├── tools/              # 工具列表
│   └── user/               # 用户登录
├── project.config.json
└── project.private.config.json   # 已 gitignore
```

## 上线前检查清单

### 一、云开发控制台

1. 开通云开发，记录环境 ID（默认 `cloud1-d8glhp7pdcd3fffba`，按需改 `app.js`）
2. **数据库**创建 7 个集合：`users` / `ai_usage` / `my_works` / `my_favorites` / `my_uploads` / `orders` / `tools`，配读写权限
3. **云函数**逐个右键「上传并部署：云端安装依赖」（`ai` / `pay-notify` / `tools` / `user`）
4. **环境变量**（云开发控制台 → 云函数 → 环境变量）：

| 函数 | 变量 | 说明 |
|------|------|------|
| `ai` | `JIMENG_AK` `JIMENG_SK` `JIMENG_MODEL` | 火山引擎即梦 |
| `ai` | `DEEPSEEK_API_KEY` `DEEPSEEK_MODEL` | DeepSeek |
| `ai` | `WECHAT_APPID` `WECHAT_MCH_ID` `WECHAT_PAY_KEY` | 微信支付 |
| `ai` | `IS_TEST_MODE` `FREE_DAILY_LIMIT` | 业务开关 |
| `pay-notify` | `WECHAT_APPID` `WECHAT_MCH_ID` `WECHAT_PAY_KEY` | 同上 |
| `user` | `JWT_SECRET` | 自生成 32 位随机串 |

### 二、小程序公众平台

1. **服务器域名 → request 合法域名**：`https://api.deepseek.com` `https://visual.volcengineapi.com`（云函数走不需配，前端直连才需）
2. **隐私接口管理**：申请 `chooseMedia` `getUserInfo` 等隐私接口，每条写用途
3. **类目设置**：选对应类目（工具/教育/摄影等）
4. **基本信息**：补齐备案号、客服联系方式

### 三、合规

- 已接入：`__usePrivacyCheck__` + `privacyDescription.json` + `permission` + `requiredPrivateInfos` + `onNeedPrivacyAuthorization` 弹窗 + 隐私政策页 + 用户协议页 + AI 内容安全审核（msgSecCheck v2）
- 还需替换：`privacyDescription.json` / `subpackages/policy/*.wxml` 中的 `support@miaosec.example.com` → 你的真实联系方式（或改为「设置 → 联系客服」）

## 更新日志

### v1.2.0 (2026-05-07)
- 新增「我的海报」童趣 SHOWCASE 功能
- 上线合规一揽子修复（隐私 / 内容安全 / 权限三件套）
- 移除全部 emoji，统一 SVG mask icons
- 清理死代码 ~180KB，整理 logger 规范

### v1.1.0 (2026-04-04)
- 添加图片详情页
- 集成即梦 API（文生图 / 图生图）
- 优化登录与图片预览

### v1.0.0 (2026-04-04)
- 暖色调 UI 改版
- 用户信息同步

## 许可证

MIT License
