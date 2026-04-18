# 照片工坊 - 部署指南

## 环境准备

### 1. 微信开发者工具
下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 开通云开发
1. 在微信开发者工具中打开项目
2. 点击「云开发」按钮
3. 同意协议，开通环境
4. 记录环境 ID

### 3. 获取 AppID
在 [微信公众平台](https://mp.weixin.qq.com/) 注册小程序，获取 AppID

---

## 项目配置

### 1. 修改 app.js
```javascript
// miniprogram/app.js
const CLOUD_ENV = '你的云环境ID'; // 例如: cloud1-7g56gaj702c99bfd
```

### 2. 配置 project.config.json
```json
{
  "appid": "你的AppID",
  "projectname": "photos-studio"
}
```

### 3. 配置 API 密钥

在云开发控制台 → 云函数 → ai → 环境变量中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `JIMENG_AK` | 即梦 AccessKey | - |
| `JIMENG_SK` | 即梦 SecretKey | - |
| `JIMENG_MODEL` | 模型名称 | `jimeng-v4` |
| `DOUBAO_API_KEY` | 豆包 API Key（可选） | - |

---

## 云函数部署

### 1. 上传所有云函数
```bash
# 在微信开发者工具中
# 右键每个云函数目录 → 上传并部署：云端安装依赖

# 需要部署的云函数：
- cloudfunctions/ai
- cloudfunctions/user
- cloudfunctions/tools
- cloudfunctions/pay-notify
```

### 2. 创建数据库集合

在云开发控制台 → 数据库中创建以下集合：

| 集合名 | 权限 | 说明 |
|--------|------|------|
| `users` | 仅创建者可读写 | 用户信息 |
| `ai_usage` | 仅创建者可读写 | AI 使用记录 |
| `my_works` | 仅创建者可读写 | 用户作品 |
| `my_favorites` | 仅创建者可读写 | 用户收藏 |

### 3. 配置支付（可选）

如需开通会员支付功能：
1. 在微信支付商户平台申请支付能力
2. 配置 `pay-notify` 云函数的微信支付密钥
3. 设置支付回调 URL

---

## 小程序发布

### 1. 本地测试
1. 点击「预览」扫码测试
2. 测试所有核心功能

### 2. 上传代码
1. 点击「上传」
2. 填写版本号和备注
3. 确认上传

### 3. 提交审核
1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入「版本管理」
3. 提交审核

### 4. 发布上线
审核通过后，点击「发布」

---

## 常见问题

### Q: 云函数调用失败
A: 检查云函数是否已正确部署，环境变量是否配置

### Q: 图片无法显示
A: 检查云存储权限设置，确保为「所有用户可读」

### Q: AI 生成失败
A: 检查即梦 API 密钥是否配置正确

### Q: 登录失败
A: 检查云开发环境是否开通

---

## 版本更新

每次更新代码后：
1. 右键云函数 → 上传并部署
2. 重新上传小程序代码
3. 提交审核

---

*最后更新: 2026-04-06*
