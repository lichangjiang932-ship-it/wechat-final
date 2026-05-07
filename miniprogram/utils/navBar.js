// utils/navBar.js - 导航栏工具（统一处理废弃API警告）

/**
 * 计算导航栏高度
 * 使用新版 API 避免 getSystemInfoSync 废弃警告
 * @returns {{ navBarHeight: number, statusBarHeight: number, menuBtn: object }}
 */
function computeNavBar() {
  try {
    // 使用新版 API
    const windowInfo = wx.getWindowInfo();
    const menuBtn = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = windowInfo.statusBarHeight;
    const navBarHeight = (menuBtn.top - statusBarHeight) * 2 + menuBtn.height + statusBarHeight;
    
    return { navBarHeight, statusBarHeight, menuBtn };
  } catch (e) {
    console.warn('[navBar] 计算失败:', e.message);
    return { navBarHeight: 88, statusBarHeight: 20, menuBtn: null };
  }
}

/**
 * 获取安全区域信息
 * @returns {{ safeArea: object, safeBottom: number }}
 */
function getSafeArea() {
  try {
    const windowInfo = wx.getWindowInfo();
    const safeArea = windowInfo.safeArea;
    const safeBottom = windowInfo.screenHeight - safeArea.bottom;
    return { safeArea, safeBottom };
  } catch (e) {
    return { safeArea: null, safeBottom: 0 };
  }
}

/**
 * 获取设备信息
 * @returns {object}
 */
function getDeviceInfo() {
  try {
    return wx.getDeviceInfo();
  } catch (e) {
    return { platform: 'unknown' };
  }
}

module.exports = {
  computeNavBar,
  getSafeArea,
  getDeviceInfo,
};
