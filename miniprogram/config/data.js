// config/data.js - 页面静态数据配置

// ==================== 云存储图片根路径 ====================
const DEFAULT_CLOUD_BASE = 'cloud://cloud1-d8glhp7pdcd3fffba.636c-cloud1-d8glhp7pdcd3fffba-1423601483/images/';
function resolveCloudBase() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const configured = wx.getStorageSync('CLOUD_IMAGES_BASE');
      if (configured && typeof configured === 'string') {
        return configured.endsWith('/') ? configured : `${configured}/`;
      }
    }
  } catch (_) {}
  return DEFAULT_CLOUD_BASE;
}
const CLOUD_BASE = resolveCloudBase();
const img = (name) => CLOUD_BASE + name;

// ==================== 首页 - Banner 文案 ====================
const BANNERS = [
  {
    cover: img('cover-portrait.jpg'),
    badge: '本周热门',
    title: '琥珀时刻',
    desc: '记录当下最温柔的光线',
    btnText: '探索',
  },
  {
    cover: img('cover-art.jpg'),
    badge: '',
    title: '画出心里的画面',
    desc: '想画什么，说出来就行',
    btnText: '开始画',
  },
  {
    cover: img('cover-chinese.jpg'),
    badge: '新上线',
    title: '国风写真',
    desc: '东方美学，一镜千年',
    btnText: '制作',
  },
];

// ==================== 首页 - 热门模板 ====================
const HOT_TEMPLATES = [
  { id: 't1', name: '证件照',   tag: '热门', tagType: 'hot', cover: img('cover-portrait.jpg'),   uses: '12.8万' },
  { id: 't2', name: '日系写真', tag: '新品', tagType: 'new', cover: img('cover-art.jpg'),        uses: '8.6万' },
  { id: 't3', name: '国风',     tag: '',     tagType: '',    cover: img('cover-chinese.jpg'),     uses: '6.3万' },
  { id: 't4', name: '水彩风',   tag: '',     tagType: '',    cover: img('cover-watercolor.jpg'),  uses: '5.1万' },
  { id: 't5', name: '赛博朋克', tag: '',     tagType: '',    cover: img('cover-cyberpunk.jpg'),   uses: '4.8万' },
];

// ==================== 首页 - 灵感画廊图片 ====================
const INSPIRE_IMAGES = {
  warm:  img('inspire-warm.jpg'),
  cream: img('cover-anime.jpg'),
  sage:  img('cover-clay.jpg'),
  rose:  img('cover-chinese.jpg'),
  cyber: img('cover-cyberpunk.jpg'),
};

// ==================== 首页 - 社区精选图片 ====================
const COMMUNITY_IMAGES = [
  img('cover-portrait.jpg'),
  img('cover-art.jpg'),
  img('cover-chinese.jpg'),
  img('cover-cyberpunk.jpg'),
  img('cover-clay.jpg'),
  img('cover-watercolor.jpg'),
];

// ==================== 创作页 - 创作模式 ====================
// icon 字段为 SVG class（wxml 可拼 "ic ic-{{mode.icon}}"）
const CREATE_MODES = [
  { id: 'text2img', name: 'AI绘画', icon: 'spark',  desc: '文字生成图片' },
  { id: 'img2img',  name: '图生图', icon: 'camera', desc: '照片变风格'   },
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
  { id: 'real', name: '写实', emoji: '', prompt: ', photorealistic, ultra detailed, 8k, DSLR', color: '#C8B8A8' },
  { id: 'anime', name: '动漫', emoji: '', prompt: ', anime style, vibrant, cel shading', color: '#E8A8B8' },
  { id: 'oil', name: '油画', emoji: '', prompt: ', oil painting, rich textures, brushstrokes', color: '#D4A878' },
  { id: 'watercolor', name: '水彩', emoji: '', prompt: ', watercolor, soft flowing, delicate', color: '#88B8C8' },
  { id: 'sketch', name: '素描', emoji: '', prompt: ', pencil sketch, detailed linework', color: '#A8A8A8' },
  { id: 'chinese', name: '国风', emoji: '', prompt: ', Chinese ink painting, traditional', color: '#8EAD7A' },
  { id: 'cyber', name: '赛博', emoji: '', prompt: ', cyberpunk, neon, futuristic', color: '#6878C8' },
  { id: '3d', name: '3D', emoji: '', prompt: ', 3D render, octane, cinematic lighting', color: '#A88BC8' },
  { id: 'clay', name: '黏土', emoji: '', prompt: ', clay render, cute, soft', color: '#C8A898' },
  { id: 'pixel', name: '像素', emoji: '', prompt: ', pixel art, 16-bit, retro', color: '#78C8A8' },
  { id: 'comic', name: '漫画', emoji: '', prompt: ', comic book, bold lines, pop art', color: '#C8888C' },
  { id: 'fantasy', name: '梦幻', emoji: '', prompt: ', dreamy, ethereal, pastel', color: '#C8A8D4' },
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
  year: { label: '年度会员', price: '¥199.9', original: '¥399', unit: '/年' },
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
