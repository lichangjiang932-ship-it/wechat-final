// config/data.js - 页面静态数据配置

// ==================== 首页 - 分类入口 ====================
const CATEGORIES = [
  { id: 'portrait', name: '写真', icon: '/images/icons/camera.png', bg: '#FBF0E6' },
  { id: 'art', name: '创意', icon: '/images/icons/brush.png', bg: '#F5EBF0' },
  { id: 'id_photo', name: '证件照', icon: '/images/icons/idcard.png', bg: '#E8F0F5' },
  { id: 'anime', name: '二次元', icon: '/images/icons/star.png', bg: '#FFF5E8' },
  { id: 'restore', name: '老照片', icon: '/images/icons/clock.png', bg: '#F0F5E8' },
  { id: 'style', name: '换风格', icon: '/images/icons/magic.png', bg: '#F5F0E8' },
];

// ==================== 首页 - Banner 文案 ====================
const BANNERS = [
  {
    bg: 'warm',
    emoji: '📸',
    badge: '本周热门',
    title: '给自己拍套写真',
    desc: '不用去照相馆，在家就能拍',
    btnText: '试试看',
  },
  {
    bg: 'soft',
    emoji: '🎨',
    badge: '',
    title: '画出心里的画面',
    desc: '想画什么，说出来就行',
    btnText: '开始画',
  },
  {
    bg: 'sage',
    emoji: '✨',
    badge: '新上线',
    title: '证件照也能很好看',
    desc: '自动换背景，自然又精神',
    btnText: '制作',
  },
];

// ==================== 首页 - 热门模板 ====================
const HOT_TEMPLATES = [
  { id: 't1', name: '证件照', tag: '热门', tagType: 'hot', cover: '/images/covers/cover-portrait.jpg', uses: '12.8万' },
  { id: 't2', name: '日系写真', tag: '新品', tagType: 'new', cover: '/images/covers/cover-art.jpg', uses: '8.6万' },
  { id: 't3', name: '国风', tag: '', tagType: '', cover: '/images/covers/cover-chinese.jpg', uses: '6.3万' },
  { id: 't4', name: '水彩风', tag: '', tagType: '', cover: '/images/covers/cover-watercolor.jpg', uses: '5.1万' },
  { id: 't5', name: '老照片修复', tag: '', tagType: '', cover: '/images/covers/cover-cyberpunk.jpg', uses: '4.8万' },
];

// ==================== 首页 - 灵感画廊图片 ====================
const INSPIRE_IMAGES = {
  warm: '/images/covers/inspire-warm.jpg',
  cream: '/images/covers/cover-anime.jpg',
  sage: '/images/covers/cover-clay.jpg',
  sunset: '/images/covers/cover-portrait.jpg',
  rose: '/images/covers/cover-chinese.jpg',
};

// ==================== 首页 - 社区精选图片 ====================
const COMMUNITY_IMAGES = [
  '/images/covers/cover-portrait.jpg',
  '/images/covers/cover-art.jpg',
  '/images/covers/cover-chinese.jpg',
  '/images/covers/cover-cyberpunk.jpg',
  '/images/covers/cover-clay.jpg',
  '/images/covers/cover-watercolor.jpg',
];

// ==================== 创作页 - 创作模式 ====================
const CREATE_MODES = [
  { id: 'text2img', name: 'AI绘画', icon: '🎨', desc: '文字生成图片' },
  { id: 'img2img', name: '图生图', icon: '🖼️', desc: '照片变风格' },
];

// ==================== 创作页 - 画幅比例 ====================
const RATIOS = [
  { value: '1:1', label: '1:1', w: 1, h: 1 },
  { value: '3:4', label: '3:4', w: 3, h: 4 },
  { value: '4:3', label: '4:3', w: 4, h: 3 },
  { value: '9:16', label: '9:16', w: 9, h: 16 },
  { value: '16:9', label: '16:9', w: 16, h: 9 },
];

// ==================== 创作页 - 风格模板 ====================
const STYLES = [
  { id: 'real', name: '写实', emoji: '📷', prompt: ', photorealistic, ultra detailed, 8k, DSLR', color: '#C8B8A8' },
  { id: 'anime', name: '动漫', emoji: '🌸', prompt: ', anime style, vibrant, cel shading', color: '#E8A8B8' },
  { id: 'oil', name: '油画', emoji: '🎨', prompt: ', oil painting, rich textures, brushstrokes', color: '#D4A878' },
  { id: 'watercolor', name: '水彩', emoji: '💧', prompt: ', watercolor, soft flowing, delicate', color: '#88B8C8' },
  { id: 'sketch', name: '素描', emoji: '✏️', prompt: ', pencil sketch, detailed linework', color: '#A8A8A8' },
  { id: 'chinese', name: '国风', emoji: '🎋', prompt: ', Chinese ink painting, traditional', color: '#8EAD7A' },
  { id: 'cyber', name: '赛博', emoji: '🌃', prompt: ', cyberpunk, neon, futuristic', color: '#6878C8' },
  { id: '3d', name: '3D', emoji: '🔮', prompt: ', 3D render, octane, cinematic lighting', color: '#A88BC8' },
  { id: 'clay', name: '黏土', emoji: '🧸', prompt: ', clay render, cute, soft', color: '#C8A898' },
  { id: 'pixel', name: '像素', emoji: '👾', prompt: ', pixel art, 16-bit, retro', color: '#78C8A8' },
  { id: 'comic', name: '漫画', emoji: '💥', prompt: ', comic book, bold lines, pop art', color: '#C8888C' },
  { id: 'fantasy', name: '梦幻', emoji: '✨', prompt: ', dreamy, ethereal, pastel', color: '#C8A8D4' },
];

// ==================== 创作页 - 快捷提示词 ====================
const QUICK_PROMPTS = [
  '橘猫趴在窗台晒太阳',
  '赛博朋克城市，霓虹灯',
  '水墨山水',
  '穿jk的少女，樱花树下',
  '宇航员，月球',
  '一杯咖啡，静物',
];

// ==================== 创作页 - 会员价格 ====================
const VIP_PRICES = {
  month: { label: '月度会员', price: '¥19.9', original: '¥39.9', unit: '/月' },
  year: { label: '年度会员', price: '¥199', original: '¥399', unit: '/年' },
};

// ==================== 分类映射配置 ====================
const CATEGORY_MAP = {
  id_photo: 'real',
  portrait: 'real',
  anime: 'anime',
  art: 'chinese',
  style: 'cyber',
  restore: 'real',
};

module.exports = {
  // 首页
  CATEGORIES,
  BANNERS,
  HOT_TEMPLATES,
  INSPIRE_IMAGES,
  COMMUNITY_IMAGES,
  // 创作页
  CREATE_MODES,
  RATIOS,
  STYLES,
  QUICK_PROMPTS,
  VIP_PRICES,
  CATEGORY_MAP,
};