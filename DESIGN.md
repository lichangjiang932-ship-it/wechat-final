# 照片工坊 - DESIGN.md

## 1. Visual Theme & Atmosphere

### Design Philosophy
- **Warm & Authentic**: 暖色调、真实感、像朋友一样说话
- **Minimal & Clean**: 简约克制，留白充足，不堆砌元素
- **Human-centered**: 以用户为中心，自然流畅的交互

### Mood Keywords
温暖、质感、真实、舒适、专业、亲切

### Visual Density
- 中等密度，呼吸感强
- 卡片式布局，圆角柔和
- 避免过度装饰，内容优先

---

## 2. Color Palette & Roles

### Primary Colors
| Name | Hex | Role |
|------|-----|------|
| Caramel | `#C9956B` | 主色调，按钮、高亮、选中状态 |
| Caramel Dark | `#B07D55` | 主色悬停/按下状态 |
| Warm Brown Black | `#3A3530` | 主要文字颜色 |
| Warm Gray Brown | `#7A7268` | 次要文字、图标 |
| Paper White | `#F8F6F3` | 页面背景色 |
| Card White | `#FFFFFF` | 卡片背景 |

### Semantic Colors
| Name | Hex | Role |
|------|-----|------|
| Success | `#07C160` | 成功状态、做同款按钮 |
| Error | `#FF6B6B` | 错误提示、删除操作 |
| Warning | `#FFB800` | 警告提示 |
| Text Hint | `#9A9288` | 提示文字、占位符 |
| Border | `#F0EDE8` | 边框、分割线 |

### Gradient Patterns
- **Primary Gradient**: `linear-gradient(135deg, #C9956B 0%, #B07D55 100%)` - 按钮、会员卡片
- **Soft Shadow**: `0 4rpx 20rpx rgba(0,0,0,0.08)` - 卡片阴影

---

## 3. Typography Rules

### Font Family
- **Primary**: System font stack (PingFang SC, Hiragino Sans GB, Microsoft YaHei)
- **Fallback**: sans-serif

### Type Scale
| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1 | 48rpx | 700 | 1.2 | 页面大标题 |
| H2 | 40rpx | 600 | 1.3 | 区块标题 |
| H3 | 36rpx | 600 | 1.3 | 卡片标题 |
| H4 | 32rpx | 600 | 1.4 | 导航标题 |
| Body | 28rpx | 400 | 1.5 | 正文内容 |
| Small | 24rpx | 400 | 1.5 | 辅助文字 |
| Caption | 20rpx | 400 | 1.4 | 标签、时间 |

### Typography Patterns
- 标题使用暖棕黑 `#3A3530`
- 正文使用暖灰棕 `#7A7268`
- 提示文字使用浅灰 `#9A9288`
- 重要数字使用焦糖色 `#C9956B`

---

## 4. Component Stylings

### Buttons

#### Primary Button
```
Background: #C9956B
Color: #FFFFFF
Padding: 20rpx 48rpx
Border Radius: 50rpx (pill shape)
Font Size: 28rpx
Font Weight: 600
Shadow: 0 4rpx 16rpx rgba(201, 149, 107, 0.3)
Hover: background #B07D55
```

#### Secondary Button
```
Background: transparent
Border: 2rpx solid #C9956B
Color: #C9956B
Padding: 18rpx 46rpx
Border Radius: 50rpx
```

#### Action Button (Green)
```
Background: #07C160
Color: #FFFFFF
Padding: 8rpx 24rpx
Border Radius: 24rpx
Font Size: 22rpx
```

### Cards

#### Standard Card
```
Background: #FFFFFF
Border Radius: 24rpx
Padding: 32rpx
Shadow: 0 4rpx 20rpx rgba(0,0,0,0.06)
```

#### Template Card
```
Width: 240rpx
Border Radius: 16rpx
Overflow: hidden
Image: aspect-fill, rounded top
```

### Inputs

#### Text Input
```
Background: #F8F6F3
Border: 2rpx solid transparent
Border Radius: 16rpx
Padding: 24rpx 28rpx
Font Size: 28rpx
Focus Border: #C9956B
Placeholder Color: #9A9288
```

### Navigation

#### Tab Bar
```
Background: #FFFFFF
Height: 100rpx + safe-area
Active Color: #C9956B
Inactive Color: #9A9288
Icon Size: 48rpx
Text Size: 20rpx
```

#### Custom Nav Bar
```
Height: 44px + statusBarHeight
Background: var(--bg-page) or transparent
Title: 34rpx, weight 600, centered
```

---

## 5. Layout Principles

### Spacing Scale
| Token | Value | Usage |
|-------|-------|-------|
| xs | 8rpx | 图标间距、紧凑元素 |
| sm | 16rpx | 组件内间距 |
| md | 24rpx | 卡片内边距、列表间距 |
| lg | 32rpx | 区块间距 |
| xl | 48rpx | 大区块分隔 |

### Grid System
- 移动端：单列为主，瀑布流双列
- 边距：24rpx 左右安全边距
- 卡片间隙：12rpx - 24rpx

### Container Patterns
- 页面内容区：`padding: 0 24rpx`
- 卡片内边距：`padding: 24rpx - 32rpx`
- 按钮高度：最小 80rpx（易点击）

---

## 6. Depth & Elevation

### Shadow System
| Level | Shadow | Usage |
|-------|--------|-------|
| xs | `0 2rpx 8rpx rgba(0,0,0,0.04)` | 轻微浮起 |
| sm | `0 4rpx 16rpx rgba(0,0,0,0.06)` | 卡片默认 |
| md | `0 8rpx 24rpx rgba(0,0,0,0.08)` | 弹窗、悬浮按钮 |
| lg | `0 12rpx 40rpx rgba(0,0,0,0.12)` | 模态框 |

### Surface Hierarchy
1. **Page Background**: `#F8F6F3` - 最底层
2. **Cards**: `#FFFFFF` + shadow - 内容层
3. **Floating Elements**: `#FFFFFF` + larger shadow - 悬浮层
4. **Modals**: `#FFFFFF` + overlay backdrop - 模态层

---

## 7. Do's and Don'ts

### Do's
- ✅ 使用暖色调配色，保持视觉温暖
- ✅ 保持充足的留白和呼吸感
- ✅ 使用圆角卡片，柔和视觉
- ✅ 文字使用自然的口语化表达
- ✅ 按钮使用 pill shape（圆角胶囊）
- ✅ 图片使用圆角，避免直角

### Don'ts
- ❌ 不要使用冷色调（蓝色、紫色）作为主色
- ❌ 不要过度装饰，避免视觉噪音
- ❌ 不要使用直角卡片（保持圆角）
- ❌ 不要使用过小的点击区域（最小 80rpx）
- ❌ 不要使用纯黑色文字（使用暖棕黑）
- ❌ 不要使用过多的颜色（保持克制）

---

## 8. Responsive Behavior

### Breakpoints
- Mobile: 375rpx - 750rpx (默认)
- Large Mobile: > 750rpx (平板适配)

### Touch Targets
- 最小点击区域：80rpx × 80rpx
- 按钮高度：80rpx - 96rpx
- 列表项高度：最小 96rpx

### Layout Adaptations
- 首页 Banner：全宽，高度自适应
- 瀑布流：双列，间距 12rpx
- 模板列表：横向滚动，固定宽度卡片

---

## 9. Agent Prompt Guide

### Quick Color Reference
```
Primary: #C9956B (焦糖色)
Text Primary: #3A3530 (暖棕黑)
Text Secondary: #7A7268 (暖灰棕)
Background: #F8F6F3 (纸白)
Card: #FFFFFF (纯白)
Success: #07C160
Error: #FF6B6B
```

### Common Component Prompts

**Button**: "Create a warm caramel (#C9956B) pill-shaped button with white text, 80rpx height, subtle shadow"

**Card**: "Design a white card with 24rpx border-radius, soft shadow, 32rpx padding"

**Input**: "Create a warm gray input field with 16rpx border-radius, caramel focus state"

**Navigation**: "Design a custom navigation bar with centered title, warm background"

---

## 10. Animation & Interaction

### Transition Timing
- **Fast**: 150ms - 微交互（按钮按下）
- **Normal**: 300ms - 页面切换、弹窗
- **Slow**: 500ms - 骨架屏消失

### Easing Functions
- **Standard**: `ease-out` - 大多数动画
- **Bounce**: `cubic-bezier(0.34, 1.56, 0.64, 1)` - 弹性效果

### Common Animations
- **Button Press**: scale(0.96), 100ms
- **Card Hover**: translateY(-4rpx), shadow increase
- **Page Enter**: fade in + slide up, 300ms
- **Skeleton**: pulse opacity 0.5-1, 1.5s loop

---

## 11. Iconography

### Icon Style
- 线性图标，2rpx 描边
- 圆角端点
- 24rpx - 48rpx 尺寸范围

### Icon Usage
- 金刚区：48rpx，彩色背景
- TabBar：40rpx，选中时焦糖色
- 列表项：32rpx，灰色

---

## 12. Image Guidelines

### Image Treatment
- 使用圆角（16rpx - 24rpx）
- 封面图：aspect-fill，保持比例
- 头像：圆形，带边框

### Placeholder
- 骨架屏：浅灰色脉冲动画
- 错误：默认占位图

---

*Last Updated: 2026-04-06*
*Version: 1.1.0*
