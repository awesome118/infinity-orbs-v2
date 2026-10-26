import '../post-revamp.css';
import { APP_VERSION } from '../../shared/version.js';

type SplashScreenProps = {
  ready: boolean;
  hasProgress: boolean;
  highestRarity?: number;
  totalRolls?: number;
  onEnter: () => void;
};

export function SplashScreen({
  ready,
  hasProgress,
  highestRarity = 2,
  totalRolls = 0,
  onEnter,
}: SplashScreenProps) {
  return (
    <main
      className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950 px-5 py-8 text-slate-100"
      style={{
        background:
          'radial-gradient(ellipse at 50% 34%, rgba(28, 61, 76, 0.42), transparent 55%), #080d12',
      }}
      aria-label="Infinity Orbs start screen"
    >
      <section className="w-full max-w-md text-center">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-200/20 bg-slate-900/90 text-5xl font-light text-cyan-200 shadow-xl shadow-cyan-950/30"
          aria-hidden="true"
        >
          ∞
        </div>

        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
          infinity orbs
        </h1>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200/80">
          roll, collect, go further
        </p>
        <p className="mt-2 text-[10px] font-mono font-medium tracking-wide text-slate-500" aria-label={`App version ${APP_VERSION}`}>
          v{APP_VERSION}
        </p>

        {ready && hasProgress && (
          <div className="mx-auto mt-8 grid max-w-xs grid-cols-2 divide-x divide-slate-700 rounded-2xl border border-slate-800 bg-slate-900/75 px-4 py-3">
            <div className="px-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Best orb
              </div>
              <div className="mt-1 text-sm font-black text-white">
                1 / {highestRarity.toLocaleString()}
              </div>
            </div>
            <div className="px-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Rolls
              </div>
              <div className="mt-1 text-sm font-black text-white">
                {totalRolls.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onEnter}
          disabled={!ready}
          className="io-immersive-play-cta mt-9 min-h-14 w-full rounded-xl border border-cyan-100/60 bg-gradient-to-r from-lime-300 via-emerald-200 to-cyan-200 px-6 py-4 text-sm font-black uppercase tracking-[0.14em] text-slate-950 transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400"
        >
          {ready ? (hasProgress ? 'Continue' : 'Play') : 'Loading'}
        </button>

        <p className="mt-4 min-h-5 text-xs text-slate-500" aria-live="polite">
          {ready ? 'Your next discovery is one roll away.' : 'Preparing your save…'}
        </p>
      </section>
    </main>
  );
}
