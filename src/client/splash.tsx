import { requestExpandedMode, context } from '@devvit/web/client';
import { createRoot } from 'react-dom/client';
import { getOrbInfo } from '../shared/game.js';
import './styles.css';

type SharedOrbPostData = {
  type?: string;
  rarity?: number;
  username?: string;
  totalRolls?: number;
  collectionValue?: number;
};

function SharedOrbPost({ data }: { data: SharedOrbPostData }) {
  const rarity = Number.isSafeInteger(data.rarity) && Number(data.rarity) > 0
    ? Number(data.rarity)
    : 0;
  const info = rarity > 0 ? getOrbInfo(rarity) : null;
  const username = String(data.username ?? '').trim().replace(/^u\//i, '') || 'a player';
  const totalRolls = Number(data.totalRolls ?? 0);
  const collectionValue = Number(data.collectionValue ?? 0);

  if (!info) return null;

  return (
    <main className="min-h-[260px] bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/95 p-5 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-black text-cyan-300">Infinity Orbs</div>
            <h1 className="mt-1 text-lg sm:text-xl font-black text-white">u/{username} found an Orb</h1>
          </div>
          <div
            className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border"
            style={{
              color: info.color,
              backgroundColor: `${info.color}18`,
              borderColor: `${info.color}44`,
            }}
          >
            {info.tier}
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row items-center gap-5">
          <div
            className="w-36 h-36 rounded-full border-4 border-white/10 shadow-2xl shrink-0"
            style={{ background: info.bgGradient, boxShadow: `0 0 45px ${info.color}44` }}
            aria-label={`1/${rarity.toLocaleString()} ${info.tier} Orb`}
          />
          <div className="min-w-0 text-center sm:text-left">
            <div className="text-3xl sm:text-4xl font-black text-white">1/{rarity.toLocaleString()}</div>
            <div className="mt-1 text-sm font-bold" style={{ color: info.color }}>{info.name}</div>
            <div className="mt-3 text-xs text-slate-400">
              Found by <span className="font-bold text-slate-200">u/{username}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Roll #{Math.max(0, Math.floor(totalRolls)).toLocaleString()} · Collection Value {Math.max(0, Math.floor(collectionValue)).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-center text-xs text-slate-400">
          This Orb was discovered in Infinity Orbs.
        </div>
      </section>
    </main>
  );
}

function Splash() {
  const postData = (context.postData ?? {}) as SharedOrbPostData;
  if (postData.type === 'shared-orb' && Number(postData.rarity) > 0) {
    return <SharedOrbPost data={postData} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-purple-500/20 bg-slate-900/90 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-3xl">
            🔮
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black">Infinity Orbs</h1>
            </div>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-300">
          Roll. Collect. Go further.
        </p>

        <button
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99]"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          ▶ Play Infinity Orbs
        </button>

        <p className="mt-4 text-[11px] text-slate-500">
          v{context.appVersion ?? 'unknown'}
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Splash />);
