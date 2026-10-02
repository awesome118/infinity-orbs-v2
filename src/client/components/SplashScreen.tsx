import { useEffect, useState, type CSSProperties } from 'react';

type SplashScreenProps = {
  ready: boolean;
  hasProgress: boolean;
  highestRarity?: number;
  totalRolls?: number;
  onEnter: () => void;
};

const MESSAGES = [
  'Calibrating probability',
  'Syncing the Codex',
  'Waking the vault',
  'Aligning the orbits',
];

export function SplashScreen({ ready, hasProgress, highestRarity = 2, totalRolls = 0, onEnter }: SplashScreenProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => {
      setMessageIndex(index => (index + 1) % MESSAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && ready) {
        event.preventDefault();
        begin();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const begin = () => {
    if (!ready || leaving) return;
    setLeaving(true);
    window.setTimeout(onEnter, 520);
  };

  const progress = ready ? 100 : 67 + Math.min(28, messageIndex * 7);

  return (
    <div className={`infinity-splash ${leaving ? 'is-leaving' : ''}`}>
      <div className="splash-stars" aria-hidden="true">
        {Array.from({ length: 34 }, (_, i) => (
          <i key={i} style={{
            '--i': i,
            '--x': `${(i * 37) % 101}%`,
            '--y': `${(i * 61) % 101}%`,
            '--d': `${2.5 + ((i * 17) % 40) / 10}s`,
            '--s': `${0.8 + ((i * 11) % 13) / 10}`,
          } as CSSProperties} />
        ))}
      </div>

      <div className="splash-nebula splash-nebula-a" aria-hidden="true" />
      <div className="splash-nebula splash-nebula-b" aria-hidden="true" />
      <div className="splash-grid" aria-hidden="true" />

      <div className="splash-content">
        <div className="splash-brand" aria-label="Infinity Orbs">
          <div className="splash-mark" aria-hidden="true">
            <span className="splash-orb splash-orb-left" />
            <span className="splash-orb splash-orb-right" />
            <span className="splash-mark-core" />
            <span className="splash-ring splash-ring-outer" />
            <span className="splash-ring splash-ring-inner" />
            <svg className="splash-infinity-svg" viewBox="0 0 200 120" aria-hidden="true">
              <defs>
                <linearGradient id="splashInfinityGradient" x1="20" y1="20" x2="180" y2="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#ad79ff" />
                  <stop offset="0.48" stopColor="#f2ecff" />
                  <stop offset="1" stopColor="#63ddff" />
                </linearGradient>
              </defs>
              <path
                d="M10 60C30 14 70 14 100 60C130 106 170 106 190 60C170 14 130 14 100 60C70 106 30 106 10 60Z"
                fill="none"
                stroke="url(#splashInfinityGradient)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="splash-wordmark">
            <span>INFINITY</span>
            <strong>ORBS</strong>
          </div>
        </div>

        <p className="splash-kicker">A SOCIAL RNG GAME</p>
        <p className="splash-tagline">
          Roll. Discover. Build luck. Chase the impossible.
        </p>

        <div className="splash-showcase" aria-hidden="true">
          <div className="splash-showcase-line" />
          <div className="splash-pill">
            <span className="splash-pill-dot dot-purple" />
            ROLL
          </div>
          <div className="splash-pill">
            <span className="splash-pill-dot dot-cyan" />
            UPGRADE
          </div>
          <div className="splash-pill">
            <span className="splash-pill-dot dot-gold" />
            PRESTIGE
          </div>
          <div className="splash-showcase-line" />
        </div>

        <div className="splash-cta-wrap">
          <button
            className={`splash-cta ${ready ? 'ready' : 'loading'}`}
            type="button"
            onClick={begin}
            disabled={!ready || leaving}
            aria-label={ready ? 'Play Infinity Orbs' : 'Loading Infinity Orbs'}
          >
            <span className="splash-cta-sheen" aria-hidden="true" />
            <span className="splash-cta-label">{ready ? (hasProgress ? 'CONTINUE' : 'PLAY') : 'LOADING'}</span>
            {ready && <span className="splash-cta-arrow" aria-hidden="true">→</span>}
          </button>
          <div className="splash-cta-hint">
            {ready ? (hasProgress ? 'RESUME YOUR RUN' : 'PRESS ENTER OR CLICK TO BEGIN') : MESSAGES[messageIndex].toUpperCase()}
          </div>
        </div>

        <div className="splash-status" aria-live="polite">
          <div className="splash-status-row">
            <span>{ready ? 'SYSTEMS ONLINE' : MESSAGES[messageIndex].toUpperCase()}</span>
            <span>{ready ? '100%' : `${progress}%`}</span>
          </div>
          <div className="splash-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        {ready && hasProgress && (
          <div className="splash-record" aria-label={`Best orb 1 in ${highestRarity.toLocaleString()}, ${totalRolls.toLocaleString()} rolls`}>
            <div>
              <span>BEST DROP</span>
              <strong>1 / {highestRarity.toLocaleString()}</strong>
            </div>
            <i aria-hidden="true" />
            <div>
              <span>ROLLS</span>
              <strong>{totalRolls.toLocaleString()}</strong>
            </div>
          </div>
        )}

        <div className="splash-footer">
          <span>INFINITE ODDS</span>
          <b>•</b>
          <span>COMMUNITY DRIVEN</span>
          <b>•</b>
          <span>REDDIT</span>
        </div>
      </div>

      <div className="splash-corner splash-corner-tl" aria-hidden="true" />
      <div className="splash-corner splash-corner-tr" aria-hidden="true" />
      <div className="splash-corner splash-corner-bl" aria-hidden="true" />
      <div className="splash-corner splash-corner-br" aria-hidden="true" />
    </div>
  );
}
