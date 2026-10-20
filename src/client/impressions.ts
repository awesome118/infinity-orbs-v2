import type { ImpressionPostType, ImpressionDeviceType } from '../server/impressions.js';

function detectDeviceType(): ImpressionDeviceType {
  if (typeof navigator === 'undefined') return 'unknown';
  const agent = String(navigator.userAgent ?? '');
  const platform = String(navigator.platform ?? '');
  const touchPoints = Number(navigator.maxTouchPoints ?? 0);

  // iPads may report a Mac platform; multiple touch points distinguish them
  // from ordinary desktop Macs without persisting the raw platform or UA.
  if (/iPad|Tablet|PlayBook|Silk/i.test(agent) || (platform === 'MacIntel' && touchPoints > 1)) {
    return 'tablet';
  }
  if (/Mobi|Android|iPhone|iPod|Windows Phone|IEMobile/i.test(agent)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Records one post preview load. The payload intentionally contains only the
 * post type and a coarse device category; identity and raw user-agent are not sent.
 */
export async function recordPostImpression(postType: ImpressionPostType): Promise<void> {
  try {
    await fetch('/api/impressions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      keepalive: true,
      body: JSON.stringify({ postType, deviceType: detectDeviceType() }),
    });
  } catch {
    // Analytics must never prevent the post preview from rendering.
  }
}
