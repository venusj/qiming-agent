/** 检测当前平台，供设置 data-platform 属性驱动字体回退。 */
export function detectPlatform(): 'darwin' | 'win32' | 'linux' {
  // navigator.userAgentData 在较新的 Chromium 可用，platform 字段更精确，
  // 但未进入标准 TS DOM lib，故通过受限类型断言读取，缺失时回退 platform。
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const ua = (
    (userAgentData?.platform ?? '') ||
    navigator.platform ||
    ''
  ).toLowerCase();
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  return 'linux';
}
