import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Coins, Gem, RefreshCw, Sparkles, Star, ArrowUp, ShieldCheck } from 'lucide-react';
import type { CombatRune, CombatRuneStat, CombatSnapshot } from '../../shared/combat.js';
import { combatRuneBonuses, combatRuneEffectText, combatRuneLevelCost, combatRuneLevelMultiplier, combatRuneSlotsUnlocked } from '../../shared/combat.js';

async function request<T>(url:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Rune request failed.');
  return data as T;
}
const RARITY_ORDER:Record<string,number>={Cosmic:7,Mythic:6,Legendary:5,Epic:4,Rare:3,Uncommon:2,Common:1};
const STAT_LABEL:Record<CombatRuneStat,string>={luckPct:'Orb Luck',coinGainPct:'Coin gain',shardChancePct:'Shard chance',xpGainPct:'XP gain'};
const STAT_ICON:Record<CombatRuneStat,React.ReactNode>={luckPct:<Sparkles size={25}/>,coinGainPct:<Coins size={25}/>,shardChancePct:<Gem size={25}/>,xpGainPct:<BookOpen size={25}/>};
const pct=(value:number,decimals=2)=>value>=1e21?value.toExponential(2)+'%':value.toFixed(decimals)+'%';
const rarityClass=(rarity:string)=>'io-rarity-'+rarity.toLowerCase();
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
  const runes=useMemo(()=>[...(state?.runes??[])].sort((a,b)=>(RARITY_ORDER[b.rarity]??0)-(RARITY_ORDER[a.rarity]??0)||(Number(b.level)||1)-(Number(a.level)||1)||b.value-a.value||a.name.localeCompare(b.name)),[state?.runes]);
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
      <div><div className="io-runes-kicker">CORE-GAME BONUSES · UNBOUNDED LEVELS</div><h1>Runes</h1><p className="io-runes-intro">Equip monster drops to strengthen normal Infinity Orb rolls. Level Luck, Coins, and XP Runes as far as your Combat Marks can take them; Shard Rune chance does not scale with level.</p></div>
      <button type="button" className="io-runes-button" onClick={()=>{setLoading(true);void load();}} disabled={loading}><RefreshCw size={14}/> Refresh</button>
    </header>
    {error&&<div className="io-runes-error" role="alert">{error}</div>}
    {notice&&!error&&<div className="io-runes-muted" role="status">{notice}</div>}
    {loading&&!state?<div className="io-runes-loading">Loading Rune inventory…</div>:state&&<>
      <section className="io-runes-panel">
        <div className="io-runes-panel-head"><h2>Equipped loadout</h2><span className="io-runes-muted">{equippedRunes.length} / {slots} slots used · Delver Lv. {state.level} · Best depth {bestRuneDepth}</span></div>
        <div className="io-runes-loadout">{Array.from({length:slots},(_,index)=>{
          const rune=equippedRunes[index];
          return <div key={index} className={'io-runes-slot'+(rune?' is-filled':'')}>
            {rune?STAT_ICON[rune.stat]:<Star size={15} color="#475569"/>}
            {rune?<><strong className={'io-rarity-'+rune.rarity.toLowerCase()}>{rune.name}</strong><span>Lv. {rune.level??1} · {combatRuneEffectText(rune)}</span>{rune.majorAbility&&<span className="io-runes-major">✦ {rune.majorAbility.name}</span>}</>:<span>Empty slot {index+1}</span>}
          </div>;
        })}</div>
        <div className="io-runes-stat-grid">{statCards.map(card=><div className="io-runes-stat" key={card.label}><span>{card.icon} {card.label}</span><strong>{card.value}</strong></div>)}</div>
        <p className="io-runes-muted" style={{marginTop:'.75rem'}}>Slot milestones: start with 2; unlock a third at Delver Level 10, a fourth at Level 25, and a fifth at best Depth 50. Rune bonuses affect main-game online and offline orb-roll rewards, never dungeon combat.</p>
      </section>
      <section className="io-runes-panel">
        <div className="io-runes-panel-head"><h2>Rune inventory</h2><span className="io-runes-muted">{state.runes.length} / 200 · Hover or focus for details; click an icon to equip.</span></div>
        {!runes.length?<div className="io-runes-empty"><Gem size={22} style={{margin:'0 auto .5rem',color:'#a78bfa'}}/><strong style={{display:'block',color:'#e2e8f0'}}>No Runes found yet</strong>Defeat monsters in Combat. Common monsters can drop a Rune, elite enemies have a higher chance, and bosses always drop one.</div>:
          <div className="io-runes-inventory">{runes.map(rune=>{
            const isEquipped=state.equippedRunes.includes(rune.id);
            const canEquip=isEquipped||state.equippedRunes.length<slots;
            const level=Math.max(1,Math.floor(Number(rune.level)||1));
            const cost=combatRuneLevelCost(level);
            const iconLabel=(isEquipped?'Unequip ':'Equip ')+rune.name;
            return <article key={rune.id} className={'io-runes-icon-wrap '+rarityClass(rune.rarity)+(isEquipped?' is-equipped':'')}>
              <button type="button" className={'io-runes-icon '+rarityClass(rune.rarity)+(isEquipped?' is-equipped':'')} disabled={busyRune===rune.id||(!isEquipped&&!canEquip)} onClick={()=>void mutate('/api/combat/runes/equip',{runeId:rune.id,equip:!isEquipped},rune.id,isEquipped?'Rune unequipped.':'Rune equipped.')} aria-label={iconLabel} title={iconLabel}>
                <span className="io-runes-icon-art">{STAT_ICON[rune.stat]}</span><small>Lv. {level}</small>{isEquipped&&<span className="io-runes-equipped-mark"><ShieldCheck size={12}/></span>}
              </button>
              <div className="io-runes-tooltip" role="tooltip">
                <span className={'io-runes-tooltip-rarity '+rarityClass(rune.rarity)}>{rune.rarity.toUpperCase()} · {STAT_LABEL[rune.stat].toUpperCase()}</span>
                <strong>{rune.name}</strong><span className="io-runes-tooltip-level">Level {level} · Found at depth {rune.sourceDepth+1}</span>
                <p className="io-runes-tooltip-value">{combatRuneEffectText(rune)}</p>
                <p>{rune.stat==='luckPct'?'Improves rarity odds on normal orb rolls.':rune.stat==='coinGainPct'?'Increases Coins earned from normal orb rolls.':rune.stat==='shardChancePct'?'Adds its existing percentage-point chance to find a Shard; Rune levels do not alter this stat.':'Increases XP earned from normal orb rolls.'}</p>
                {rune.majorAbility&&<div className="io-runes-major-card"><span>✦ MAIN-GAME MAJOR ABILITY</span><strong>{rune.majorAbility.name} · +{pct(rune.majorAbility.valuePct*combatRuneLevelMultiplier(level))}</strong><p>{rune.majorAbility.description}</p></div>}
                <div className="io-runes-tooltip-actions">
                  <button type="button" className="io-runes-button" disabled={busyRune===rune.id||(!isEquipped&&!canEquip)} onClick={()=>void mutate('/api/combat/runes/equip',{runeId:rune.id,equip:!isEquipped},rune.id,isEquipped?'Rune unequipped.':'Rune equipped.')}>{busyRune===rune.id?'Saving…':isEquipped?'Unequip':'Equip'}</button>
                  <button type="button" className="io-runes-button" disabled={busyRune===rune.id||state.combatMarks<cost} onClick={()=>void mutate('/api/combat/runes/level',{runeId:rune.id},rune.id,'Rune upgraded to Level '+(level+1)+'.')}><ArrowUp size={12}/> Level Up · {cost.toLocaleString()} Marks</button>
                  <button type="button" className="io-runes-button is-secondary" disabled={busyRune===rune.id} onClick={()=>void mutate('/api/combat/runes/salvage',{runeId:rune.id},rune.id,'Rune salvaged for Combat Marks.')}>Salvage</button>
                </div>
                {!isEquipped&&!canEquip&&<div className="io-runes-muted">All Rune slots are full.</div>}
              </div>
            </article>;
          })}</div>}
      </section>
    </>}
  </div>;
};
