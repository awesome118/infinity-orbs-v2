export type ImpressionPostType = 'main-game' | 'orb-share' | 'frenzy';
type ImpressionDeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export function classifyImpressionDeviceType(
  agentValue: unknown,
  platformValue: unknown = '',
  touchPointsValue: unknown = 0,
): ImpressionDeviceType {
  const agent = typeof agentValue === 'string' ? agentValue : '';
  const platform = typeof platformValue === 'string' ? platformValue : '';
  const touchPoints = typeof touchPointsValue === 'number' &&
    Number.isSafeInteger(touchPointsValue) && touchPointsValue >= 0
    ? touchPointsValue
    : 0;
  if (!agent.trim() && !platform.trim()) return 'unknown';
  if (/iPad|Tablet|PlayBook|Silk/i.test(agent) || (platform === 'MacIntel' && touchPoints > 1)) {
    return 'tablet';
  }
  if (/iPhone|iPod|Windows Phone|IEMobile|Mobi/i.test(agent) ||
      (/Android/i.test(agent) && /Mobile/i.test(agent))) {
    return 'mobile';
  }
  if (/Android/i.test(agent)) return 'tablet';
  return 'desktop';
}

function detectDeviceType(): ImpressionDeviceType {
  if (typeof navigator === 'undefined') return 'unknown';
  return classifyImpressionDeviceType(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
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
