# 照片工坊 - 贡献指南

## 开发环境

### 1. 环境要求
- Node.js >= 16
- 微信开发者工具 >= 1.06
- 微信小程序 AppID

### 2. 克隆项目
```bash
git clone <repository-url>
cd wechat-miniprogram
```

### 3. 安装依赖
```bash
# 安装云函数依赖
cd cloudfunctions/ai
npm install

cd ../user
npm install

cd ../tools
npm install

# 其他云函数...
```

### 4. 配置项目
1. 用微信开发者工具导入项目
2. 开通云开发环境
3. 修改 `miniprogram/app.js` 中的 `CLOUD_ENV` 为你的云环境ID

### 5. 配置 API 密钥
在云开发控制台 → 云函数 → ai → 环境变量中添加：
```
JIMENG_AK=你的AccessKey
JIMENG_SK=你的SecretKey
JIMENG_MODEL=jimeng-v4
```

## 开发规范

### 代码风格
- 使用 2 空格缩进
- 使用单引号字符串
- 变量命名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE

### 文件结构
```
miniprogram/
├── pages/          # 页面
├── components/      # 组件
├── utils/          # 工具函数
├── images/         # 图片资源
├── config/         # 配置文件
└── app.js          # 入口文件

cloudfunctions/
├── ai/             # AI处理云函数
├── user/           # 用户云函数
├── tools/          # 工具云函数
└── pay-notify/     # 支付回调云函数
```

### Git 提交规范
```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具相关
```

### 分支策略
- `main`: 主分支，稳定版本
- `develop`: 开发分支
- `feature/*`: 功能分支
- `fix/*`: 修复分支

## 测试

### 本地测试
1. 使用微信开发者工具预览
2. 检查控制台无错误
3. 测试核心功能流程

### 云函数测试
1. 右键云函数 → 上传并部署
2. 在云开发控制台测试调用

## 发布流程

1. 确保所有功能测试通过
2. 更新版本号和日志
3. 提交 Pull Request
4. 审核后合并到 main
5. 在微信开发者工具上传代码
6. 提交审核

## 问题反馈

如有问题，请通过以下方式反馈：
- 提交 GitHub Issue
- 联系开发者
