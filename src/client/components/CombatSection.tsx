import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Coins, Info, Pause, Play, Sparkles, Swords, Zap, Sword, Shield, Crown, Hand, Footprints, CircleDot, Gem, Hammer, Clock3, Timer, type LucideIcon } from 'lucide-react';
import type { CombatAction, CombatArenaProfile, CombatArenaResult, CombatAutoScrapSettings, CombatCommand, CombatEnemy, CombatGear, CombatGearSlot, CombatIntent, CombatOrbRoll, CombatPage, CombatSkillDefinition, CombatSkillId, CombatSnapshot, CombatState, CombatStats, CombatTactic } from '../../shared/combat.js';
import { COMBAT_ABILITY_SLOTS, COMBAT_BEAT_INTERVAL_MS, COMBAT_SKILLS, COMBAT_UPGRADES, COMBAT_UPGRADE_RANK_CAP, SKILL_GACHA_RANK_MAX, SKILL_RANK_CAP, combatAbilityType, combatBountyReward, combatEffectiveFlurryBonusAttacks, combatEnergyAfterRegen, combatFlurryAttackMultiplier, combatForgeCost, combatForgeQualityCost, combatScrapValue, combatSkillCopiesForNextRank, combatSkillCooldown, combatSkillEnergyCost, combatSkillRarityOdds, combatUpgradeCost, combatUpgradeRank, floorQualityRequirement, gearQualityEffectiveness, skillGachaRankRequirement, skillPullCost, skillRarityUnlocked, undercryptOrbLuckMultiplier, undercryptWardensDefeated } from '../../shared/combat.js';

interface Props { page: CombatPage; onNavigate:(page:CombatPage)=>void; }
interface ApiResponse extends CombatSnapshot {
  actions?:CombatAction[]; defeated?:boolean; died?:boolean; item?:CombatGear; orbRoll?:CombatOrbRoll;
  skillRoll?:{id:string;name:string;rarity:string;rank:number;duplicate:boolean;convertedCoins:number;pityEpic:number;pityMythic:number;progress:number;copiesNeeded:number;rankedUp:boolean}; cost?:number;
  scrapResult?:{itemName:string;gained:number;total:number};
  forgeResult?:{item:CombatGear;cost:number;remainingScrap:number};
  arenaResult?:CombatArenaResult;
}
async function request<T>(url:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(Number.isFinite(Number(data.retryAfterMs))?'ARENA_COOLDOWN:'+Math.max(0,Number(data.retryAfterMs)):typeof data.error==='string'?data.error:'Combat request failed.');
  return data as T;
}
const fmt=(n:number)=>Math.max(0,Math.floor(n||0)).toLocaleString();
const percent=(n:number)=>(n*100).toFixed(1)+'%';
const rarityClass=(rarity:string)=>'io-rarity-'+rarity.toLowerCase();
const rankOf=(state:CombatState,id:string)=>Math.max(0,Math.min(SKILL_RANK_CAP,Math.floor(Number(state.skillLevels[id as keyof typeof state.skillLevels])||0)));
const GEAR_SLOTS:{slot:CombatGearSlot;label:string;Icon:LucideIcon}[]=[
  {slot:'weapon',label:'Weapon',Icon:Sword},{slot:'helmet',label:'Helmet',Icon:Crown},{slot:'armor',label:'Chest',Icon:Shield},{slot:'gloves',label:'Gloves',Icon:Hand},
  {slot:'boots',label:'Boots',Icon:Footprints},{slot:'ring',label:'Ring',Icon:CircleDot},{slot:'amulet',label:'Amulet',Icon:Gem},
];
const slotLabel=(slot:CombatGearSlot)=>GEAR_SLOTS.find(entry=>entry.slot===slot)?.label??slot;
const equipped=(state:CombatState,slot:CombatGearSlot)=>state.inventory.find(item=>item.id===state.equipment[slot]&&item.slot===slot)??null;
function skillValue(skill:CombatSkillDefinition,rank:number,speed=300):string {
  const type=combatAbilityType(skill),scale=Math.log2(Math.max(1,rank)+1);
  if(type==='strike')return 'Active strike · '+Math.round((1.2+skill.value*2+scale*.15)*100)+'% damage multiplier';
  if(type==='flurry')return 'Active flurry · adds '+combatEffectiveFlurryBonusAttacks(1+Math.floor(scale),Math.min(12,Math.max(1,Math.floor(speed/100))))+' bonus strikes at '+Math.round(combatFlurryAttackMultiplier(skill.value)*100)+'% damage each (12-hit cap)';
  if(type==='mend')return 'Active mend · heals '+Math.round(Math.min(.9,.10+skill.value+scale*.06)*100)+'% max HP';
  if(type==='focus')return 'Active focus · guaranteed critical strike';
  const reward=combatBountyReward(skill.value,rank);
  return 'Active bounty · '+fmt(reward.marks)+' Combat Marks + '+fmt(reward.coins)+' Delver Coins in PvE; buffs a strike in Arena';
}
function GearCard({item,isEquipped,onEquip,onScrap,busy,currentFloor}:{item:CombatGear;isEquipped:boolean;onEquip:()=>void;onScrap:()=>void;busy:boolean;currentFloor:number}) {
  const [showTooltip,setShowTooltip]=useState(false);
  const grade=item.quality>=90?'Mythic':item.quality>=70?'Epic':item.quality>=40?'Rare':item.quality>=15?'Uncommon':'Common';
  const SlotIcon=GEAR_SLOTS.find(entry=>entry.slot===item.slot)?.Icon??Gem;
  const bonuses=[
    item.damageBonus>0?{label:'+'+fmt(item.damageBonus)+' DAMAGE',detail:'Adds to base damage before the beat orb multiplier'}:null,
    item.speedBonus>0?{label:'+'+fmt(item.speedBonus)+' SPEED',detail:'Increases action frequency'}:null,
    item.maxHealthBonus>0?{label:'+'+fmt(item.maxHealthBonus)+' MAX HP',detail:'Increases maximum health'}:null,
    item.armorBonus>0?{label:'+'+fmt(item.armorBonus)+' ARMOR',detail:'Reduces incoming damage'}:null,
    item.critChanceBonus>0?{label:'+'+(item.critChanceBonus*100).toFixed(1)+'% CRIT',detail:'Adds critical-hit chance'}:null,
  ].filter((entry):entry is {label:string;detail:string}=>Boolean(entry));
  return <article tabIndex={0} className={'io-combat-gear-card '+rarityClass(grade)}>
    <div className="io-combat-gear-head"><div className="io-combat-gear-name"><SlotIcon size={24} strokeWidth={1.8} aria-hidden="true"/><div><span className="io-combat-eyebrow">{item.quality.toFixed(2)}% · F{fmt(item.sourceFloor)} · {slotLabel(item.slot).toUpperCase()}</span><h3>{item.name}</h3></div></div><div className="io-combat-gear-actions"><span className="io-combat-power">PWR {fmt(item.power)}</span><button type="button" className="io-combat-inspect-button" onClick={()=>setShowTooltip(value=>!value)} aria-expanded={showTooltip} aria-label={'Inspect '+item.name}><Info size={12}/> Details</button></div></div>
    <p>{item.effect}</p>
    <div className="io-combat-gear-stats">{bonuses.map(stat=><span key={stat.label} title={stat.detail}>{stat.label}</span>)}
      <span>DROPPED FLOOR {fmt(item.sourceFloor)}</span><span>EXPECTED {floorQualityRequirement(currentFloor).toFixed(0)}%+</span><span>EFFECTIVE {Math.round(gearQualityEffectiveness(item,currentFloor)*100)}%</span>
    </div>
    {item.majorAbility&&<div className="io-combat-major-ability"><span><Sparkles size={13} aria-hidden="true"/> MAJOR ABILITY</span><strong>{item.majorAbility.name}</strong><p>{item.majorAbility.description}</p></div>}
    <div className={'io-combat-gear-tooltip '+(showTooltip?'is-open':'')} role="tooltip">
      <span className="io-combat-eyebrow">{grade.toUpperCase()} ITEM · {item.quality.toFixed(2)}% QUALITY · FLOOR {fmt(item.sourceFloor)}</span>
      <strong>{item.name}</strong><p>{slotLabel(item.slot)} · Power {fmt(item.power)}</p>
      <div>{bonuses.length?bonuses.map(stat=><span key={stat.label}>{stat.label}</span>):<span>No direct stat bonuses</span>}</div>
      <p>{item.effect}</p><p>Quality effectiveness on this floor: {Math.round(gearQualityEffectiveness(item,currentFloor)*100)}%.</p>
      {item.majorAbility&&<section><b>✦ {item.majorAbility.name}</b><p>{item.majorAbility.description}</p></section>}
    </div>
    <div className="io-combat-gear-buttons"><button type="button" disabled={busy||isEquipped} onClick={onEquip} className={isEquipped?'io-combat-button is-equipped':'io-combat-button'}>{isEquipped?<><Check size={14}/> Equipped</>:'Equip'}</button><button type="button" disabled={busy||isEquipped} onClick={onScrap} className="io-combat-button is-secondary">Scrap +{fmt(combatScrapValue(item))}</button></div>
  </article>;
}
export const CombatSection:React.FC<Props>=({page,onNavigate})=>{
  const [state,setState]=useState<CombatState|null>(null);
  const [enemy,setEnemy]=useState<CombatEnemy|null>(null);
  const [stats,setStats]=useState<CombatStats|null>(null);
  const [actions,setActions]=useState<CombatAction[]>([]);
  const [lastOrb,setLastOrb]=useState<CombatOrbRoll|null>(null);
  const [loading,setLoading]=useState(true),[processing,setProcessing]=useState(false),[mutating,setMutating]=useState(false);
  const [auto,setAuto]=useState(true),[paused,setPaused]=useState(false),[intent,setIntent]=useState<CombatIntent>('strike');
  const [showAllSkills,setShowAllSkills]=useState(true);
  const [visibleGearCount,setVisibleGearCount]=useState(60);
  const [lastSkill,setLastSkill]=useState<ApiResponse['skillRoll']|null>(null);
  const [error,setError]=useState('');
  const [arenaOpponents,setArenaOpponents]=useState<CombatArenaProfile[]>([]);
  const [arenaSelf,setArenaSelf]=useState<CombatArenaProfile|null>(null);
  const [arenaLoading,setArenaLoading]=useState(false);
  const [arenaResult,setArenaResult]=useState<CombatArenaResult|null>(null);
  const [arenaCooldownMs,setArenaCooldownMs]=useState(0);
  const [beatCooldownMs,setBeatCooldownMs]=useState(0);
  const [timelineCount,setTimelineCount]=useState(5);
  const [forgeQuality,setForgeQuality]=useState(20);
  const [autoScrapQuality,setAutoScrapQuality]=useState(20);
  const turnSequenceRef=useRef<HTMLDivElement|null>(null);
  const stateRef=useRef<CombatState|null>(null);
  const runtime=useRef({intent:'strike' as CombatIntent,auto:true,paused:false,busy:false,mutating:false,beatPromise:null as Promise<void>|null,manual:false,pendingIntent:false,pendingAbilityId:null as CombatSkillId|null,pendingCommandVersion:0});
  runtime.current.intent=intent; runtime.current.auto=auto; runtime.current.paused=paused;
  const accept=useCallback((result:CombatSnapshot)=>{
    stateRef.current=result.state;setState(result.state);setEnemy(result.enemy);setStats(result.stats);
  },[]);
  const load=useCallback(async()=>{
    try { const result=await request<CombatSnapshot>('/api/combat/state');accept(result);setError(''); }
    catch(e){setError(e instanceof Error?e.message:'Combat data unavailable.');}
    finally{setLoading(false);}
  },[accept]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(page!=='fight')return;
    const element=turnSequenceRef.current;
    if(!element||typeof ResizeObserver==='undefined')return;
    const measure=()=>setTimelineCount(Math.max(2,Math.min(18,Math.floor((element.clientWidth+8)/140))));
    const observer=new ResizeObserver(measure);observer.observe(element);measure();
    return()=>observer.disconnect();
  },[page,Boolean(state)]);
  useEffect(()=>{
    const update=()=>setBeatCooldownMs(Math.max(0,COMBAT_BEAT_INTERVAL_MS-(Date.now()-(state?.lastAcceptedBeatAtMs??0))));
    update();const timer=window.setInterval(update,250);return()=>window.clearInterval(timer);
  },[state?.lastAcceptedBeatAtMs]);
  useEffect(()=>{if(state)setAutoScrapQuality(state.autoScrapSettings.maxQuality);},[state?.autoScrapSettings.maxQuality]);
  const loadArena=useCallback(async()=>{
    setArenaLoading(true);
    try{
      const result=await request<{self:CombatArenaProfile;opponents:CombatArenaProfile[];cooldownRemainingMs:number}>('/api/combat/arena/opponents');
      setArenaSelf(result.self);setArenaOpponents(result.opponents);setArenaCooldownMs(result.cooldownRemainingMs);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not load Arena opponents.');}
    finally{setArenaLoading(false);}
  },[]);
  useEffect(()=>{if(page==='arena')void loadArena();},[page,loadArena]);
  useEffect(()=>{if(arenaCooldownMs<=0)return;const timer=window.setInterval(()=>setArenaCooldownMs(ms=>Math.max(0,ms-1000)),1000);return()=>window.clearInterval(timer);},[arenaCooldownMs>0]);
  const challengeArena=async(opponentId:string)=>{
    if(runtime.current.mutating)return;
    runtime.current.mutating=true;setMutating(true);setArenaResult(null);
    try{
      const activeBeat=runtime.current.beatPromise;
      if(activeBeat)await activeBeat;
      const result=await request<ApiResponse>('/api/combat/arena/challenge','POST',{opponentId});
      accept(result);if(result.arenaResult)setArenaResult(result.arenaResult);
      setArenaCooldownMs(90000);setError('');
      await loadArena();
    }catch(e){
      const message=e instanceof Error?e.message:'Arena challenge failed.';
      setError(message);
      if(message.startsWith('ARENA_COOLDOWN:')||message==='ARENA_OPPONENT_UNAVAILABLE')await loadArena();
    }finally{runtime.current.mutating=false;setMutating(false);}
  };
  const beat=useCallback(async()=>{
    const current=stateRef.current;
    if(!current||runtime.current.busy||runtime.current.mutating||(!runtime.current.manual&&(!runtime.current.auto||runtime.current.paused||Boolean(error))))return;
    const queuedIntent=runtime.current.pendingIntent;
    const queuedCommandVersion=runtime.current.pendingCommandVersion;
    const queuedCommand=runtime.current.intent;
    const pendingAbilityId=runtime.current.pendingAbilityId;
    const beatIntent:CombatCommand=queuedIntent?(pendingAbilityId?'ability':queuedCommand):(runtime.current.auto&&!runtime.current.manual?'auto':runtime.current.intent);
    runtime.current.busy=true;setProcessing(true);
    let releaseBeat!:()=>void;
    const thisBeat=new Promise<void>(resolve=>{releaseBeat=resolve;});
    runtime.current.beatPromise=thisBeat;
    try {
      const result=await request<ApiResponse>('/api/combat/beat','POST',{sequence:current.sequence+1,intent:beatIntent,...(pendingAbilityId?{skillId:pendingAbilityId}:{})});
      accept(result);if(result.orbRoll)setLastOrb(result.orbRoll);if(result.actions?.length)setActions(old=>[...result.actions!,...old].slice(0,30));
      if(queuedIntent&&runtime.current.pendingIntent&&runtime.current.pendingCommandVersion===queuedCommandVersion){runtime.current.pendingIntent=false;runtime.current.pendingAbilityId=null;runtime.current.intent='strike';setIntent('strike');}
      setError('');
    } catch(e) {
      const message=e instanceof Error?e.message:'Combat beat failed.';
      if(message.startsWith('COMBAT_BEAT_TOO_SOON:')) {
        // Keep the cadence countdown in sync if the server clock wins a race with the client.
        const remaining=Number(message.slice('COMBAT_BEAT_TOO_SOON:'.length));
        if(Number.isFinite(remaining))setBeatCooldownMs(Math.max(0,remaining));
      } else if(message==='stale combat sequence'||message.includes('changed repeatedly'))await load();
      else {
        if(queuedIntent&&runtime.current.pendingIntent&&runtime.current.pendingCommandVersion===queuedCommandVersion){runtime.current.pendingIntent=false;runtime.current.pendingAbilityId=null;runtime.current.intent='strike';setIntent('strike');}
        setError(message);setAuto(false);
      }
    } finally {
      runtime.current.busy=false;runtime.current.manual=false;setProcessing(false);
      if(runtime.current.beatPromise===thisBeat)runtime.current.beatPromise=null;
      releaseBeat();
    }
  },[accept,error,load]);
  useEffect(()=>{
    if(!auto||paused||loading||Boolean(error))return;
    const timer=window.setInterval(()=>void beat(),COMBAT_BEAT_INTERVAL_MS);
    return()=>window.clearInterval(timer);
  },[auto,paused,loading,error,beat]);
  const manualBeat=()=>{if(runtime.current.mutating||runtime.current.busy)return;setError('');runtime.current.manual=true;void beat();};
  const activateAbility=(skillId:CombatSkillId)=>{
    if(runtime.current.mutating||runtime.current.busy)return;
    runtime.current.pendingCommandVersion+=1;runtime.current.pendingAbilityId=skillId;runtime.current.pendingIntent=true;runtime.current.intent='strike';runtime.current.manual=true;
    setError('');void beat();
  };
  const saveAutoScrap=async(enabled:boolean,maxQuality:number)=>{
    if(runtime.current.mutating)return;
    runtime.current.mutating=true;setMutating(true);
    try{await request<{settings:CombatAutoScrapSettings}>('/api/combat/auto-scrap','POST',{enabled,maxQuality});await load();setError('');}
    catch(e){setError(e instanceof Error?e.message:'Could not update Auto Scrap.');}
    finally{runtime.current.mutating=false;setMutating(false);}
  };
  const mutate=async(url:string,body?:unknown)=>{
    if(runtime.current.mutating)return;
    runtime.current.mutating=true;setMutating(true);
    try {
      const activeBeat=runtime.current.beatPromise;
      if(activeBeat)await activeBeat;
      const result=await request<ApiResponse>(url,'POST',body);accept(result);if(result.skillRoll)setLastSkill(result.skillRoll);if(result.actions?.length)setActions(old=>[...result.actions!,...old].slice(0,30));if(result.scrapResult)setActions(old=>[{actor:'player' as const,kind:'loot' as const,text:'Scrapped '+result.scrapResult!.itemName+' for '+result.scrapResult!.gained+' Scrap.'},...old].slice(0,30));if(result.forgeResult)setActions(old=>[{actor:'player' as const,kind:'loot' as const,text:'Forged '+result.forgeResult!.item.name+' for '+fmt(result.forgeResult!.cost)+' Scrap.'},...old].slice(0,30));setError('');
    }
    catch(e){setError(e instanceof Error?e.message:'Combat action failed.');setAuto(false);}
    finally{runtime.current.mutating=false;setMutating(false);}
  };
  if(loading&&!state)return <section className="io-combat-screen"><div className="io-combat-loading">ENTERING THE UNDERCRYPT…</div></section>;
  if(!state||!enemy||!stats)return <section className="io-combat-screen"><header className="io-combat-page-head"><div><span className="io-combat-eyebrow">COMBAT SYSTEM</span><h1>Could not enter the Undercrypt</h1></div></header><p className="io-combat-error">{error||'Combat data unavailable.'}</p><button type="button" className="io-combat-button" onClick={()=>{setLoading(true);void load();}}>Retry</button></section>;

  const weapon=equipped(state,'weapon'), armor=equipped(state,'armor');
  const ownedSkills=Object.entries(state.skillLevels).filter(([,v])=>Number(v)>0);
  const nextBoss=(Math.floor((state.depth-1)/10)+1)*10;
  const undercryptBestDepth=state.dungeonBestDepths.undercrypt;
  const wardensDefeated=undercryptWardensDefeated(undercryptBestDepth);
  const orbLuckBonusPct=Math.round((undercryptOrbLuckMultiplier(undercryptBestDepth)-1)*100);
  const pullCost=skillPullCost(state.skillRolls);
  const gachaRequirement=skillGachaRankRequirement(state.skillGachaRank);
  const gachaOdds=combatSkillRarityOdds(state.skillGachaRank);
  const currentFloor=Math.max(0,state.depth-1);
  const forgeQualityCost=combatForgeQualityCost(currentFloor,forgeQuality);
  const visibleGear=state.inventory.slice(0,visibleGearCount);
  const visibleSkills=COMBAT_SKILLS.filter(skill=>showAllSkills||rankOf(state,skill.id)>0);
  const hpPct=Math.max(0,Math.min(100,state.health/Math.max(1,state.maxHealth)*100));
  const enemyPct=Math.max(0,Math.min(100,enemy.hp/Math.max(1,enemy.maxHp)*100));
  return <section className="io-combat-screen">
    <header className="io-combat-page-head"><div><span className="io-combat-eyebrow">INFINITY ORBS · COMBAT EXPANSION</span><h1>{page==='fight'?'Fight':page==='dungeons'?'Dungeons':page==='gear'?'Armory':page==='forge'?'The Forge':page==='skills'?'Skill Gacha':'Arena'}</h1><p>{page==='fight'?'Every accepted beat rolls an orb; its rarity scales base damage before crits and active abilities. Speed determines action frequency and the visible turn order previews who acts next.':page==='dungeons'?'Switching dungeons starts a new run, but your gear inventory and equipped loadout stay with you. Best depth is tracked separately for each dungeon.':page==='gear'?'Your inventory persists between runs and dungeons. The 30-item haul limit resets each run. Gear rolls damage, armor, health, and crit affixes; turn-speed boosts are found only as Major Abilities.':page==='forge'?'Choose the exact quality of new gear. Quality costs rise exponentially, and a guaranteed 100.00% item costs 5,000,000 Scrap. Auto Scrap is configured here.':page==='skills'?'Rank the Gacha to unlock higher rarities, then equip up to three active abilities. Duplicate ranks grow without a hard cap.':'Challenge active delvers with your saved gear and equipped abilities. Ratings update after each duel.'}</p></div><div className="io-combat-run-stamp"><span>RUN {fmt(state.runId)}</span><strong>DEPTH {fmt(state.depth)}</strong><span>BEST {fmt(state.bestDepth)}</span></div></header>
    {error&&<div className="io-combat-error" role="status">{error} <button className="io-combat-text-link" type="button" onClick={()=>{setError('');if(!state)void load();}}>Dismiss / retry</button></div>}

    {page==='fight'&&<>
      <div className="io-combat-stage"><div className="io-combat-stage-top"><span>{enemy.room.toUpperCase()}</span><span>{enemy.kind.toUpperCase()} · {state.dungeonId==='undercrypt'?'NEXT WARDEN':'NEXT BOSS'} {fmt(nextBoss)}</span></div>
        <div className="io-combat-duel">
          <div className="io-combat-combatant io-combat-hero"><div className="io-combat-sprite">🔮</div><div className="io-combat-name">{state.orbFocusName.toUpperCase()} <span>LV {state.level}</span></div><div className="io-combat-hp"><span style={{width:hpPct+'%'}}/></div><small>{fmt(state.health)} / {fmt(state.maxHealth)} HP · ORB POWER +{percent(stats.orbFocusBonus)}</small></div>
          <div className="io-combat-versus">VS</div>
          <div className="io-combat-combatant io-combat-foe"><div className="io-combat-sprite">{enemy.emoji}</div><div className="io-combat-name">{enemy.name.toUpperCase()}</div><div className="io-combat-hp is-enemy"><span style={{width:enemyPct+'%'}}/></div><small>{fmt(enemy.hp)} / {fmt(enemy.maxHp)} HP</small></div>
        </div>
        <div className="io-combat-stage-foot"><span><Zap size={14}/> {state.energy}/{state.maxEnergy} ENERGY</span><span>{fmt(stats.speed)} SPD</span><span>{fmt(stats.damage)} BASE DMG</span><span>{percent(stats.critChance)} CRIT</span></div>
      </div>
      <div className={'io-combat-orb-panel '+(lastOrb?'has-orb':'')} aria-live="polite">
        <div className="io-combat-orb-art"><span>✦</span></div>
        <div className="io-combat-orb-copy"><span className="io-combat-eyebrow">{processing?(lastOrb?'LATEST RESOLVED ORB · NEXT BEAT IN PROGRESS':'ROLLING FIRST BEAT'):'LATEST BEAT ORB'} {lastOrb?'· '+lastOrb.tier.toUpperCase():'· AWAITING FIRST ROLL'}</span><h2>{lastOrb?lastOrb.name:'Every beat rolls an orb'}</h2><p>{lastOrb?'Rarity 1 / '+fmt(lastOrb.rarity)+' · Damage multiplier ×'+lastOrb.damageMultiplier.toFixed(2):'Orb rarity directly multiplies every attack resolved this beat.'}</p></div>
        <div className="io-combat-orb-damage"><span>ORB BASE DAMAGE</span><strong>{lastOrb?fmt(lastOrb.baseDamage):'—'}</strong><small>{lastOrb?'before critical hits and active abilities':'awaiting first beat'}</small></div>
      </div>
      {(()=>{
        const maxSpeed=Math.max(1,stats.speed,enemy.speed);
        const playerNext=(state.playerActionsResolved+1)*100/Math.max(1,stats.speed);
        const enemyNext=(state.enemyActionsResolved+1)*100/Math.max(1,enemy.speed);
        const playerCharge=Math.round(stats.speed/maxSpeed*100);
        const enemyCharge=Math.round(enemy.speed/maxSpeed*100);
        const events=[
          ...Array.from({length:timelineCount+2},(_,i)=>({actor:'player' as const,time:Math.max(state.combatBeats+1,Math.ceil((state.playerActionsResolved+i+1)*100/Math.max(1,stats.speed))),step:i,speed:stats.speed})),
          ...Array.from({length:timelineCount+2},(_,i)=>({actor:'enemy' as const,time:Math.max(state.combatBeats+1,Math.ceil((state.enemyActionsResolved+i+1)*100/Math.max(1,enemy.speed))),step:i,speed:enemy.speed})),
        ].sort((a,b)=>a.time-b.time||(a.actor===b.actor?a.step-b.step:a.actor==='player'?-1:1)).slice(0,timelineCount);
        const nextActor=playerNext<=enemyNext?'player':'enemy';
        return <section className="io-combat-turn-tracker" aria-label="Combat speed and turn order">
          <div className="io-combat-turn-head"><div><span className="io-combat-eyebrow">SPEED & INITIATIVE</span><h2>Turn order</h2><p>One beat resolves about every 30 seconds; Chrono Surge is the only equipment-based turn-speed upgrade.</p></div><strong>{beatCooldownMs>0?'NEXT BEAT '+Math.ceil(beatCooldownMs/1000)+'s':'BEAT READY'}</strong></div>
          <div className="io-combat-speed-bars">
            <div className="io-combat-speed-row"><span>∞ DELVER <b>{fmt(stats.speed)} SPD</b></span><div className="io-combat-speed-track"><span className="is-player" style={{width:playerCharge+'%'}}/></div><strong>{playerCharge}% pace</strong></div>
            <div className="io-combat-speed-row"><span>{enemy.emoji} {enemy.name.toUpperCase()} <b>{fmt(enemy.speed)} SPD</b></span><div className="io-combat-speed-track"><span className="is-enemy" style={{width:enemyCharge+'%'}}/></div><strong>{enemyCharge}% pace</strong></div>
          </div>
          <div className="io-combat-turn-sequence" ref={turnSequenceRef}><div className="io-combat-turn-track" key={state.sequence}>{events.map((event,index)=><div key={event.actor+'-'+event.step} className={'io-combat-turn-chip '+(index===0?'is-next':'')+(event.actor==='enemy'?' is-foe':'')}><small>{index===0?'NEXT':index===1?'THEN':'TURN '+(index+1)}</small><strong>{event.actor==='player'?'DELVER':enemy.name}</strong><span>Beat {event.time} · {fmt(event.speed)} SPD</span></div>)}</div></div>
        </section>;
      })()}
      <div className="io-combat-tactic-row"><label htmlFor="io-combat-auto-tactic"><span className="io-combat-eyebrow">AUTO TACTIC</span><strong>{state.autoTactic==='balanced'?'Balanced':state.autoTactic==='aggressive'?'Aggressive':state.autoTactic==='defensive'?'Defensive':'Recovery'}</strong></label><select id="io-combat-auto-tactic" value={state.autoTactic} disabled={mutating} onChange={event=>void mutate('/api/combat/tactics',{tactic:event.target.value as CombatTactic})}><option value="balanced">Balanced — heal low, otherwise strike hard</option><option value="aggressive">Aggressive — spend energy on Heavy</option><option value="defensive">Defensive — heal and guard earlier</option><option value="recovery">Recovery — prioritize staying healthy</option></select></div>
      <div className="io-combat-control-row"><div className="io-combat-command-group">{(['strike','heavy','guard','mend'] as CombatIntent[]).map(cmd=><button key={cmd} type="button" onClick={()=>{runtime.current.pendingCommandVersion+=1;runtime.current.intent=cmd;runtime.current.pendingIntent=true;runtime.current.pendingAbilityId=null;setIntent(cmd);}} className={intent===cmd?'io-combat-command is-selected':'io-combat-command'}><span>{cmd==='strike'?'Strike':cmd==='heavy'?'Heavy':cmd==='guard'?'Guard':'Mend'}</span><small>{cmd==='strike'?'FREE':cmd==='heavy'?'3 EN':cmd==='guard'?'2 EN':'4 EN'}</small></button>)}</div><div className="io-combat-run-controls"><button type="button" className="io-combat-button" onClick={()=>setPaused(!paused)}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'Resume':'Pause'}</button><button type="button" className="io-combat-button" onClick={()=>setAuto(!auto)}>Auto: {auto?'ON':'OFF'}</button><button type="button" disabled={processing||mutating||beatCooldownMs>0} className="io-combat-button is-secondary" onClick={manualBeat}>{processing?'Resolving…':beatCooldownMs>0?'Next beat in '+Math.ceil(beatCooldownMs/1000)+'s':'Next Beat'}</button></div></div>
      <section className="io-combat-panel" style={{marginTop:16}}><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">ACTIVE ABILITIES</span><h2>Equipped · {state.equippedAbilities.length}/{COMBAT_ABILITY_SLOTS}</h2></div><button className="io-combat-text-link" type="button" onClick={()=>onNavigate('skills')}>Manage loadout →</button></div>{state.equippedAbilities.length===0?<p>No abilities equipped yet. Pull a Common skill and equip it from Skill Gacha.</p>:<div className="io-combat-skill-grid">{state.equippedAbilities.map(id=>{const skill=COMBAT_SKILLS.find(entry=>entry.id===id);if(!skill)return null;const rank=rankOf(state,id);const energyCost=combatSkillEnergyCost(skill.rarity);const cooldownLeft=Math.max(0,(state.abilityCooldowns[id]??0)-state.sequence);return <article key={id} className={'io-combat-skill-card '+rarityClass(skill.rarity)}><div className="io-combat-skill-card-head"><span>{skill.rarity.toUpperCase()} · RANK {fmt(rank)}</span><b>{cooldownLeft>0?'COOLDOWN '+cooldownLeft:'READY'}</b></div><h3>{skill.name}</h3><p>{skillValue(skill,rank)}</p><button type="button" className="io-combat-button is-primary" disabled={processing||mutating||cooldownLeft>0||combatEnergyAfterRegen(state.energy,state.maxEnergy)<energyCost} onClick={()=>activateAbility(id)}>{processing?'Resolving…':cooldownLeft>0?'Ready in '+cooldownLeft+' beats' :combatEnergyAfterRegen(state.energy,state.maxEnergy)<energyCost?'Need '+energyCost+' energy':'Cast · '+energyCost+' Energy'}</button></article>;})}</div>}</section>
      <div className="io-combat-stat-strip"><div><span>DELVER COINS</span><strong>{fmt(state.coins)}</strong></div><div><span>COMBAT MARKS</span><strong>{fmt(state.combatMarks)}</strong></div><div><span>SCRAP</span><strong>{fmt(state.scrap)}</strong></div><div><span>RUN HAUL</span><strong>{state.runInventoryIds.length}/30</strong></div><div><span>SKILL RANKS</span><strong>{ownedSkills.reduce((n,[,v])=>n+Number(v),0)}</strong></div><div><span>KILLS</span><strong>{fmt(state.totalKills)}</strong></div></div>
      <div className="io-combat-columns"><section className="io-combat-panel"><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">FIELD NOTES</span><h2>Combat log</h2></div><span>{processing?'RESOLVING':paused?'PAUSED':auto?'AUTO-RUN':'MANUAL'}</span></div><div className="io-combat-log" aria-live="polite">{actions.length?actions.map((a,i)=><p key={state.sequence+'-'+i} className={'io-log-'+a.actor+' io-log-'+a.kind}>{a.text}</p>):<p>The Delver readies a weapon. The first beat is imminent.</p>}</div></section>
        <section className="io-combat-panel"><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">YOUR LOADOUT</span><h2>Equipped</h2></div><button className="io-combat-text-link" type="button" onClick={()=>onNavigate('gear')}>Armory →</button></div><div className="io-combat-equipped-lines">{GEAR_SLOTS.map(({slot,label,Icon})=>{const item=equipped(state,slot);return <div className="io-combat-equipped-line" key={slot}><span><Icon size={13} aria-hidden="true"/> {label.toUpperCase()}</span><strong>{item?.name||'Empty slot'}</strong><small>{item?item.effect:'No item equipped'}</small></div>;})}</div><button className="io-combat-button is-primary" type="button" onClick={()=>onNavigate('skills')}>Open Skill Gacha</button></section></div>
    </>}

    {page==='dungeons'&&<>
      <div className="io-combat-dungeon-choices">
        <div className="io-combat-dungeon-choices-head"><span className="io-combat-eyebrow">CHOOSE YOUR EXPEDITION</span><p>Switching dungeons starts a new run at Depth 1. Your gear inventory and loadout carry over; best depth stays separate by dungeon.</p></div>
        <div className="io-combat-dungeon-choice-grid">
          <article className={'io-combat-dungeon-choice '+(state.dungeonId==='undercrypt'?'is-selected':'')}><span className="io-combat-dungeon-choice-icon">⌁</span><span className="io-combat-eyebrow">BALANCED · STANDARD</span><h3>The Undercrypt</h3><p>Learn the enemy patterns and fight the Crypt Warden. Each cleared Warden grants permanent orb Luck.</p><div className="io-combat-dungeon-choice-best">BEST DEPTH <strong>{fmt(state.dungeonBestDepths.undercrypt)}</strong></div><button type="button" className="io-combat-button is-primary" disabled={mutating||state.dungeonId==='undercrypt'} onClick={()=>void mutate('/api/combat/dungeon',{dungeonId:'undercrypt'})}>{state.dungeonId==='undercrypt'?'Expedition Active':'Enter Undercrypt'}</button></article>
          <article className={'io-combat-dungeon-choice is-cinder '+(state.dungeonId==='cinder-vault'?'is-selected':'')}><span className="io-combat-dungeon-choice-icon">🌋</span><span className="io-combat-eyebrow">HIGH RISK · HIGH PAYOUT</span><h3>The Cinder Vault</h3><p>Enemies have 35% more health, hit 25% harder, and move 8% faster. Your attacks deal 10% more damage, coins pay 40% more, and equipment drops arrive more often.</p><div className="io-combat-dungeon-choice-best">BEST DEPTH <strong>{fmt(state.dungeonBestDepths['cinder-vault'])}</strong></div><button type="button" className="io-combat-button is-primary" disabled={mutating||state.dungeonId==='cinder-vault'} onClick={()=>void mutate('/api/combat/dungeon',{dungeonId:'cinder-vault'})}>{state.dungeonId==='cinder-vault'?'Expedition Active':'Enter Cinder Vault'}</button></article>
          <article className={'io-combat-dungeon-choice is-glass '+(state.dungeonId==='glass-labyrinth'?'is-selected':'')}><span className="io-combat-dungeon-choice-icon">🔮</span><span className="io-combat-eyebrow">SPEED · PRECISION</span><h3>The Glass Labyrinth</h3><p>Enemies have 22% less health but move 35% faster and hit 12% harder. You gain +35 Speed, +5 percentage points of critical chance, and 25% more combat XP.</p><div className="io-combat-dungeon-choice-best">BEST DEPTH <strong>{fmt(state.dungeonBestDepths['glass-labyrinth'])}</strong></div><button type="button" className="io-combat-button is-primary" disabled={mutating||state.dungeonId==='glass-labyrinth'} onClick={()=>void mutate('/api/combat/dungeon',{dungeonId:'glass-labyrinth'})}>{state.dungeonId==='glass-labyrinth'?'Expedition Active':'Enter Glass Labyrinth'}</button></article>
        </div>
      </div>
      <div className="io-combat-dungeon-hero"><div className="io-combat-dungeon-art"><div className="io-combat-door">{state.dungeonId==='undercrypt'?'⌁':state.dungeonId==='cinder-vault'?'🌋':'🔮'}</div><span>{state.dungeonId==='undercrypt'?'THE UNDERCRYPT':state.dungeonId==='cinder-vault'?'THE CINDER VAULT':'THE GLASS LABYRINTH'}</span><small>ONE WAY DOWN. DEATH SENDS YOU BACK TO THE DOOR.</small></div><div className="io-combat-dungeon-summary"><span className="io-combat-eyebrow">ACTIVE EXPEDITION</span><h2>{state.dungeonId==='undercrypt'?'The Undercrypt':state.dungeonId==='cinder-vault'?'The Cinder Vault':'The Glass Labyrinth'}</h2><p>Enemy types and rooms rotate with depth. Every tenth depth ends in a dungeon-specific boss fight. Auto-combat resumes from the current room while this mode is open.</p><div className="io-combat-dungeon-metrics"><div><span>CURRENT DEPTH</span><strong>{fmt(state.depth)}</strong></div><div><span>PERSONAL BEST</span><strong>{fmt(state.bestDepth)}</strong></div><div><span>{state.dungeonId==='undercrypt'?'NEXT WARDEN':'NEXT BOSS'}</span><strong>{fmt(nextBoss)}</strong></div><div><span>ORB LUCK BONUS</span><strong>+{orbLuckBonusPct}%</strong></div></div><p className="io-combat-resonance-note">{fmt(wardensDefeated)} Crypt Wardens defeated · +1% permanent effective Luck per Warden, capped at +25%. Applies to Infinity Orbs rolls.</p><button type="button" className="io-combat-button is-primary" onClick={()=>onNavigate('fight')}>Return to Fight →</button></div></div>
      <div className="io-combat-panel io-combat-rule-panel"><span className="io-combat-eyebrow">RUN RULES</span><h2>Death is a setback, not a wipe.</h2><p>Health persists between rooms. On death, a new push begins at Depth 1 with full health. Best depth, Delver Coins, Scrap, levels, skill ranks, and collected gear stay with you.</p><p>Your gear inventory and equipped loadout are shared across dungeons and persist between runs. The 30-item cap applies only to gear acquired in one run. Floor-specific quality requirements start at 0% on floor 0 and reach 60% at floor 50. Scrap old gear into materials and forge replacements scaled to your current floor.</p><p>Your main-game Infinity Orb remains your combat focus, but every accepted dungeon beat rolls a fresh orb. That beat's rarity is multiplied into base damage before critical hits and active abilities.</p><p>Main-game attunement currently grants <b>+{(stats.coreProgressionBonus*100).toFixed(1)}%</b> combat damage and max HP. Every 10 core-game levels grants +2% (capped at +20%); each order of magnitude in your highest orb rarity grants +0.3% (capped at +5%). This refreshes when you enter Combat.</p></div>
    </>}

    {page==='gear'&&<>
      <div className="io-combat-stat-strip io-combat-gear-stat-strip"><div><span>SCRAP</span><strong>{fmt(state.scrap)}</strong></div><div><span>BASE DAMAGE</span><strong>{fmt(stats.damage)}</strong></div><div><span>SPEED</span><strong>{fmt(stats.speed)}</strong></div><div><span>ARMOR</span><strong>{fmt(stats.armor)}</strong></div><div><span>DAMAGE MITIGATION</span><strong>{percent(stats.damageReduction)}</strong></div></div>
      <div className="io-combat-panel"><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">ACTIVE BUILD</span><h2>Seven equipment slots</h2></div></div><div className="io-combat-equipped-grid io-combat-equipment-slot-grid">{GEAR_SLOTS.map(({slot,label,Icon})=>{const item=equipped(state,slot);return <div className="io-combat-equipped-card" key={slot}><span><Icon size={15} strokeWidth={1.8} aria-hidden="true"/> {label.toUpperCase()}</span><strong>{item?.name||'Empty slot'}</strong><p>{item?.effect||'No item equipped.'}</p><small>{item?['+'+fmt(item.damageBonus)+' DAMAGE','+'+fmt(item.speedBonus)+' SPEED','+'+fmt(item.maxHealthBonus)+' HP','+'+fmt(item.armorBonus)+' ARMOR','+'+(item.critChanceBonus*100).toFixed(1)+'% CRIT'].join(' · '):'Find gear on your descent or forge it from the Forge menu.'}</small>{item?.majorAbility&&<p className="io-combat-major-inline">✦ {item.majorAbility.name}: {item.majorAbility.description}</p>}</div>;})}</div></div>
      <div className="io-combat-inventory-head"><div><span className="io-combat-eyebrow">YOUR INVENTORY</span><h2>Collected gear</h2></div><span>{state.inventory.length} owned · {state.runInventoryIds.length}/30 picked up this run</span></div>
      <div className="io-combat-gear-grid">{visibleGear.map(item=><GearCard key={item.id} item={item} currentFloor={currentFloor} isEquipped={state.equipment[item.slot]===item.id} busy={mutating} onEquip={()=>void mutate('/api/combat/equip',{itemId:item.id})} onScrap={()=>void mutate('/api/combat/gear/scrap',{itemId:item.id})}/>)}</div>{state.inventory.length>visibleGear.length&&<button type="button" className="io-combat-button is-secondary" style={{marginTop:12}} onClick={()=>setVisibleGearCount(count=>Math.min(state.inventory.length,count+60))}>Show {Math.min(60,state.inventory.length-visibleGear.length)} more items ({visibleGear.length}/{state.inventory.length})</button>}
      <div className="io-combat-panel" style={{marginTop:20}}><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">PERMANENT TRAINING</span><h2>Combat Upgrades</h2><p>Earn Combat Marks from kills. Training persists between runs and is independent from Delver Coins.</p></div><strong>{fmt(state.combatMarks)} MARKS</strong></div><div className="io-combat-skill-grid">{COMBAT_UPGRADES.map(upgrade=>{const rank=combatUpgradeRank(state,upgrade.id);const cost=combatUpgradeCost(state,upgrade.id);return <article key={upgrade.id} className="io-combat-skill-card"><div className="io-combat-skill-card-head"><span>RANK {rank}/{Math.min(COMBAT_UPGRADE_RANK_CAP,upgrade.maxRank)}</span><b>{rank>=upgrade.maxRank?'MAXED':'NEXT '+fmt(cost)+' MARKS'}</b></div><h3>{upgrade.name}</h3><p>{upgrade.description}</p><div className="io-combat-skill-progress"><span style={{width:(rank/upgrade.maxRank*100)+'%'}}/></div><button type="button" className="io-combat-button is-primary" disabled={mutating||rank>=upgrade.maxRank||state.combatMarks<cost} onClick={()=>void mutate('/api/combat/upgrades/buy',{upgradeId:upgrade.id})}>{rank>=upgrade.maxRank?'Max Rank':state.combatMarks<cost?'Need '+fmt(cost-state.combatMarks)+' more':'Buy Rank '+(rank+1)}</button></article>;})}</div></div>
    </>}

    {page==='forge'&&<>
      <div className="io-combat-stat-strip io-combat-gear-stat-strip">
        <div><span>AVAILABLE SCRAP</span><strong>{fmt(state.scrap)}</strong></div>
        <div><span>SELECTED QUALITY</span><strong>{forgeQuality.toFixed(2)}%</strong></div>
        <div><span>CRAFT COST</span><strong>{fmt(forgeQualityCost)}</strong></div>
        <div><span>FLOOR</span><strong>{fmt(currentFloor)}</strong></div>
      </div>
      <section className="io-combat-panel io-combat-forge-panel">
        <div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">SCRAP-POWERED CRAFTING</span><h2>Precision Forge</h2><p>Select an equipment slot and quality. Higher quality is exponentially more expensive; a guaranteed 100.00% item costs exactly 5,000,000 Scrap before the floor minimum.</p></div><strong><Hammer size={19}/> {fmt(state.scrap)} SCRAP</strong></div>
        <div className="io-combat-quality-picker">
          <div className="io-combat-quality-title"><label htmlFor="io-forge-quality">Guaranteed item quality</label><strong>{forgeQuality.toFixed(2)}%</strong></div>
          <input id="io-forge-quality" className="io-combat-quality-range" type="range" min={0} max={100} step={0.01} value={forgeQuality} onChange={event=>setForgeQuality(Number(event.target.value))}/>
          <div className="io-combat-quality-scale"><span>0.00% · cheap</span><span>50.00% · premium</span><span>100.00% · 5M Scrap</span></div>
          <p>Estimated cost: <strong>{fmt(forgeQualityCost)} Scrap</strong>. The server enforces the selected quality and price; a 100.00% forge does not guarantee a Major Ability.</p>
        </div>
        <div className="io-combat-forge-slots">{GEAR_SLOTS.map(({slot,label,Icon})=><button key={slot} type="button" className="io-combat-button is-primary io-combat-forge-slot" disabled={mutating||state.scrap<forgeQualityCost} onClick={()=>void mutate('/api/combat/forge',{slot,quality:forgeQuality})}><Icon size={17} aria-hidden="true"/><span>Forge {label}</span><small>{fmt(forgeQualityCost)} Scrap</small></button>)}</div>
      </section>
      <section className="io-combat-panel io-combat-auto-scrap-panel">
        <div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">{state.autoScrapUnlocked?'INVENTORY AUTOMATION':'PRESTIGE-LOCKED FEATURE'}</span><h2>Auto Scrap</h2><p>Configure automatic salvage from this menu. Equipped gear is never scrapped; only new drops at or below the quality cutoff are converted to Scrap.</p></div><Sparkles size={21}/></div>
        {state.autoScrapUnlocked?<>
          <label className="io-combat-toggle-row"><input type="checkbox" checked={state.autoScrapSettings.enabled} disabled={mutating} onChange={event=>void saveAutoScrap(event.target.checked,autoScrapQuality)}/><span><strong>Automatically scrap low-quality drops</strong><small>{state.autoScrapSettings.enabled?'Auto Scrap is enabled.':'Auto Scrap is paused.'}</small></span></label>
          <div className="io-combat-quality-title"><label htmlFor="io-auto-scrap-quality">Maximum quality to scrap</label><strong>{autoScrapQuality.toFixed(2)}%</strong></div>
          <input id="io-auto-scrap-quality" className="io-combat-quality-range" type="range" min={0} max={100} step={0.01} value={autoScrapQuality} onChange={event=>setAutoScrapQuality(Number(event.target.value))}/>
          <div className="io-combat-quality-scale"><span>0.00%</span><span>100.00%</span></div>
          <button type="button" className="io-combat-button is-primary" disabled={mutating} onClick={()=>void saveAutoScrap(state.autoScrapSettings.enabled,autoScrapQuality)}>Save Auto Scrap settings</button>
        </>:<p className="io-combat-resonance-note">Unlock the Auto Scrap Prestige upgrade in the main game first. Once unlocked, enable it and choose the maximum quality to automatically salvage.</p>}
      </section>
      <section className="io-combat-panel io-combat-major-info">
        <div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">RARE EQUIPMENT TRAITS</span><h2><Sparkles size={18}/> Major Abilities</h2><p>Major Abilities are explicitly highlighted on the gear card. Turn-speed improvements only come from Chrono Surge Major Abilities—not ordinary affixes or a separate tempo-upgrade track.</p></div></div>
        <div className="io-combat-major-examples"><article><Timer size={21}/><div><strong>Chrono Surge</strong><p>Passively increases action frequency while the item is equipped.</p></div></article><article><Shield size={21}/><div><strong>Second Dawn</strong><p>After taking damage, heals a portion of Max HP at the start of your next turn.</p></div></article></div>
      </section>
    </>}
    {page==='skills'&&<>
      <div className="io-combat-skill-banner"><div><span className="io-combat-eyebrow">SKILL GACHA · RANK {state.skillGachaRank}/{SKILL_GACHA_RANK_MAX}</span><h2>Improve rarity odds through Gacha ranks</h2><p>All rarities are in the pool from Rank 1; each rank shifts probability away from Common. At Rank 30, Mythic is 0.50% base chance and Common, Uncommon, Rare, and Epic each have 24.875% base chance (pity can override a roll).</p><div className="io-combat-skill-progress"><span style={{width:(state.skillGachaRank/SKILL_GACHA_RANK_MAX*100)+'%'}}/></div></div><div className="io-combat-pull-box"><span><Coins size={15}/> {fmt(state.coins)} DELVER COINS</span><button type="button" className="io-combat-button is-primary" disabled={mutating||state.coins<pullCost} onClick={()=>void mutate('/api/combat/skills/roll')}>{mutating?'Rolling…':'Roll Skill · '+fmt(pullCost)}</button><small>Base odds · Common {(gachaOdds.Common*100).toFixed(3)}% · Uncommon {(gachaOdds.Uncommon*100).toFixed(3)}% · Rare {(gachaOdds.Rare*100).toFixed(3)}% · Epic {(gachaOdds.Epic*100).toFixed(3)}% · Mythic {(gachaOdds.Mythic*100).toFixed(3)}%. Pulls {fmt(state.skillRolls)}. Epic pity {state.skillPityEpic}/9 · Mythic pity {state.skillPityMythic}/39.</small></div></div>
      {lastSkill&&<div className={'io-combat-skill-result '+rarityClass(lastSkill.rarity)}><Sparkles size={18}/><div><strong>{lastSkill.name}</strong><p>{lastSkill.duplicate?(lastSkill.rankedUp?'Ranked up to Rank '+fmt(lastSkill.rank)+'.':'Duplicate progress '+fmt(lastSkill.progress)+'/'+fmt(lastSkill.copiesNeeded)+' toward Rank '+fmt(lastSkill.rank+1)+'. Higher ranks require more duplicate copies.'):'Unlocked as a new Rank 1 active ability.'}</p></div><span>{lastSkill.rarity.toUpperCase()}</span></div>}
      {gachaRequirement&&<section className="io-combat-panel" style={{marginBottom:20}}><div className="io-combat-panel-head"><div><span className="io-combat-eyebrow">GACHA PROGRESSION</span><h2>Rank Up to {gachaRequirement.rank} · {gachaRequirement.unlocks}</h2><p>Requires {fmt(gachaRequirement.requiredPulls)} lifetime skill pulls and {fmt(gachaRequirement.requiredMarks)} Combat Marks. Current progress: {fmt(state.skillRolls)} pulls and {fmt(state.combatMarks)} Marks.</p></div><button type="button" className="io-combat-button is-primary" disabled={mutating||state.skillRolls<gachaRequirement.requiredPulls||state.combatMarks<gachaRequirement.requiredMarks} onClick={()=>void mutate('/api/combat/skills/rank-up')}>{state.skillRolls<gachaRequirement.requiredPulls?'Need '+fmt(gachaRequirement.requiredPulls-state.skillRolls)+' pulls':state.combatMarks<gachaRequirement.requiredMarks?'Need '+fmt(gachaRequirement.requiredMarks-state.combatMarks)+' Marks':'Rank Up Gacha'}</button></div></section>}
      <div className="io-combat-codex-toolbar"><div><span className="io-combat-eyebrow">SKILL CODEX</span><h2>{ownedSkills.length} / {COMBAT_SKILLS.length} discovered · {state.equippedAbilities.length}/{COMBAT_ABILITY_SLOTS} equipped</h2></div><button type="button" className="io-combat-button is-secondary" onClick={()=>setShowAllSkills(!showAllSkills)}>{showAllSkills?'Owned only':'Show all skills'}</button></div>
      <div className="io-combat-skill-grid">{visibleSkills.map(skill=>{const rank=rankOf(state,skill.id);const copies=state.skillCopyProgress[skill.id]??0;const needed=rank>0?combatSkillCopiesForNextRank(rank):0;const isEquipped=state.equippedAbilities.includes(skill.id);const unlocked=skillRarityUnlocked(skill.rarity,state.skillGachaRank);const rarityUnlockRank=({Common:1,Uncommon:2,Rare:3,Epic:4,Mythic:5} as const)[skill.rarity];const slotsFull=state.equippedAbilities.length>=COMBAT_ABILITY_SLOTS;return <article key={skill.id} className={'io-combat-skill-card '+rarityClass(skill.rarity)}><div className="io-combat-skill-card-head"><span>{skill.rarity.toUpperCase()}</span><b>{!unlocked?'LOCKED · GACHA '+rarityUnlockRank:rank?'RANK '+fmt(rank):'NOT OWNED'}</b></div><h3>{skill.name}</h3><p>{skillValue(skill,Math.max(1,rank),stats.speed)}</p>{rank>0&&<><small>{fmt(copies)} / {fmt(needed)} duplicate copies toward Rank {fmt(rank+1)}</small><div className="io-combat-skill-progress"><span style={{width:(copies/Math.max(1,needed)*100)+'%'}}/></div></>}<button type="button" className={isEquipped?'io-combat-button is-equipped':'io-combat-button'} disabled={mutating||!unlocked||rank===0||(!isEquipped&&slotsFull)} onClick={()=>void mutate('/api/combat/skills/equip',{skillId:skill.id,equip:!isEquipped})}>{!unlocked?'Unlock at Gacha Rank '+rarityUnlockRank:rank===0?'Roll to discover':isEquipped?'Unequip ability':slotsFull?'Ability slots full':'Equip ability'}</button></article>;})}</div>
    </>}

    {page==='arena'&&<>
      <div className="io-combat-arena-head"><div><span className="io-combat-eyebrow">ASYNC PVP · SERVER-RESOLVED</span><h2>Build vs. build</h2><p>Challenge a real player's saved loadout. Both ratings update after the battle; PvE health and dungeon progress are untouched.</p></div>
        <div className="io-combat-arena-rating"><span>YOUR ARENA RATING</span><strong>{fmt(arenaSelf?.rating??state.arenaRating)}</strong><small>{fmt(arenaSelf?.wins??state.arenaWins)} W · {fmt(arenaSelf?.losses??state.arenaLosses)} L</small></div></div>
      {arenaResult&&<section className={'io-combat-arena-result '+(arenaResult.winner==='you'?'is-win':'is-loss')}><div className="io-combat-arena-result-head"><span className="io-combat-eyebrow">{arenaResult.winner==='you'?'VICTORY':'DEFEAT'}</span><strong>{arenaResult.ratingChange>0?'+':''}{arenaResult.ratingChange} Rating</strong><small>vs. {arenaResult.opponent.username} · {fmt(arenaResult.rounds)} rounds</small></div><div className="io-combat-arena-result-log">{arenaResult.log.map((line,index)=><p key={index}>{line}</p>)}</div></section>}
      <div className="io-combat-arena-toolbar"><div><span className="io-combat-eyebrow">RECENT DELVERS</span><h3>{arenaOpponents.length} opponents available</h3></div><button type="button" className="io-combat-button is-secondary" disabled={arenaLoading} onClick={()=>void loadArena()}>{arenaLoading?'Refreshing…':'Refresh list'}</button></div>
      {arenaLoading&&!arenaOpponents.length?<div className="io-combat-loading">SCOUTING THE ARENA…</div>:arenaOpponents.length===0?<div className="io-combat-arena-empty"><Swords size={26}/><h3>No opponents available.</h3></div>:<div className="io-combat-opponent-grid">{arenaOpponents.map(opponent=><article className={'io-combat-opponent-card '+(opponent.userId.startsWith('testbot:')?'is-practice-bot':'')} key={opponent.userId}>
        <div className="io-combat-opponent-head"><div><span className="io-combat-eyebrow">{opponent.userId.startsWith('testbot:')?'PRACTICE BOT · ':'RATING '}{fmt(opponent.rating)}</span><h3>{opponent.username}</h3></div><span className="io-combat-opponent-record">{fmt(opponent.wins)}W / {fmt(opponent.losses)}L</span></div>
        <div className="io-combat-opponent-stats"><span>LV {opponent.level}</span><span>BEST DEPTH {fmt(opponent.bestDepth)}</span><span>SKILL RANKS {fmt(opponent.skillRanks)}</span></div>
        <div className="io-combat-opponent-build"><p><b>{opponent.weaponName}</b> · {fmt(opponent.damage)} DMG</p><p><b>{opponent.armorName}</b> · {fmt(opponent.maxHealth)} HP</p><p>{fmt(opponent.speed)} SPD · {percent(opponent.critChance)} CRIT</p></div>
        <button type="button" className="io-combat-button is-primary" disabled={mutating||arenaCooldownMs>0} onClick={()=>void challengeArena(opponent.userId)}>{mutating?'Resolving…':arenaCooldownMs>0?'Challenge cooldown':opponent.userId.startsWith('testbot:')?'Fight practice bot':'Challenge player'}</button>
      </article>)}</div>}
      <p className="io-combat-arena-footnote">One challenge every 90 seconds. Synthetic Practice Bot opponents are included for testing; their records are fixed and only your rating changes. Real-player results are computed from saved gear and equipped abilities.</p>
    </>}
  </section>;
};
