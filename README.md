# 妙摄 Miaosec — AI 图像创作小程序

编辑刊风格 AI 图像创作小程序，支持 AI 写真、风格迁移、童趣海报。基于微信云开发，下载即用。

---

## ▶ 5 分钟下载即用

### Step 1 · 下载

```bash
git clone https://github.com/lichangjiang932-ship-it/wechat-final.git miaosec
cd miaosec
```

### Step 2 · 安装前端依赖（仅 1 个）

```bash
cd miniprogram
npm install
cd ..
```

> 这一步会装 `@chenglou/pretext`（用于海报文字测量），约 200KB。

### Step 3 · 微信开发者工具导入

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 「导入项目」→ 选择 `miaosec/` 目录
3. AppID 用你自己的（或测试号）

### Step 4 · 选择启动模式

#### A. 仅前端预览（无 AI 功能，5 分钟看效果）

直接编译运行即可。所有页面都能进，但 AI 生成会报错——这是预期的。

#### B. 完整功能（接入云开发，30 分钟）

参考下方"完整部署"章节。

---

## 完整部署（接入云开发）

### 1. 开通云开发

1. 微信开发者工具点「云开发」按钮 → 同意协议 → 选「按量付费」（个人小项目几乎不花钱）
2. 记录环境 ID（形如 `cloud1-d8glhp7pdcd3fffba`）
3. 改 `miniprogram/app.js` 第 1 行：

```javascript
const CLOUD_ENV = '你的云环境ID';
```

### 2. 数据库（云开发控制台 → 数据库）

新建 7 个集合，全部权限设为「仅创建者可读写」：

```
users / ai_usage / my_works / my_favorites / my_uploads / orders / tools
```

### 3. 云函数部署（4 个）

逐个右键 → **「上传并部署：云端安装依赖」**：

| 函数 | 用途 |
|------|------|
| `ai` | AI 生成 + 内容安全 + 创建订单 |
| `pay-notify` | 微信支付回调 |
| `tools` | 工具列表 |
| `user` | 登录 + JWT |

### 4. 环境变量（云开发控制台 → 云函数 → 各函数 → 环境变量）

参考根目录 `.env.example` 的清单，按需填：

```
ai 函数：
  JIMENG_AK / JIMENG_SK / JIMENG_MODEL
  DEEPSEEK_API_KEY / DEEPSEEK_MODEL
  WECHAT_APPID / WECHAT_MCH_ID / WECHAT_PAY_KEY
  IS_TEST_MODE=true / FREE_DAILY_LIMIT=5

pay-notify 函数：
  WECHAT_APPID / WECHAT_MCH_ID / WECHAT_PAY_KEY

user 函数：
  JWT_SECRET=（随机 32 位字符串，可用 openssl rand -hex 16）
```

**API 申请入口**：
- 即梦 → [火山引擎方舟 jimeng-v4](https://www.volcengine.com/product/jimeng)
- DeepSeek → https://platform.deepseek.com/api_keys
- 微信支付 → https://pay.weixin.qq.com（需企业资质）

### 5. 提审准备

#### 隐私接口（小程序公众平台 → 设置 → 隐私接口管理）

申请：`chooseMedia` / `getUserInfo` / `writePhotosAlbum`，每条写明用途。

#### 类目（小程序公众平台 → 设置 → 基本设置）

工具 / 教育 / 摄影 任选适配项。

#### 联系方式

把 `subpackages/policy/pages/privacy/privacy.wxml` 和 `terms/terms.wxml` 里的 `support@miaosec.example.com` 替换成你的真实邮箱/电话。

---

## 项目结构

```
miaosec/
├── miniprogram/                # 小程序前端
│   ├── app.{js,json,wxss}
│   ├── components/             # 通用组件（含 privacy-popup）
│   ├── custom-tab-bar/         # 自定义底部 tab
│   ├── pages/                  # 主包 7 页
│   │   ├── index/              # 首页
│   │   ├── discover/           # 发现
│   │   ├── create/             # AI 创作
│   │   ├── favorites/          # 收藏
│   │   ├── likes/              # 喜欢
│   │   ├── upload/             # 上传
│   │   └── my/                 # 我的（含童趣海报入口）
│   ├── subpackages/            # 7 个分包
│   │   ├── preview/            # 详情预览
│   │   ├── settings/           # 设置
│   │   ├── history/            # 历史
│   │   ├── member/             # 会员
│   │   ├── poster/             # 童趣海报（Canvas 绘制）
│   │   └── policy/             # 隐私政策 + 用户协议
│   ├── services/               # api / monitor / storage
│   ├── utils/                  # cloud / i18n / theme / poster / textMeasure
│   ├── config/                 # constants / data
│   ├── images/                 # 静态图标 + tab 图标
│   ├── styles/                 # animations
│   ├── privacyDescription.json # 微信审核必备
│   ├── package.json
│   └── sitemap.json
├── cloudfunctions/             # 云函数（npm install 在云端做，不要本地装）
│   ├── ai/
│   ├── pay-notify/
│   ├── tools/
│   └── user/
├── .env.example                # 环境变量清单（仅参考，不需要本地 .env）
├── .gitignore
├── DESIGN.md                   # 设计系统（字体 / 配色 / 组件）
├── project.config.json
└── README.md
```

---

## 设计系统

详见 [DESIGN.md](./DESIGN.md)。核心约束：

- **字体**：PingFang SC / Cabinet Grotesk / Kaiti SC（不用 Inter / Roboto）
- **配色**：ink / cream / ember 编辑刊三色 token
- **图标**：SVG mask，不用 emoji 作为 UI 装饰
- **隐私组件**：14 个页面全部接入 `privacy-popup`

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | 微信小程序原生 |
| 后端 | 微信云开发（云函数 + 云数据库 + 云存储） |
| 图像 AI | 即梦 v4（火山引擎） |
| 文本 AI | DeepSeek |
| 支付 | 微信小程序支付 V3 |
| 内容安全 | 微信 msgSecCheck v2 |

---

## 合规清单

已内置（无需额外配置）：

- `__usePrivacyCheck__: true`
- `privacyDescription.json`（微信审核必备清单）
- `permission` 三件套：`writePhotosAlbum` / `album` / `camera`
- `requiredPrivateInfos`
- `privacy-popup` 全局组件 + `onNeedPrivacyAuthorization` 接入
- 14 页面全部注入隐私弹窗
- 隐私政策页 + 用户协议页（编辑风长文）
- AI 内容安全审核（msgSecCheck v2）覆盖 generate / img2img / caption 三入口
- packOptions.ignore 防 node_modules 误打包

提审前手动替换：

- `subpackages/policy/pages/{privacy,terms}/*.wxml` 里的 `support@miaosec.example.com`
- `privacyDescription.json` 末尾的联系方式

---

## 故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 启动报 "云环境未初始化" | `app.js` 没改 CLOUD_ENV | 改第 1 行常量 |
| 编译报 "找不到 @chenglou/pretext" | 没装前端依赖 | `cd miniprogram && npm install` |
| 云函数调用报 "FunctionName not found" | 函数没部署 | 右键云函数→上传并部署 |
| AI 生成返回 401 | 即梦/DeepSeek key 没配 | 云开发控制台填环境变量 |
| 支付回调 404 | pay-notify 没建 HTTP 触发器 | 云函数详情→触发器→新建 HTTP |
| 提审驳回"缺隐私协议" | 联系方式没改 | 改 `support@miaosec.example.com` 为真实邮箱 |
| 小程序包超 2MB | node_modules 误打包 | 检查 `project.config.json` 的 `packOptions.ignore` |

---

## 更新日志

### v1.2.0 (2026-05-07)
- 新增「我的海报」童趣 SHOWCASE 功能
- 上线合规一揽子修复（隐私/内容安全/权限三件套）
- 14 页全部接入隐私弹窗
- 移除全部 emoji，统一 SVG mask icons
- 清理冗余文档、测试残留依赖

### v1.1.0 (2026-04-04)
- 集成即梦 API（文生图 / 图生图）
- 添加图片详情页、登录优化

### v1.0.0 (2026-04-04)
- 暖色调 UI 改版，核心功能上线

---

## 许可证

MIT License
