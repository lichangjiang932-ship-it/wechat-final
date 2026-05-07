/**
 * config/images.js - 图片资源统一管理
 *
 * 所有网络图片集中管理，便于后期批量替换
 * 大图走网络，小图标保留本地（稳定 + 体积小）
 */

const LOCAL_BASE = '/images';

/**
 * 网络图片 URL（用户提供的图片链接）
 * 替换时只需修改此处
 */
const NETWORK = {
  // ——— 热门模板封面 ———
  portrait: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmPRKgrmqjZobUTRHR2kza0ozXJqGF183AX7fnsbQ32w&s',
  art: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsX4DvIc83ZtMnAWdyw2jZpMvZbfbHC5dgDw&s',
  chinese: 'https://gd-hbimg.huaban.com/3a7d9770b855109e1e9a96adbbad8240020934481bf4e-A3Qeof_fw658',
  watercolor: 'https://gd-hbimg.huaban.com/bfcded263b49ac3f6e8c13b9e88eb69e2fd5d0d0118aa-aHeMJf_fw658',
  cyberpunk: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiWMQd8rQu9RTyI36ilbdNRo4qESnT5RXu0g&s',
  oil: 'https://pic4.zhimg.com/v2-75e0155df3e5919b2ca264478373fb6d_1440w.jpg',
  anime: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHkapgMP2xZ1lf8bYk1t8NUXOK2r7WdtVdcg&s',
  clay: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQPk9HYNFNJdfzw8aT8VXMrXf1AVDUQaFz1VQ&s',

  // ——— 灵感画廊 ———
  warm: 'https://pic4.zhimg.com/v2-75e0155df3e5919b2ca264478373fb6d_1440w.jpg',
  cream: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHkapgMP2xZ1lf8bYk1t8NUXOK2r7WdtVdcg&s',
  sage: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQPk9HYNFNJdfzw8aT8VXMrXf1AVDUQaFz1VQ&s',
  sunset: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmPRKgrmqjZobUTRHR2kza0ozXJqGF183AX7fnsbQ32w&s',
  rose: 'https://gd-hbimg.huaban.com/3a7d9770b855109e1e9a96adbbad8240020934481bf4e-A3Qeof_fw658',

  // ——— 默认头像 ———
  defaultAvatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/POgE4845IwQibibGkSiciaY7dR4fF8IcQ0YI0k6p5eQJ0J0J0J0J0J0J0J0J0J0J0J0J0J0J0J0J0J0J0J0/132',
};

/**
 * 本地图标（体积小，保留本地保证稳定加载）
 */
const LOCAL = {
  // TabBar
  tabHome: `${LOCAL_BASE}/tab-home.png`,
  tabHomeActive: `${LOCAL_BASE}/tab-home-active.png`,
  tabCreate: `${LOCAL_BASE}/tab-create.png`,
  tabCreateActive: `${LOCAL_BASE}/tab-create-active.png`,
  tabDiscover: `${LOCAL_BASE}/tab-discover.png`,
  tabDiscoverActive: `${LOCAL_BASE}/tab-discover-active.png`,
  tabMy: `${LOCAL_BASE}/tab-my.png`,
  tabMyActive: `${LOCAL_BASE}/tab-my-active.png`,
  // 功能图标
  iconCamera: `${LOCAL_BASE}/icons/camera.png`,
  iconBrush: `${LOCAL_BASE}/icons/brush.png`,
  iconIdcard: `${LOCAL_BASE}/icons/idcard.png`,
  iconStar: `${LOCAL_BASE}/icons/star.png`,
  iconClock: `${LOCAL_BASE}/icons/clock.png`,
  iconMagic: `${LOCAL_BASE}/icons/magic.png`,
};

/**
 * 获取网络图片 URL
 * @param {string} key - NETWORK 中的 key
 * @returns {string}
 */
function getNetwork(key) {
  return NETWORK[key] || '';
}

/**
 * 获取本地图片路径
 * @param {string} key - LOCAL 中的 key
 * @returns {string}
 */
function getLocal(key) {
  return LOCAL[key] || '';
}

module.exports = {
  NETWORK,
  LOCAL,
  getNetwork,
  getLocal,
  LOCAL_BASE,
};
