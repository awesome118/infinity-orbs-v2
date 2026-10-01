import './styles.css';
import { requestExpandedMode, context } from '@devvit/web/client';
import { createRoot } from 'react-dom/client';


function Splash() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-purple-500/20 bg-slate-900/90 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-3xl">
            🔮
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-purple-300 font-black">Reddit Game</p>
              <span className="text-[10px] font-mono font-bold text-slate-500">v{context.appVersion}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Infinity Orbs</h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-300">
          Roll for rare Orbs, build your multipliers, unlock Mastery and Prestige,
          and compete with other Redditors.
        </p>

        <button
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99]"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          ▶ Play Infinity Orbs
        </button>

        <p className="mt-4 text-[11px] text-slate-500">
          Version {context.appVersion ?? 'unknown'} · Progress is stored server-side.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Splash />);
