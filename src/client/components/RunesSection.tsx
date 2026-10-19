import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Coins, Gem, RefreshCw, Sparkles, Star } from 'lucide-react';
import type { CombatRune, CombatRuneStat, CombatSnapshot } from '../../shared/combat.js';
import { combatRuneBonuses, combatRuneEffectText, combatRuneSlotsUnlocked } from '../../shared/combat.js';

async function request<T>(url:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Rune request failed.');
  return data as T;
}
const RARITY_ORDER:Record<string,number>={Cosmic:7,Mythic:6,Legendary:5,Epic:4,Rare:3,Uncommon:2,Common:1};
const STAT_LABEL:Record<CombatRuneStat,string>={luckPct:'Orb Luck',coinGainPct:'Coin gain',shardChancePct:'Shard chance',xpGainPct:'XP gain'};
const STAT_ICON:Record<CombatRuneStat,React.ReactNode>={luckPct:<Sparkles size={15}/>,coinGainPct:<Coins size={15}/>,shardChancePct:<Gem size={15}/>,xpGainPct:<BookOpen size={15}/>};
const pct=(value:number,decimals=2)=>value.toFixed(decimals)+'%';
export const RunesSection:React.FC=()=>{
  const [snapshot,setSnapshot]=useState<CombatSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [busyRune,setBusyRune]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    try{const result=await request<CombatSnapshot>('/api/combat/state');setSnapshot(result);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Could not load Runes.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const state=snapshot?.state??null;
  const bestRuneDepth=state?Math.max(state.bestDepth,...Object.values(state.dungeonBestDepths)):1;
  const slots=state?combatRuneSlotsUnlocked(state.level,bestRuneDepth):2;
  const bonuses=useMemo(()=>combatRuneBonuses(state?.runes??[],state?.equippedRunes??[]),[state?.runes,state?.equippedRunes]);
  const runes=useMemo(()=>[...(state?.runes??[])].sort((a,b)=>(RARITY_ORDER[b.rarity]??0)-(RARITY_ORDER[a.rarity]??0)||b.value-a.value||a.name.localeCompare(b.name)),[state?.runes]);
  const mutate=async(url:string,body:unknown,runeId:string,success:string)=>{
    setBusyRune(runeId);setError('');setNotice('');
    try{const result=await request<CombatSnapshot>(url,'POST',body);setSnapshot(result);setNotice(success);window.dispatchEvent(new CustomEvent('io-combat-marks-updated',{detail:{combatMarks:result.state.combatMarks}}));}
    catch(e){setError(e instanceof Error?e.message:'Rune update failed.');}
    finally{setBusyRune(null);}
  };
  const equippedRunes=state?(state.equippedRunes.map(id=>state.runes.find(rune=>rune.id===id)).filter((rune):rune is CombatRune=>Boolean(rune))):[];
  const statCards=[
    {label:'Orb Luck',value:pct(bonuses.luckPct),icon:<Sparkles size={16}/>},
    {label:'Coin gain',value:pct(bonuses.coinGainPct),icon:<Coins size={16}/>},
    {label:'Shard chance',value:pct(bonuses.shardChancePct,3),icon:<Gem size={16}/>},
    {label:'XP gain',value:pct(bonuses.xpGainPct),icon:<BookOpen size={16}/>},
  ];
  return <div className="io-runes-page">
    <header className="io-runes-header">
      <div><div className="io-runes-kicker">COMBAT LOOT · CORE-GAME BONUSES</div><h1>Runes</h1><p className="io-runes-intro">Monsters carry Runes: rare finds that tune your orb-rolling build. Equip them here to gain bonuses outside the dungeon too. Better monsters and deeper runs give you more chances at powerful rarities.</p></div>
      <button type="button" className="io-runes-button" onClick={()=>{setLoading(true);void load();}} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </header>
    {error&&<div className="io-runes-error" role="alert">{error}</div>}
    {notice&&!error&&<div className="io-runes-muted" role="status">{notice}</div>}
    {loading&&!state?<div className="io-runes-loading">Loading Rune inventory…</div>:state&&<>
      <section className="io-runes-panel">
        <div className="io-runes-panel-head"><h2>Equipped loadout</h2><span className="io-runes-muted">{equippedRunes.length} / {slots} slots used · Delver Lv. {state.level} · Best depth {bestRuneDepth}</span></div>
        <div className="io-runes-loadout">
          {Array.from({length:slots},(_,index)=>{
            const rune=equippedRunes[index];
            return <div key={index} className={'io-runes-slot'+(rune?' is-filled':'')}>
              <Star size={15} color={rune?'#c4b5fd':'#475569'}/>
              {rune?<><strong className={'io-rarity-'+rune.rarity.toLowerCase()}>{rune.name}</strong><span>{combatRuneEffectText(rune)}</span></>:<span>Empty slot {index+1}</span>}
            </div>;
          })}
        </div>
        <div className="io-runes-stat-grid">
          {statCards.map(card=><div className="io-runes-stat" key={card.label}><span>{card.icon} {card.label}</span><strong>{card.value}</strong></div>)}
        </div>
        <p className="io-runes-muted" style={{marginTop:'.75rem'}}>Slot milestones: start with 2; unlock a third at Delver Level 10, a fourth at Level 25, and a fifth at best Depth 50. Bonuses apply to normal online and offline orb-roll rewards.</p>
      </section>
      <section className="io-runes-panel">
        <div className="io-runes-panel-head"><h2>Rune inventory</h2><span className="io-runes-muted">{state.runes.length} / 200 · {state.runes.length?'Salvage extras for Combat Marks':''}</span></div>
        {!runes.length?<div className="io-runes-empty"><Gem size={22} style={{margin:'0 auto .5rem',color:'#a78bfa'}}/><strong style={{display:'block',color:'#e2e8f0'}}>No Runes found yet</strong>Defeat monsters in Combat. Common monsters can drop a Rune, elites have a higher chance, and bosses always drop one.</div>:
          <div className="io-runes-inventory">
            {runes.map(rune=>{
              const isEquipped=state.equippedRunes.includes(rune.id);
              const canEquip=isEquipped||state.equippedRunes.length<slots;
              return <article key={rune.id} className={'io-runes-card'+(isEquipped?' is-equipped':'')}>
                <div className="io-runes-card-head"><div><div className={'io-runes-kicker io-rarity-'+rune.rarity.toLowerCase()}>{rune.rarity.toUpperCase()} · {STAT_LABEL[rune.stat]}</div><h3>{rune.name}</h3></div><span style={{color:'#c4b5fd'}}>{STAT_ICON[rune.stat]}</span></div>
                <p>{combatRuneEffectText(rune)}. {rune.stat==='luckPct'?'Improves the rarity odds when rolling orbs.':rune.stat==='coinGainPct'?'Increases Coins earned from rolls.':rune.stat==='shardChancePct'?'Adds a chance to find extra Shards on a roll.':'Increases XP earned from orb rolls.'}</p>
                <div className="io-runes-card-meta">DROPPED · {rune.sourceDungeon.toUpperCase()} · DEPTH {rune.sourceDepth+1}</div>
                <div className="io-runes-card-actions">
                  <button type="button" className="io-runes-button" disabled={busyRune===rune.id||(!isEquipped&&!canEquip)} onClick={()=>void mutate('/api/combat/runes/equip',{runeId:rune.id,equip:!isEquipped},rune.id,isEquipped?'Rune unequipped.':'Rune equipped.')}>{busyRune===rune.id?'Saving…':isEquipped?'Unequip':'Equip'}</button>
                  <button type="button" className="io-runes-button is-secondary" disabled={busyRune===rune.id} onClick={()=>void mutate('/api/combat/runes/salvage',{runeId:rune.id},rune.id,'Rune salvaged for Combat Marks.')}>Salvage</button>
                </div>
                {!isEquipped&&!canEquip&&<div className="io-runes-muted" style={{marginTop:'.45rem'}}>All Rune slots are full.</div>}
              </article>;
            })}
          </div>
        }
      </section>
    </>}
  </div>;
};
