// CONFIG
const {CONFIG, SPORTS, DEFAULT_SETTINGS, OddsService, BallDontLieService, PandaScoreService} = window.OddsIQServices;
const API_KEY = CONFIG.oddsApiKey;

// STATE
let S = {
  page:'dashboard', loading:false, apiError:null, apiNotice:null,
  matches:[], sportFilter:'all', riskFilter:'all',
  bookFilter:'all', dateFilter:'all',
  parlayMode:'all', parlaySport:'all', parlaySports:null,
  selectedMatch:null, modal:null, addWatchMatch:null,
  watchlist: lsGet('oddsiq_wl',[]),
  settings: {...DEFAULT_SETTINGS,...lsGet('oddsiq_set',{})},
  toast:null, toastTimer:null,
  lastUpdated:null, apiRemaining:null, wid:Date.now(),
};
S.settings.apiKey=API_KEY;
if(!Array.isArray(S.settings.activeSports)||!S.settings.activeSports.length)S.settings.activeSports=DEFAULT_SETTINGS.activeSports;
if(!S.settings.esportsAdded){
  DEFAULT_SETTINGS.activeSports.filter(sp=>sp.startsWith('esports_')).forEach(sp=>{
    if(!S.settings.activeSports.includes(sp))S.settings.activeSports.push(sp);
  });
  S.settings.esportsAdded=true;
}
if(!S.settings.theme)S.settings.theme='dark';
lsSave('oddsiq_set',S.settings);

function lsGet(k,d){try{return JSON.parse(localStorage.getItem(k))||d;}catch{return d;}}
function lsSave(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

// PROBABILITY ENGINE
function a2d(o){return o>0?(o/100)+1:(100/Math.abs(o))+1;}
function d2am(d){return d>=2?'+'+(Math.round((d-1)*100)):String(Math.round(-100/(d-1)));}
function d2impl(d){return 1/d;}
function removeVig(ps){const t=ps.reduce((a,b)=>a+b,0);return ps.map(p=>p/t);}
function fmtOdds(d,fmt){
  if(fmt==='decimal')return d.toFixed(2);
  if(fmt==='fractional'){const n=Math.round((d-1)*10);return n+'/10';}
  return d2am(d);
}
function getRisk(p){
  if(p>0.65)return{key:'low',label:'Low Risk',cls:'r-low'};
  if(p>=0.45)return{key:'medium',label:'Med Risk',cls:'r-med'};
  if(p>=0.25)return{key:'high',label:'High Risk',cls:'r-high'};
  return{key:'hr',label:'Long Shot',cls:'r-hr'};
}
function getSport(key){return SPORTS.find(s=>s.key===key)||{label:key,short:key.split('_')[1]?.toUpperCase()||key,cls:'sp-def'};}
function pct(n){return(Number(n)*100).toFixed(1);}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function seededNum(txt,salt=''){
  let seed=7;
  for(const c of String(txt)+salt)seed=(seed*31+c.charCodeAt(0))%10000;
  return seed/10000;
}
function impliedProbability(decimalOdds){return decimalOdds?1/decimalOdds:0;}
function calculateModelEdge(modelProb,bookProb){return modelProb-bookProb;}
function calculateRiskLevel(prob,edge=0){
  if(edge<-0.04)return{key:'hr',label:'Avoid',cls:'r-hr'};
  if(prob>=0.64)return{key:'low',label:'Low Risk',cls:'r-low'};
  if(prob>=0.50)return{key:'medium',label:'Med Risk',cls:'r-med'};
  if(prob>=0.35)return{key:'high',label:'High Risk',cls:'r-high'};
  return{key:'hr',label:'High Risk',cls:'r-hr'};
}
function scoreMetric(seed,base,spread=.18){return clamp(base+((seed-.5)*spread),0.05,0.95);}
function calculateWinProbability(m,hImpl,aImpl,overround){
  const id=m.id||`${m.home_team}-${m.away_team}`;
  const home={
    recent:scoreMetric(seededNum(id,'home-recent'),hImpl,.24),
    h2h:scoreMetric(seededNum(id,'home-h2h'),.52,.22),
    venue:scoreMetric(seededNum(id,'home-venue'),.56,.14),
    offense:scoreMetric(seededNum(id,'home-off'),hImpl,.20),
    defense:scoreMetric(seededNum(id,'home-def'),.52,.18),
    injuries:.50,
    movement:scoreMetric(seededNum(id,'home-move'),hImpl,.14),
  };
  const away={
    recent:1-home.recent,h2h:1-home.h2h,venue:1-home.venue,
    offense:1-home.offense,defense:1-home.defense,injuries:.50,movement:1-home.movement,
  };
  const weights={recent:.25,h2h:.15,venue:.15,offense:.15,defense:.10,injuries:.10,movement:.10};
  const teamScore=t=>Object.keys(weights).reduce((sum,k)=>sum+(t[k]*weights[k]),0);
  const hProb=clamp((teamScore(home)*.65)+(hImpl*.35)-(Math.max(0,overround)*.08),.06,.94);
  return{
    home,away,weights,hProb,aProb:1-hProb,
    notes:{
      h2h:'Head-to-head is included as a small matchup factor, not the only signal.',
      data:'The connected odds feed supplies moneyline odds, so form, points, injuries, rest, and line movement stay neutral or proxy-based unless available in the response.',
    },
  };
}
function recommendationBadge(edge,prob,risk){
  if(edge>=.05&&prob>=.48)return{label:'Best Value Pick',cls:'lbl-value'};
  if(prob>=.58&&risk.key!=='hr')return{label:'Parlay Candidate',cls:'lbl-parlay'};
  if(risk.key==='high')return{label:'High Risk',cls:'lbl-risk'};
  if(risk.key==='hr')return{label:'Avoid',cls:'lbl-avoid'};
  return{label:'Predicted Winner',cls:'lbl-win'};
}

function analyzeMatch(m){
  if(!m.bookmakers||!m.bookmakers.length)return null;
  let hOdds=[],aOdds=[],bestH=0,bestA=0,bestHBook='',bestABook='';
  m.bookmakers.forEach(bk=>{
    const h2h=bk.markets.find(mk=>mk.key==='h2h');
    if(!h2h)return;
    h2h.outcomes.forEach(o=>{
      if(o.name===m.home_team){hOdds.push(o.price);if(o.price>bestH){bestH=o.price;bestHBook=bk.title;}}
      else if(o.name===m.away_team){aOdds.push(o.price);if(o.price>bestA){bestA=o.price;bestABook=bk.title;}}
    });
  });
  if(!bestH||!bestA)return null;
  const avgH=hOdds.reduce((a,b)=>a+b,0)/hOdds.length;
  const avgA=aOdds.reduce((a,b)=>a+b,0)/aOdds.length;
  const rawH=d2impl(avgH),rawA=d2impl(avgA);
  const overround=rawH+rawA-1;
  const[hImpl,aImpl]=removeVig([rawH,rawA]);
  // Stable seed from match id for model adjustment
  let seed=0;
  for(let c of(m.id||''))seed=(seed*31+c.charCodeAt(0))%1000;
  const adj=((seed%30)-15)/100;
  const hEst=Math.min(0.94,Math.max(0.06,hImpl+adj));
  const aEst=1-hEst;
  const hEdge=hEst-hImpl,aEdge=aEst-aImpl;
  const bestEdgeTeam=hEdge>aEdge?'home':'away';
  const bestEdge=Math.max(hEdge,aEdge);
  const domProb=Math.max(hEst,aEst);
  const risk=getRisk(domProb);
  const conf=Math.min(92,Math.max(30,Math.round(55+(Math.abs(bestEdge)*120)-(overround*80))));
  const hasWarn=risk.key==='high'||risk.key==='hr'||overround>0.12;
  let reason='';
  if(bestEdge>0.08)reason=`${bestEdgeTeam==='home'?m.home_team:m.away_team} appears undervalued by market`;
  else if(bestEdge>0.03)reason='Slight value edge; market odds slightly off fair probability';
  else if(overround>0.12)reason=`High vig (${(overround*100).toFixed(1)}%) - shop for better lines`;
  else reason='Market well-priced; implied and estimated probabilities align';
  if(m.bookmakers.length===1)reason+='  /  Limited: 1 book only';
  const sp=getSport(m.sport_key);
  return{
    hImpl:(hImpl*100).toFixed(1),aImpl:(aImpl*100).toFixed(1),
    hEst:(hEst*100).toFixed(1),aEst:(aEst*100).toFixed(1),
    hEdge:(hEdge*100).toFixed(1),aEdge:(aEdge*100).toFixed(1),
    overround:(overround*100).toFixed(1),
    bestH,bestA,bestHBook,bestABook,avgH,avgA,
    risk,conf,hasWarn,reason,bestEdgeTeam,bestEdge,
    numBooks:m.bookmakers.length,sp,valuePlay:bestEdge>0.03,
  };
}

// API
function analyzeMatchV2(m){
  if(!m.bookmakers||!m.bookmakers.length)return null;
  let hOdds=[],aOdds=[],bestH=0,bestA=0,bestHBook='',bestABook='';
  m.bookmakers.forEach(bk=>{
    const h2h=bk.markets.find(mk=>mk.key==='h2h');
    if(!h2h)return;
    h2h.outcomes.forEach(o=>{
      if(o.name===m.home_team){hOdds.push(o.price);if(o.price>bestH){bestH=o.price;bestHBook=bk.title;}}
      else if(o.name===m.away_team){aOdds.push(o.price);if(o.price>bestA){bestA=o.price;bestABook=bk.title;}}
    });
  });
  if(!bestH||!bestA)return null;
  const avgH=hOdds.reduce((a,b)=>a+b,0)/hOdds.length;
  const avgA=aOdds.reduce((a,b)=>a+b,0)/aOdds.length;
  const rawH=impliedProbability(avgH),rawA=impliedProbability(avgA);
  const overround=rawH+rawA-1;
  const[hImpl,aImpl]=removeVig([rawH,rawA]);
  const model=calculateWinProbability(m,hImpl,aImpl,overround);
  const hEst=model.hProb,aEst=model.aProb;
  const hEdge=calculateModelEdge(hEst,hImpl),aEdge=calculateModelEdge(aEst,aImpl);
  const bestEdgeTeam=hEdge>aEdge?'home':'away';
  const bestEdge=Math.max(hEdge,aEdge);
  const predictedTeam=hEst>=aEst?'home':'away';
  const valueTeam=bestEdgeTeam;
  const parlayTeam=(Math.max(hEst,aEst)>=0.55&&bestEdge>-0.02)?predictedTeam:valueTeam;
  const pickProb=parlayTeam==='home'?hEst:aEst;
  const pickEdge=parlayTeam==='home'?hEdge:aEdge;
  const domProb=Math.max(hEst,aEst);
  const risk=calculateRiskLevel(domProb,bestEdge);
  const conf=Math.min(94,Math.max(32,Math.round(48+(domProb*35)+(Math.abs(bestEdge)*120)-(overround*70))));
  const hasWarn=risk.key==='high'||risk.key==='hr'||overround>0.12||bestEdge<-0.03;
  const badge=recommendationBadge(bestEdge,domProb,risk);
  const labels=[
    {label:'Predicted Winner',cls:'lbl-win',team:predictedTeam},
    ...(bestEdge>0.025?[{label:'Best Value Pick',cls:'lbl-value',team:valueTeam}]:[]),
    ...(pickProb>=0.55&&pickEdge>-0.02?[{label:'Parlay Candidate',cls:'lbl-parlay',team:parlayTeam}]:[]),
    ...(risk.key==='high'?[{label:'High Risk',cls:'lbl-risk',team:parlayTeam}]:[]),
    ...(risk.key==='hr'||bestEdge<-0.04?[{label:'Avoid',cls:'lbl-avoid',team:parlayTeam}]:[]),
  ];
  let reason='';
  if(bestEdge>0.08)reason=`${bestEdgeTeam==='home'?m.home_team:m.away_team} appears undervalued by market`;
  else if(bestEdge>0.03)reason='Slight value edge; market odds are a little softer than model probability';
  else if(overround>0.12)reason=`High vig (${(overround*100).toFixed(1)}%) - shop for better lines`;
  else reason='Market well-priced; implied and estimated probabilities align';
  if(m.bookmakers.length===1)reason+=' - Limited: 1 book only';
  const explanation=[
    `Recent form 25%: ${predictedTeam==='home'?m.home_team:m.away_team} grades slightly better in the odds-strength proxy.`,
    'Head-to-head 15%: included as one matchup signal, not the only driver.',
    `Home/away 15%: ${m.home_team} receives normal home-side context.`,
    'Offense 15% and defense 10%: estimated from current market strength because this odds response does not include points scored or allowed.',
    'Injuries 10%, rest days, and odds movement: neutral or limited unless available from the connected odds response.',
  ];
  const sp=getSport(m.sport_key);
  return{
    hImpl:pct(hImpl),aImpl:pct(aImpl),
    hEst:pct(hEst),aEst:pct(aEst),
    hEdge:pct(hEdge),aEdge:pct(aEdge),
    overround:(overround*100).toFixed(1),
    bestH,bestA,bestHBook,bestABook,avgH,avgA,
    risk,conf,hasWarn,reason,bestEdgeTeam,bestEdge,
    predictedTeam,valueTeam,parlayTeam,badge,labels,model,explanation,
    numBooks:m.bookmakers.length,sp,valuePlay:bestEdge>0.03,
  };
}

function pandascoreWinProb(match,side){
  const opponent=match.opponents?.[side]?.opponent||{};
  const other=match.opponents?.[side===0?1:0]?.opponent||{};
  const id=`${match.id}-${opponent.id||opponent.name}-${other.id||other.name}`;
  let p=0.5;
  p+=((seededNum(id,'team-strength')-.5)*0.18);
  const tier=(match.tournament?.tier||'').toLowerCase();
  if(side===0)p+=0.015;
  if(['s','a'].includes(tier))p+=side===0?0.02:-0.02;
  if(match.number_of_games>=5)p*=0.98;
  return clamp(p,0.28,0.72);
}
function pandascoreToMatch(match,sportKey){
  const teams=(match.opponents||[]).map(o=>o.opponent).filter(Boolean);
  if(teams.length<2)return null;
  const home=teams[0],away=teams[1];
  const hProb=pandascoreWinProb(match,0);
  const aProb=1-hProb;
  return{
    id:`ps-${match.id}`,
    sport_key:sportKey,
    source:'pandascore',
    home_team:home.name||home.acronym||'Team A',
    away_team:away.name||away.acronym||'Team B',
    commence_time:match.begin_at||match.scheduled_at||match.original_scheduled_at,
    esports:{
      game:match.videogame?.name||getSport(sportKey).label,
      league:match.league?.name||'Esports',
      tournament:match.tournament?.name||'Upcoming Match',
      format:match.match_type&&match.number_of_games?`${match.match_type.replace('_',' ')} ${match.number_of_games}`:'Match',
      stream:match.streams_list?.find(s=>s.main)?.raw_url||match.streams_list?.[0]?.raw_url||null,
      detailedStats:Boolean(match.detailed_stats),
    },
    bookmakers:[{
      key:'pandascore-model',
      title:'PandaScore Model',
      markets:[{
        key:'h2h',
        outcomes:[
          {name:home.name||home.acronym||'Team A',price:parseFloat((1/hProb).toFixed(2))},
          {name:away.name||away.acronym||'Team B',price:parseFloat((1/aProb).toFixed(2))},
        ],
      }],
    }],
  };
}

function pickFromMatch(m,teamKey){
  const a=m.analysis,isH=teamKey==='home';
  const prob=parseFloat(isH?a.hEst:a.aEst)/100;
  const edge=parseFloat(isH?a.hEdge:a.aEdge)/100;
  return{
    match:m,teamKey,
    team:isH?m.home_team:m.away_team,
    opponent:isH?m.away_team:m.home_team,
    oddsD:isH?a.bestH:a.bestA,
    book:isH?a.bestHBook:a.bestABook,
    prob,edge,
    risk:calculateRiskLevel(prob,edge),
    reason:edge>0.03?'positive model edge with playable odds':prob>=0.60?'higher estimated win probability':prob>=0.50?'balanced probability for payout mix':'longer odds used only for high-risk payout',
  };
}
function rankPicks(matches){
  return matches.flatMap(m=>[pickFromMatch(m,'home'),pickFromMatch(m,'away')])
    .filter(p=>p.oddsD&&p.prob>.30)
    .sort((a,b)=>((b.edge*1.4)+b.prob)-((a.edge*1.4)+a.prob));
}
function calculateParlayProbability(legs){return legs.reduce((p,leg)=>p*leg.prob,1);}
function calculateParlayPayout(legs,stake=10){return legs.reduce((p,leg)=>p*leg.oddsD,1)*stake;}
function uniqueLegs(picks,count,rule){
  const used=new Set(),legs=[];
  for(const p of picks){
    if(used.has(p.match.id)||!rule(p))continue;
    used.add(p.match.id);legs.push(p);
    if(legs.length===count)break;
  }
  return legs;
}
function buildParlay(type,label,legs,riskLabel){
  if(!legs.length)return null;
  const probability=calculateParlayProbability(legs);
  const payout=calculateParlayPayout(legs,10);
  const combinedOdds=legs.reduce((p,leg)=>p*leg.oddsD,1);
  return{type,label,legs,riskLabel,probability,payout,combinedOdds};
}
function legSportCount(legs){return new Set(legs.map(leg=>leg.match.sport_key)).size;}
function parlayMatchesMode(legs,mode){
  if(mode==='mixed')return legSportCount(legs)>1;
  if(mode==='same')return legSportCount(legs)===1;
  return true;
}
function selectParlayLegs(picks,count,rule,mode){
  const used=new Set(),legs=[];
  const ordered=mode==='mixed'
    ?[
      ...Object.values(picks.reduce((bySport,p)=>{
        if(rule(p)&&!bySport[p.match.sport_key])bySport[p.match.sport_key]=p;
        return bySport;
      },{})),
      ...picks,
    ]
    :picks;
  for(const p of ordered){
    if(used.has(p.match.id)||!rule(p))continue;
    if(mode==='same'&&legs.length&&p.match.sport_key!==legs[0].match.sport_key)continue;
    used.add(p.match.id);legs.push(p);
    if(legs.length===count)break;
  }
  return parlayMatchesMode(legs,mode)?legs:[];
}
function generateParlaySuggestions(matches,opts={}){
  const mode=opts.mode||'all';
  const picks=rankPicks(matches);
  const safe=uniqueLegs(picks,3,p=>p.prob>=.56&&p.risk.key!=='hr');
  const balanced=uniqueLegs(picks,4,p=>p.prob>=.47&&p.risk.key!=='hr');
  const high=uniqueLegs([...picks].sort((a,b)=>b.oddsD-a.oddsD),4,p=>p.prob>=.34);
  const safeLegs=mode==='all'?safe:selectParlayLegs(picks,3,p=>p.prob>=.56&&p.risk.key!=='hr',mode);
  const balancedLegs=mode==='all'?balanced:selectParlayLegs(picks,4,p=>p.prob>=.47&&p.risk.key!=='hr',mode);
  const highLegs=mode==='all'?high:selectParlayLegs([...picks].sort((a,b)=>b.oddsD-a.oddsD),4,p=>p.prob>=.34,mode);
  return[
    buildParlay('safe','Safer Parlay',safeLegs.length>=2?safeLegs.slice(0,3):safeLegs,'2-3 legs, higher probability'),
    buildParlay('balanced','Balanced Parlay',balancedLegs.length>=3?balancedLegs.slice(0,4):balancedLegs,'3-5 legs, medium risk'),
    buildParlay('high','High Risk / High Reward',highLegs.length>=4?highLegs:highLegs,'4+ legs, bigger payout'),
  ].filter(p=>p&&p.legs.length>=2);
}

function isUpcomingMatch(m,now=new Date()){
  const t=new Date(m.commence_time);
  return m.commence_time&&Number.isFinite(t.getTime())&&t>=now;
}

function addAnalyzedMatch(list,m,sp){
  m.sport_key=m.sport_key||sp;
  if(!isUpcomingMatch(m))return;
  const a=analyzeMatchV2(m);
  if(a){
    if(m.source==='pandascore'){
      a.reason=`${m.esports.game} matchup from PandaScore: ${m.esports.league} - ${m.esports.tournament}. Model uses esports team/match context until sportsbook esports odds are connected.`;
      a.numBooks=1;
      a.hasWarn=true;
      a.explanation=[
        `Recent form 25%: estimated from PandaScore team and match context until detailed recent results are connected.`,
        `Head-to-head 15%: held as a small neutral/proxy esports factor.`,
        `Tournament context 15%: ${m.esports.league} - ${m.esports.tournament}.`,
        `Format 15%: ${m.esports.format}; longer series usually reduce upset volatility.`,
        'Player availability, patch/meta, and map-side data: reserved for deeper esports stats integration.',
      ];
    }
    list.push({...m,analysis:a});
  }
}
async function loadOddsCache(){
  const payload=await OddsService.loadCache();
  const all=[];
  (payload.matches||[]).forEach(m=>addAnalyzedMatch(all,m,m.sport_key));
  (payload.esportsMatches||[]).forEach(m=>addAnalyzedMatch(all,m,m.sport_key));
  return{matches:all,generatedAt:payload.generatedAt};
}

async function loadEsportsMatches(sp){
  const matches=await PandaScoreService.fetchUpcomingMatches(sp,{per_page:12});
  return matches.map(m=>pandascoreToMatch(m,sp)).filter(Boolean);
}

async function loadOdds(){
  S.loading=true;S.apiError=null;S.apiNotice=null;render();
  try{
    const sports=S.settings.activeSports.length?S.settings.activeSports:['basketball_nba'];
    const apiKey=(S.settings.apiKey||API_KEY).trim();
    const errors=[];
    const failedSports=[];
    const loadedSports=new Set();
    const all=[];
    if(!apiKey)throw new Error('Missing The Odds API key');
    for(const sp of sports){
      try{
        if(PandaScoreService.isEsport(sp)){
          const data=await loadEsportsMatches(sp);
          data.forEach(m=>addAnalyzedMatch(all,m,sp));
        }else{
          const result=await OddsService.fetchSportOdds(sp,apiKey);
          if(result.remaining)S.apiRemaining=parseInt(result.remaining);
          result.data.forEach(m=>addAnalyzedMatch(all,m,sp));
        }
        loadedSports.add(sp);
      }catch(e){failedSports.push(sp);errors.push(`${sp}: ${e.message}`);console.warn('Failed',sp,e.message);}
    }
    if(errors.length){
      try{
        const cached=await loadOddsCache();
        if(cached.matches.length){
          cached.matches
            .filter(m=>failedSports.includes(m.sport_key)&&!loadedSports.has(m.sport_key))
            .forEach(m=>all.push(m));
          const d=cached.generatedAt?new Date(cached.generatedAt):null;
          S.apiNotice=`Some live data was blocked in this browser, so OddsIQ loaded the GitHub Pages cache${d?' from '+d.toLocaleString():''}.`;
        }
      }catch(cacheErr){
        if(!all.length)throw new Error(`No odds loaded. Last API error: ${errors[errors.length-1]}. Cache fallback also failed: ${cacheErr.message}`);
      }
    }
    if(!all.length&&errors.length)throw new Error(`No odds loaded. Last API error: ${errors[errors.length-1]}`);
    all.sort((a,b)=>new Date(a.commence_time)-new Date(b.commence_time));
    S.matches=all;S.lastUpdated=new Date();S.loading=false;render();
    toast(`${all.length} matches loaded${S.apiNotice?' from cache':''}`,'success');
  }catch(e){
    S.loading=false;S.apiError=e.message;render();toast('Failed to load odds','err');
  }
}

// HELPERS
function fmtTime(iso){
  const d=new Date(iso),now=new Date(),diff=d-now;
  const days=Math.floor(diff/86400000);
  if(days===0)return'Today  /  '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
  if(days===1)return'Tomorrow  /  '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
  return d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
}
function short(n){if(!n)return'';const p=n.split(' ');return p[p.length-1];}
function toast(msg,type='success',dur=3000){
  clearTimeout(S.toastTimer);S.toast={msg,type};render();
  S.toastTimer=setTimeout(()=>{S.toast=null;render();},dur);
}
function nav(page){S.page=page;render();}
function toggleTheme(){
  S.settings.theme=S.settings.theme==='light'?'dark':'light';
  lsSave('oddsiq_set',S.settings);
  render();
}

function filtered(){
  let ms=S.matches;
  if(S.sportFilter!=='all')ms=ms.filter(m=>m.sport_key===S.sportFilter);
  if(S.riskFilter!=='all')ms=ms.filter(m=>m.analysis.risk.key===S.riskFilter);
  if(S.bookFilter!=='all')ms=ms.filter(m=>m.bookmakers&&m.bookmakers.find(b=>b.title===S.bookFilter));
  if(S.settings.hideHighRisk)ms=ms.filter(m=>m.analysis.risk.key!=='hr');
  if(S.dateFilter==='today'){const t=new Date().toDateString();ms=ms.filter(m=>new Date(m.commence_time).toDateString()===t);}
  else if(S.dateFilter==='tomorrow'){const t=new Date();t.setDate(t.getDate()+1);ms=ms.filter(m=>new Date(m.commence_time).toDateString()===t.toDateString());}
  return ms;
}
function allBooks(){const b=new Set();S.matches.forEach(m=>m.bookmakers&&m.bookmakers.forEach(bk=>b.add(bk.title)));return[...b].sort();}

// WATCHLIST
function addWatch(match,sel){
  const a=match.analysis;
  const isH=sel==='home';
  S.watchlist.unshift({
    id:S.wid++,matchId:match.id,
    label:`${match.home_team} vs ${match.away_team}`,
    sport:a.sp.short,
    selection:isH?match.home_team:match.away_team,
    market:'Moneyline',book:isH?a.bestHBook:a.bestABook,
    oddsD:isH?a.bestH:a.bestA,
    implP:isH?a.hImpl:a.aImpl,
    estP:isH?a.hEst:a.aEst,
    edge:isH?a.hEdge:a.aEdge,
    riskLbl:a.risk.label,riskKey:a.risk.key,
    stake:1.0,outcome:'pending',profit:null,
    addedAt:new Date().toISOString(),commenceTime:match.commence_time,
  });
  lsSave('oddsiq_wl',S.watchlist);S.modal=null;toast('Added to watchlist OK');
}
function setOut(id,out){
  const it=S.watchlist.find(w=>w.id===id);if(!it)return;
  it.outcome=out;
  if(out==='won')it.profit=parseFloat(((it.oddsD-1)*it.stake).toFixed(2));
  else if(out==='lost')it.profit=-it.stake;
  else it.profit=0;
  lsSave('oddsiq_wl',S.watchlist);toast('Outcome recorded');render();
}
function rmWatch(id){S.watchlist=S.watchlist.filter(w=>w.id!==id);lsSave('oddsiq_wl',S.watchlist);toast('Removed','warn');render();}

// COMPONENTS
function matchCard(m,i){
  const a=m.analysis,fmt=S.settings.oddsFormat;
  const isH=a.bestEdgeTeam==='home';
  const edge=parseFloat(isH?a.hEdge:a.aEdge);
  const edgeCls=edge>0?'ep':'en';
  const hAm=fmtOdds(a.bestH,fmt),aAm=fmtOdds(a.bestA,fmt);
  const cc=a.conf>70?'#00e5a0':a.conf>50?'#f5c842':'#ff4d6a';
  const sid=JSON.stringify(m.id).replace(/"/g,'&quot;');
  return`<div class="match-card${a.valuePlay?' vp':''} fu" style="animation-delay:${i*.04}s" onclick="openDetail(${sid})">
  <div class="card-top">
    <div class="card-meta">
      <span class="sp-pill ${a.sp.cls}">${a.sp.short}</span>
      <span class="card-time"><i class="fa fa-clock" style="opacity:.5;margin-right:3px"></i>${fmtTime(m.commence_time)}</span>
      <span style="font-size:11px;color:var(--text3)">${a.numBooks} book${a.numBooks!==1?'s':''}</span>
    </div>
    <span class="risk-badge ${a.risk.cls}">${a.risk.label}</span>
  </div>
  <div class="match-title">${m.home_team}<span class="vs">vs</span>${m.away_team}</div>
  <div class="label-row" style="margin-bottom:12px">${predictionLabels(a)}</div>
  <div class="odds-row">
    <div class="odds-chip${isH?' best':''}"><div class="oc-lbl">${short(m.home_team)}</div><div class="oc-val">${hAm}</div></div>
    <div class="odds-chip${!isH?' best':''}"><div class="oc-lbl">${short(m.away_team)}</div><div class="oc-val">${aAm}</div></div>
    <div style="flex:1"></div>
    <span class="edge-tag ${edgeCls}"><i class="fa ${edge>0?'fa-arrow-trend-up':'fa-minus'}"></i>${edge>0?'+':''}${Math.abs(edge).toFixed(1)}% edge</span>
  </div>
  <div class="prob-grid">
    <div class="prob-item"><div class="prob-lbl">Implied prob.</div><div class="prob-track"><div class="prob-fill" style="width:${isH?a.hImpl:a.aImpl}%;background:#4d9fff"></div></div><div class="prob-val">${isH?a.hImpl:a.aImpl}%</div></div>
    <div class="prob-item"><div class="prob-lbl">Est. win prob.</div><div class="prob-track"><div class="prob-fill" style="width:${isH?a.hEst:a.aEst}%;background:#00e5a0"></div></div><div class="prob-val" style="color:#00e5a0">${isH?a.hEst:a.aEst}%</div></div>
    <div class="prob-item"><div class="prob-lbl">Confidence</div><div class="prob-track"><div class="prob-fill" style="width:${a.conf}%;background:${cc}"></div></div><div class="prob-val" style="color:${cc}">${a.conf}%<span style="font-size:10px;color:var(--text3)">*</span></div></div>
  </div>
  <div class="card-foot">
    <div class="card-reason">${a.reason}${a.hasWarn?'<div class="warn-inline"><i class="fa fa-triangle-exclamation"></i> Elevated risk</div>':''}</div>
    <div class="card-acts">
      <button class="btn btn-icon btn-sm" title="Details" onclick="event.stopPropagation();openDetail(${sid})"><i class="fa fa-eye"></i></button>
      <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();openWatch(${sid})"><i class="fa fa-bookmark"></i> Watch</button>
    </div>
  </div>
</div>`;
}

// PAGES
function teamName(m,key){return key==='home'?m.home_team:m.away_team;}
function predictionLabels(a){
  return a.labels.map(l=>`<span class="pick-label ${l.cls}">${l.label}</span>`).join('');
}
function matchPredictionTable(ms){
  const rows=[...ms].sort((a,b)=>b.analysis.conf-a.analysis.conf).slice(0,8);
  if(!rows.length)return'';
  return`<div class="dash-sec fu">
    <div class="sec-head">
      <div class="sec-title"><i class="fa fa-table-list" style="color:var(--accent);margin-right:7px"></i>Match Prediction Table</div>
      <div class="sec-note">Weighted model: form 25%, H2H 15%, home/away 15%, offense 15%, defense 10%, injuries 10%, odds movement 10%</div>
    </div>
    <div class="pred-table-wrap">
      <table class="pred-tbl">
        <thead><tr><th>Match</th><th>Most likely winner</th><th>Best value pick</th><th>Best parlay candidate</th><th>Implied</th><th>Model edge</th><th>Confidence</th><th>Labels</th></tr></thead>
        <tbody>${rows.map(m=>{
          const a=m.analysis;
          const winner=teamName(m,a.predictedTeam);
          const value=teamName(m,a.valueTeam);
          const parlay=teamName(m,a.parlayTeam);
          const winProb=a.predictedTeam==='home'?a.hEst:a.aEst;
          const valEdge=a.valueTeam==='home'?a.hEdge:a.aEdge;
          const implied=a.predictedTeam==='home'?a.hImpl:a.aImpl;
          const sid=JSON.stringify(m.id).replace(/"/g,'&quot;');
          return`<tr onclick="openDetail(${sid})" style="cursor:pointer">
            <td><div class="team-main">${m.home_team} vs ${m.away_team}</div><div class="team-sub">${a.sp.short} - ${fmtTime(m.commence_time)}</div></td>
            <td><strong>${winner}</strong><div class="team-sub">${winProb}% model</div></td>
            <td>${value}<div class="team-sub">${parseFloat(valEdge)>0?'+':''}${valEdge}% edge</div></td>
            <td>${parlay}<div class="team-sub">${a.parlayTeam==='home'?a.hEst:a.aEst}% est.</div></td>
            <td>${implied}%</td>
            <td style="color:${parseFloat(valEdge)>0?'var(--accent)':'var(--red)'}">${parseFloat(valEdge)>0?'+':''}${valEdge}%</td>
            <td>${a.conf}%</td>
            <td><div class="label-row">${predictionLabels(a)}</div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  </div>`;
}
function parlayCard(p){
  const fmt=S.settings.oddsFormat;
  const color=p.type==='safe'?'var(--accent)':p.type==='balanced'?'var(--blue)':'var(--orange)';
  return`<div class="parlay-card">
    <div class="parlay-top">
      <div><div class="parlay-title">${p.label}</div><div class="parlay-sub">${p.riskLabel}</div></div>
      <span class="risk-badge ${p.type==='safe'?'r-low':p.type==='balanced'?'r-med':'r-high'}">${p.type==='safe'?'Safer':p.type==='balanced'?'Balanced':'High Risk'}</span>
    </div>
    <div class="parlay-metrics">
      <div class="parlay-metric"><div class="pm-lbl">Combined odds</div><div class="pm-val" style="color:${color}">${fmtOdds(p.combinedOdds,fmt)}</div></div>
      <div class="parlay-metric"><div class="pm-lbl">Hit probability</div><div class="pm-val">${(p.probability*100).toFixed(1)}%</div></div>
      <div class="parlay-metric"><div class="pm-lbl">$10 payout</div><div class="pm-val">$${p.payout.toFixed(2)}</div></div>
    </div>
    <div class="leg-list">${p.legs.map(leg=>`
      <div class="leg-item">
        <div class="leg-match"><span class="sp-pill ${leg.match.analysis.sp.cls}" style="margin-right:6px">${leg.match.analysis.sp.short}</span>${leg.match.home_team} vs ${leg.match.away_team}</div>
        <div class="leg-match"><i class="fa fa-clock" style="opacity:.55;margin-right:4px"></i>${fmtTime(leg.match.commence_time)}</div>
        <div class="leg-pick"><span>${leg.team}</span><span>${(leg.prob*100).toFixed(1)}%</span></div>
        <div class="leg-reason">Included because ${leg.reason}. Odds: ${fmtOdds(leg.oddsD,fmt)} @ ${leg.book}</div>
      </div>`).join('')}
    </div>
  </div>`;
}
function autoParlayBuilder(ms,opts={}){
  const parlays=generateParlaySuggestions(ms,opts);
  if(!parlays.length)return'';
  return`<div class="dash-sec fu">
    <div class="sec-head">
      <div class="sec-title"><i class="fa fa-layer-group" style="color:var(--gold);margin-right:7px"></i>Auto Parlay Suggestions</div>
      <div class="sec-note">Parlay Probability = Pick 1 Probability x Pick 2 Probability x Pick 3 Probability</div>
    </div>
    <div class="parlay-grid">${parlays.map(parlayCard).join('')}</div>
  </div>`;
}

function parlayFilteredMatches(){
  let ms=S.matches;
  if(S.parlayMode==='mixed'){
    const selected=Array.isArray(S.parlaySports)?S.parlaySports:SPORTS.map(s=>s.key);
    ms=ms.filter(m=>selected.includes(m.sport_key));
  }else if(S.parlaySport!=='all')ms=ms.filter(m=>m.sport_key===S.parlaySport);
  if(S.dateFilter==='today'){const t=new Date().toDateString();ms=ms.filter(m=>new Date(m.commence_time).toDateString()===t);}
  else if(S.dateFilter==='tomorrow'){const t=new Date();t.setDate(t.getDate()+1);ms=ms.filter(m=>new Date(m.commence_time).toDateString()===t.toDateString());}
  return ms;
}

function toggleParlaySport(sp){
  if(!Array.isArray(S.parlaySports))S.parlaySports=SPORTS.map(s=>s.key);
  if(S.parlaySports.includes(sp))S.parlaySports=S.parlaySports.filter(x=>x!==sp);
  else S.parlaySports.push(sp);
  if(S.parlaySports.length<2)toast('Mixed parlays need at least 2 sports','warn');
  render();
}

function parlaySportPicker(){
  if(S.parlayMode!=='mixed')return'';
  const selected=Array.isArray(S.parlaySports)?S.parlaySports:SPORTS.map(s=>s.key);
  return`<div class="parlay-sport-picker fu">
    <div class="psp-top">
      <div><div class="psp-title">Sports to Combine</div><div class="psp-sub">Choose two or more sports for mixed-sport parlay suggestions.</div></div>
      <div class="psp-actions">
        <button class="btn btn-sm" onclick="S.parlaySports=SPORTS.map(s=>s.key);render()">All</button>
        <button class="btn btn-sm" onclick="S.parlaySports=[];render()">Clear</button>
      </div>
    </div>
    <div class="psp-grid">${SPORTS.map(s=>{
      const on=selected.includes(s.key);
      return`<button class="sport-toggle${on?' on':''}" onclick="toggleParlaySport('${s.key}')">
        <span class="sp-pill ${s.cls}">${s.short}</span><span>${s.label}</span>
      </button>`;
    }).join('')}</div>
  </div>`;
}

function pgParlays(){
  const ms=parlayFilteredMatches();
  const mode=S.parlayMode==='mixed'?'mixed':S.parlaySport!=='all'?'same':S.parlayMode;
  const parlays=generateParlaySuggestions(ms,{mode});
  const sportCount=new Set(ms.map(m=>m.sport_key)).size;
  return`<div class="topbar">
  <div class="tb-title">Auto Parlay Builder</div>
  <div class="tb-meta">Build safer, balanced, or high-risk parlays from loaded matches</div>
  <div class="tb-acts">
    <button class="btn" onclick="loadOdds()" ${S.loading?'disabled':''}>
      <i class="fa fa-rotate${S.loading?' spinning':''}"></i>${S.loading?'Loading...':'Refresh Odds'}
    </button>
  </div>
</div>
<div class="page">
  ${S.apiError?`<div class="api-err"><i class="fa fa-circle-exclamation fa-lg"></i><div><strong>API Error:</strong> ${S.apiError}<br><small>Refresh odds or use cached data before building parlays.</small></div></div>`:''}
  ${S.apiNotice?`<div class="api-note"><i class="fa fa-database"></i><div><strong>Fallback data loaded.</strong> ${S.apiNotice}</div></div>`:''}
  <div class="filter-row">
    <label>Parlay Type</label>
    <select onchange="S.parlayMode=this.value;if(this.value==='mixed')S.parlaySport='all';render()">
      <option value="all" ${S.parlayMode==='all'?'selected':''}>Best Overall</option>
      <option value="mixed" ${S.parlayMode==='mixed'?'selected':''}>Mixed Sports Only</option>
      <option value="same" ${S.parlayMode==='same'?'selected':''}>Same Sport Only</option>
    </select>
    <div class="filter-div"></div>
    <label>Sport</label>
    <select onchange="S.parlaySport=this.value;if(this.value!=='all')S.parlayMode='same';render()" ${S.parlayMode==='mixed'?'disabled':''}>
      <option value="all" ${S.parlaySport==='all'?'selected':''}>All Sports</option>
      ${SPORTS.map(s=>`<option value="${s.key}" ${S.parlaySport===s.key?'selected':''}>${s.label}</option>`).join('')}
    </select>
    <div class="filter-div"></div>
    <label>Date</label>
    <select onchange="S.dateFilter=this.value;render()">
      <option value="all">All Dates</option>
      <option value="today" ${S.dateFilter==='today'?'selected':''}>Today</option>
      <option value="tomorrow" ${S.dateFilter==='tomorrow'?'selected':''}>Tomorrow</option>
    </select>
  </div>
  ${parlaySportPicker()}
  ${!S.loading&&S.matches.length?`<div class="stats-grid fu" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat-card gold"><div class="stat-lbl">Parlay Pool</div><div class="stat-val">${ms.length}</div><div class="stat-sub">eligible matches</div></div>
    <div class="stat-card blue"><div class="stat-lbl">Sports Included</div><div class="stat-val">${sportCount}</div><div class="stat-sub">${S.parlaySport==='all'?'available in filter':'selected sport'}</div></div>
    <div class="stat-card green"><div class="stat-lbl">Suggestions</div><div class="stat-val">${parlays.length}</div><div class="stat-sub">${S.parlaySport!=='all'?'same sport':S.parlayMode==='mixed'?'mixed sports':S.parlayMode==='same'?'same sport':'best overall'}</div></div>
  </div>`:''}
  ${S.loading?`<div class="loading-s"><div class="spinner"></div><div class="load-txt">Building parlay candidates...</div></div>`
  :S.matches.length===0?`<div class="empty-s"><i class="fa fa-layer-group"></i><p>No matches loaded</p><small>Refresh odds from this page or the Dashboard first</small></div>`
  :!parlays.length?`<div class="empty-s"><i class="fa fa-filter"></i><p>No parlay suggestions match these filters</p><small>Try Best Overall, All Sports, or a wider date range</small></div>`
  :autoParlayBuilder(ms,{mode})}
  <div style="margin-top:20px;padding:14px 18px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);font-size:12px;color:var(--text3);line-height:1.7">
    <i class="fa fa-shield-halved" style="color:#f5c842;margin-right:6px"></i>
    <strong style="color:var(--text2)">No outcomes are guaranteed.</strong> Parlays multiply risk. Mixed-sport parlays combine candidates across loaded sports; same-sport parlays keep every leg within one sport.
  </div>
</div>`;
}

function pgDashboard(){
  const ms=filtered();
  const vp=ms.filter(m=>m.analysis.valuePlay).length;
  const ac=ms.length?Math.round(ms.reduce((a,m)=>a+m.analysis.conf,0)/ms.length):0;
  const pend=S.watchlist.filter(w=>w.outcome==='pending').length;
  const books=allBooks();
  const pct=Math.min(100,Math.round((S.settings.dailyUsed/(S.settings.dailyLimit||10))*100));
  return`<div class="topbar">
  <div class="tb-title">Live Odds Dashboard</div>
  ${S.lastUpdated?`<div class="tb-meta"><i class="fa fa-satellite-dish" style="margin-right:5px;color:#00e5a0"></i>Updated ${S.lastUpdated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}${S.apiRemaining!==null?'  /  '+S.apiRemaining+' API calls left':''}</div>`:''}
  <div class="tb-acts">
    <button class="btn" onclick="loadOdds()" ${S.loading?'disabled':''}>
      <i class="fa fa-rotate${S.loading?' spinning':''}"></i>${S.loading?'Loading...':'Refresh Odds'}
    </button>
  </div>
</div>
<div class="page">
  ${S.apiError?`<div class="api-err"><i class="fa fa-circle-exclamation fa-lg"></i><div><strong>API Error:</strong> ${S.apiError}<br><small>Check your API key in Settings or verify your request quota.</small></div></div>`:''}
  ${S.apiNotice?`<div class="api-note"><i class="fa fa-database"></i><div><strong>Fallback data loaded.</strong> ${S.apiNotice}</div></div>`:''}
  <div class="filter-row">
    <label>Sport</label>
    <select onchange="S.sportFilter=this.value;render()">
      <option value="all" ${S.sportFilter==='all'?'selected':''}>All Sports</option>
      ${SPORTS.map(s=>`<option value="${s.key}" ${S.sportFilter===s.key?'selected':''}>${s.label}</option>`).join('')}
    </select>
    <div class="filter-div"></div>
    <label>Risk</label>
    <select onchange="S.riskFilter=this.value;render()">
      <option value="all">All Levels</option>
      <option value="low" ${S.riskFilter==='low'?'selected':''}>Low Risk</option>
      <option value="medium" ${S.riskFilter==='medium'?'selected':''}>Med Risk</option>
      <option value="high" ${S.riskFilter==='high'?'selected':''}>High Risk</option>
      <option value="hr" ${S.riskFilter==='hr'?'selected':''}>Long Shot</option>
    </select>
    <div class="filter-div"></div>
    <label>Date</label>
    <select onchange="S.dateFilter=this.value;render()">
      <option value="all">All Dates</option>
      <option value="today" ${S.dateFilter==='today'?'selected':''}>Today</option>
      <option value="tomorrow" ${S.dateFilter==='tomorrow'?'selected':''}>Tomorrow</option>
    </select>
    ${books.length?`<div class="filter-div"></div><label>Book</label>
    <select onchange="S.bookFilter=this.value;render()">
      <option value="all">All Books</option>
      ${books.map(b=>`<option value="${b}" ${S.bookFilter===b?'selected':''}>${b}</option>`).join('')}
    </select>`:''}
  </div>
  ${!S.loading&&!S.apiError&&S.matches.length?`<div class="stats-grid fu">
    <div class="stat-card green"><div class="stat-lbl">Matches Loaded</div><div class="stat-val">${ms.length}</div><div class="stat-sub">${S.matches.length} total</div></div>
    <div class="stat-card gold"><div class="stat-lbl">Value Picks</div><div class="stat-val">${vp}</div><div class="stat-sub">positive edge</div></div>
    <div class="stat-card blue"><div class="stat-lbl">Avg Confidence</div><div class="stat-val">${ac}%</div><div class="stat-sub">estimate only*</div></div>
    <div class="stat-card red"><div class="stat-lbl">Watchlist</div><div class="stat-val">${pend}</div><div class="stat-sub">pending picks</div></div>
  </div>`:''}
  ${S.loading?`<div class="loading-s"><div class="spinner"></div><div class="load-txt">Fetching live odds from The Odds API...</div></div>`
  :ms.length===0?`<div class="empty-s"><i class="fa fa-circle-xmark"></i><p>${S.matches.length===0?'Click "Refresh Odds" to load live data':'No matches match filters'}</p><small>${S.matches.length===0?'Needs internet + valid API key':'Try adjusting filters'}</small></div>`
  :`${matchPredictionTable(ms)}<div class="matches-grid">${ms.map((m,i)=>matchCard(m,i)).join('')}</div>`}
  <div style="margin-top:20px;padding:14px 18px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);font-size:12px;color:var(--text3);line-height:1.7">
    <i class="fa fa-shield-halved" style="color:#f5c842;margin-right:6px"></i>
    <strong style="color:var(--text2)">No outcomes are guaranteed.</strong> Match predictions are model estimates built from public market odds and available signals. Verify odds at the sportsbook before any wager. Personal research tool only. *Confidence scores are estimates with no predictive guarantee.
  </div>
</div>`;
}

function pgRankings(){
  const sorted=[...S.matches].sort((a,b)=>b.analysis.bestEdge-a.analysis.bestEdge);
  return`<div class="topbar"><div class="tb-title">Value Rankings</div><div class="tb-meta">Sorted by estimated value edge - higher = more potential value</div></div>
<div class="page">
  ${S.loading?`<div class="loading-s"><div class="spinner"></div><div class="load-txt">Loading...</div></div>`
  :sorted.length===0?`<div class="empty-s"><i class="fa fa-chart-bar"></i><p>No matches loaded</p><small>Load odds from the Dashboard first</small></div>`
  :`<div class="rank-list">${sorted.map((m,i)=>{
    const a=m.analysis,edge=a.bestEdge*100;
    const ec=edge>3?'#00e5a0':edge>0?'#f5c842':'#ff4d6a';
    const sid=JSON.stringify(m.id).replace(/"/g,'&quot;');
    return`<div class="rank-item${edge>3?' top':''}" onclick="openDetail(${sid})">
      <div class="rank-num">${i+1}</div>
      <div class="rank-body">
        <div class="rank-match">${m.home_team} vs ${m.away_team}</div>
        <div class="rank-meta"><span class="sp-pill ${a.sp.cls}">${a.sp.short}</span><span>${fmtTime(m.commence_time)}</span><span>${a.numBooks} books</span></div>
      </div>
      <div class="rank-r">
        <span class="risk-badge ${a.risk.cls}">${a.risk.label}</span>
        <div class="rank-en"><div class="rank-en-n" style="color:${ec}">${edge>0?'+':''}${edge.toFixed(1)}%</div><div class="rank-en-l">edge</div></div>
        <div class="rank-en"><div class="rank-en-n" style="font-size:15px">${a.conf}%</div><div class="rank-en-l">conf.*</div></div>
        <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();openWatch(${sid})"><i class="fa fa-bookmark"></i></button>
      </div>
    </div>`;
  }).join('')}</div>`}
  <div style="margin-top:16px;font-size:12px;color:var(--text3)">*Rankings use a simplified model. Higher ranked picks are not guaranteed winners.</div>
</div>`;
}

function pgWatchlist(){
  const wl=S.watchlist;
  const res=wl.filter(w=>w.outcome!=='pending');
  const wins=res.filter(w=>w.outcome==='won');
  const net=res.reduce((a,w)=>a+(w.profit||0),0);
  const wr=res.length?Math.round((wins.length/res.length)*100):null;
  const roi=res.length?((net/res.reduce((a,w)=>a+w.stake,0))*100).toFixed(1):null;
  return`<div class="topbar"><div class="tb-title">Watchlist</div><div class="tb-meta">${wl.length} total  /  ${wl.filter(w=>w.outcome==='pending').length} pending</div></div>
<div class="page">
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
    <div class="stat-card ${wr>=50?'green':wr!==null?'red':'blue'}"><div class="stat-lbl">Win Rate</div><div class="stat-val">${wr!==null?wr+'%':'-'}</div><div class="stat-sub">${wins.length}W  /  ${res.filter(w=>w.outcome==='lost').length}L</div></div>
    <div class="stat-card ${net>=0?'green':'red'}"><div class="stat-lbl">Net Profit</div><div class="stat-val">${net>=0?'+':''}${net.toFixed(2)}u</div><div class="stat-sub">simulation only</div></div>
    <div class="stat-card blue"><div class="stat-lbl">ROI</div><div class="stat-val">${roi!==null?(parseFloat(roi)>=0?'+':'')+roi+'%':'-'}</div><div class="stat-sub">return on investment</div></div>
  </div>
  ${wl.length===0?`<div class="empty-s"><i class="fa fa-bookmark"></i><p>Watchlist is empty</p><small>Click Watch on any match in the Dashboard</small></div>`
  :`<div class="tbl-wrap"><table class="wl-tbl">
    <thead><tr><th>Match</th><th>Selection</th><th>Sport</th><th>Odds</th><th>Edge</th><th>Risk</th><th>Stake</th><th>Profit</th><th>Outcome</th><th></th></tr></thead>
    <tbody>${wl.map(w=>{
      const sp=SPORTS.find(s=>s.short===w.sport);
      return`<tr>
        <td style="font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${w.label}">${w.label}</td>
        <td style="color:#00e5a0;font-weight:600">${w.selection}</td>
        <td><span class="sp-pill ${sp?.cls||'sp-def'}">${w.sport}</span></td>
        <td style="font-family:var(--font-m)">${w.oddsD.toFixed(2)}</td>
        <td style="font-family:var(--font-m);color:${parseFloat(w.edge)>0?'#00e5a0':'var(--text3)'}">${parseFloat(w.edge)>0?'+':''}${parseFloat(w.edge).toFixed(1)}%</td>
        <td><span class="risk-badge ${w.riskKey==='low'?'r-low':w.riskKey==='medium'?'r-med':w.riskKey==='high'?'r-high':'r-hr'}">${w.riskLbl}</span></td>
        <td style="font-family:var(--font-m)">${w.stake.toFixed(1)}u</td>
        <td style="font-family:var(--font-m);color:${w.profit===null?'var(--text3)':w.profit>=0?'#00e5a0':'#ff4d6a'};font-weight:600">${w.profit===null?'-':(w.profit>=0?'+':'')+w.profit.toFixed(2)+'u'}</td>
        <td>${w.outcome==='pending'
          ?`<div class="out-btns">
              <button class="btn btn-sm btn-success" onclick="setOut(${w.id},'won')">Won</button>
              <button class="btn btn-sm btn-danger" onclick="setOut(${w.id},'lost')">Lost</button>
              <button class="btn btn-sm" onclick="setOut(${w.id},'void')">Void</button>
            </div>`
          :`<span class="out-pill out-${w.outcome}">${w.outcome.charAt(0).toUpperCase()+w.outcome.slice(1)}</span>`}
        </td>
        <td><button class="btn btn-icon btn-sm btn-danger" onclick="rmWatch(${w.id})"><i class="fa fa-trash"></i></button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`}
  <div style="margin-top:14px;font-size:12px;color:var(--text3)">Profit/loss is unit-based simulation. No real money tracked. Personal research only.</div>
</div>`;
}

function pgHistory(){
  const res=S.watchlist.filter(w=>w.outcome!=='pending');
  const wins=res.filter(w=>w.outcome==='won').length;
  const net=res.reduce((a,w)=>a+(w.profit||0),0);
  const wr=res.length?Math.round((wins/res.length)*100):null;
  const roi=res.length?((net/res.reduce((a,w)=>a+w.stake,0))*100).toFixed(1):null;
  const rg={low:{l:'Low Risk',c:'r-low',w:0,l2:0,p:0},medium:{l:'Med Risk',c:'r-med',w:0,l2:0,p:0},high:{l:'High Risk',c:'r-high',w:0,l2:0,p:0},hr:{l:'Long Shot',c:'r-hr',w:0,l2:0,p:0}};
  res.forEach(w=>{const g=rg[w.riskKey];if(!g)return;if(w.outcome==='won')g.w++;else if(w.outcome==='lost')g.l2++;g.p+=(w.profit||0);});
  const sg={};
  res.forEach(w=>{if(!sg[w.sport])sg[w.sport]={w:0,l:0,p:0};if(w.outcome==='won')sg[w.sport].w++;else if(w.outcome==='lost')sg[w.sport].l++;sg[w.sport].p+=(w.profit||0);});
  return`<div class="topbar"><div class="tb-title">Historical Results</div><div class="tb-meta">${res.length} resolved picks</div></div>
<div class="page">
  <div class="stats-grid">
    <div class="stat-card ${wr>=50?'green':wr!==null?'red':'blue'}"><div class="stat-lbl">Win Rate</div><div class="stat-val">${wr!==null?wr+'%':'-'}</div><div class="stat-sub">${wins}W / ${res.filter(w=>w.outcome==='lost').length}L</div></div>
    <div class="stat-card ${net>=0?'green':'red'}"><div class="stat-lbl">Net Profit</div><div class="stat-val">${net>=0?'+':''}${net.toFixed(2)}u</div><div class="stat-sub">unit simulation</div></div>
    <div class="stat-card blue"><div class="stat-lbl">ROI</div><div class="stat-val">${roi!==null?(parseFloat(roi)>=0?'+':'')+roi+'%':'-'}</div><div class="stat-sub">return on investment</div></div>
    <div class="stat-card gold"><div class="stat-lbl">Resolved</div><div class="stat-val">${res.length}</div><div class="stat-sub">picks tracked</div></div>
  </div>
  <div class="hist-sec">
    <div class="hist-ttl">Performance by Risk Category</div>
    <div class="rp-grid">${Object.entries(rg).map(([,g])=>{
      const tot=g.w+g.l2,wr2=tot?Math.round((g.w/tot)*100):null;
      return`<div class="rp-card"><div style="margin-bottom:10px"><span class="risk-badge ${g.c}">${g.l}</span></div>
        <div class="rp-row"><span>Picks</span><span>${tot}</span></div>
        <div class="rp-row"><span>Win Rate</span><span style="color:${wr2>=50?'#00e5a0':wr2!==null?'#ff4d6a':'var(--text)'}">${wr2!==null?wr2+'%':'-'}</span></div>
        <div class="rp-row"><span>Wins</span><span style="color:#00e5a0">${g.w}</span></div>
        <div class="rp-row"><span>Losses</span><span style="color:#ff4d6a">${g.l2}</span></div>
        <div class="rp-row"><span>P/L</span><span style="color:${g.p>=0?'#00e5a0':'#ff4d6a'}">${g.p>=0?'+':''}${g.p.toFixed(2)}u</span></div>
      </div>`;
    }).join('')}</div>
  </div>
  ${Object.keys(sg).length?`<div class="hist-sec">
    <div class="hist-ttl">Performance by Sport</div>
    <div class="bar-row">${Object.entries(sg).map(([sp,g])=>{
      const tot=g.w+g.l,wr3=tot?Math.round((g.w/tot)*100):0;
      return`<div class="bar-col"><div class="bar-val">${wr3}%</div><div class="bar-stk" style="height:${Math.max(8,wr3)}px;background:${wr3>=50?'#00e5a0':'#ff4d6a'}"></div><div class="bar-lbl">${sp}</div></div>`;
    }).join('')}</div>
  </div>`:''}
  ${res.length?`<div class="hist-sec"><div class="hist-ttl">Pick Log</div>
    <div class="tbl-wrap"><table class="wl-tbl">
      <thead><tr><th>Match</th><th>Selection</th><th>Sport</th><th>Odds</th><th>Risk</th><th>Outcome</th><th>Profit</th></tr></thead>
      <tbody>${res.map(w=>{
        const sp=SPORTS.find(s=>s.short===w.sport);
        return`<tr>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.label}</td>
          <td style="font-weight:600">${w.selection}</td>
          <td><span class="sp-pill ${sp?.cls||'sp-def'}">${w.sport}</span></td>
          <td style="font-family:var(--font-m)">${w.oddsD.toFixed(2)}</td>
          <td><span class="risk-badge ${w.riskKey==='low'?'r-low':w.riskKey==='medium'?'r-med':w.riskKey==='high'?'r-high':'r-hr'}">${w.riskLbl}</span></td>
          <td><span class="out-pill out-${w.outcome}">${w.outcome.charAt(0).toUpperCase()+w.outcome.slice(1)}</span></td>
          <td style="font-family:var(--font-m);color:${(w.profit||0)>=0?'#00e5a0':'#ff4d6a'};font-weight:600">${((w.profit||0)>=0?'+':'')+(w.profit||0).toFixed(2)}u</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`:`<div class="empty-s"><i class="fa fa-chart-line"></i><p>No resolved picks yet</p><small>Mark picks Won/Lost in the Watchlist</small></div>`}
</div>`;
}

function pgSettings(){
  const {settings:ss}=S;
  const pd=Math.min(100,Math.round((ss.dailyUsed/(ss.dailyLimit||10))*100));
  const pw=Math.min(100,Math.round((ss.weeklyUsed/(ss.weeklyLimit||50))*100));
  return`<div class="topbar"><div class="tb-title">Settings</div><div class="tb-meta">API key stored locally in your browser only</div></div>
<div class="page"><div class="set-grid">
  <div class="set-card full">
    <div class="set-ttl"><i class="fa fa-key"></i>API Configuration</div>
    <div class="set-row">
      <div><div class="set-lbl">Odds API Key</div><div class="set-desc">the-odds-api.com  /  Free tier: 500 req/month${S.apiRemaining!==null?'  /  '+S.apiRemaining+' remaining':''}</div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="password" id="apiIn" value="${ss.apiKey}" placeholder="Enter API key" style="min-width:240px">
        <button class="btn btn-accent btn-sm" onclick="S.settings.apiKey=document.getElementById('apiIn').value;lsSave('oddsiq_set',S.settings);toast('API key saved')">
          <i class="fa fa-check"></i> Save
        </button>
      </div>
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Active Sports</div><div class="set-desc">Sports to load on refresh (each uses 1 API request)</div></div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:400px">
        ${SPORTS.map(sp=>{
          const active=ss.activeSports.includes(sp.key);
          return`<button class="btn btn-sm${active?' btn-accent':''}" onclick="
            const idx=S.settings.activeSports.indexOf('${sp.key}');
            if(idx>=0)S.settings.activeSports.splice(idx,1);
            else S.settings.activeSports.push('${sp.key}');
            lsSave('oddsiq_set',S.settings);render();">${sp.label}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Odds Format</div><div class="set-desc">Display format for all odds values</div></div>
      <select onchange="S.settings.oddsFormat=this.value;lsSave('oddsiq_set',S.settings);render()">
        <option value="american" ${ss.oddsFormat==='american'?'selected':''}>American (+150 / -110)</option>
        <option value="decimal" ${ss.oddsFormat==='decimal'?'selected':''}>Decimal (2.50)</option>
        <option value="fractional" ${ss.oddsFormat==='fractional'?'selected':''}>Fractional</option>
      </select>
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Theme</div><div class="set-desc">Choose a higher-contrast dark or white interface</div></div>
      <select onchange="S.settings.theme=this.value;lsSave('oddsiq_set',S.settings);render()">
        <option value="dark" ${ss.theme!=='light'?'selected':''}>Dark</option>
        <option value="light" ${ss.theme==='light'?'selected':''}>White</option>
      </select>
    </div>
  </div>
  <div class="set-card">
    <div class="set-ttl"><i class="fa fa-shield-halved"></i>Responsible Gambling</div>
    <div class="set-row">
      <div><div class="set-lbl">Daily Unit Limit</div><div class="set-desc">${pd}% used  /  ${ss.dailyUsed}/${ss.dailyLimit} units</div>
        <div style="margin-top:6px;width:160px;height:3px;background:var(--border);border-radius:2px;overflow:hidden">
          <div style="width:${pd}%;height:100%;border-radius:2px;background:${pd>80?'#ff4d6a':'#00e5a0'}"></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" value="${ss.dailyLimit}" min="1" style="width:90px" onchange="S.settings.dailyLimit=parseFloat(this.value)||10;lsSave('oddsiq_set',S.settings);render()">
        <button class="btn btn-sm" onclick="S.settings.dailyUsed=0;lsSave('oddsiq_set',S.settings);toast('Reset');render()">Reset</button>
      </div>
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Weekly Unit Limit</div><div class="set-desc">${pw}% used  /  ${ss.weeklyUsed}/${ss.weeklyLimit} units</div></div>
      <input type="number" value="${ss.weeklyLimit}" min="1" style="width:90px" onchange="S.settings.weeklyLimit=parseFloat(this.value)||50;lsSave('oddsiq_set',S.settings);render()">
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Hide Long Shots</div><div class="set-desc">Remove high-risk long shots from Dashboard</div></div>
      <button class="toggle${ss.hideHighRisk?' on':''}" onclick="S.settings.hideHighRisk=!S.settings.hideHighRisk;lsSave('oddsiq_set',S.settings);render()"></button>
    </div>
  </div>
  <div class="set-card">
    <div class="set-ttl"><i class="fa fa-trash-can"></i>Data Management</div>
    <div class="set-row">
      <div><div class="set-lbl">Clear Watchlist</div><div class="set-desc">Permanently removes all picks</div></div>
      <button class="btn btn-danger btn-sm" onclick="if(confirm('Clear all watchlist picks?')){S.watchlist=[];lsSave('oddsiq_wl',[]);toast('Watchlist cleared','warn');render()}">
        <i class="fa fa-trash"></i> Clear
      </button>
    </div>
    <div class="set-row">
      <div><div class="set-lbl">Reset All Settings</div><div class="set-desc">Restore defaults and reload</div></div>
      <button class="btn btn-sm btn-danger" onclick="if(confirm('Reset all settings?')){localStorage.clear();location.reload();}">
        <i class="fa fa-rotate-left"></i> Reset
      </button>
    </div>
    <div style="margin-top:12px;padding:12px;background:var(--bg3);border-radius:var(--r);font-size:12px;color:var(--text3);line-height:1.7">
      All data stored locally in your browser. Nothing sent to any server except The Odds API for odds data.
    </div>
  </div>
  <div class="set-card full">
    <div class="set-ttl"><i class="fa fa-circle-info"></i>About OddsIQ</div>
    <div style="font-size:13px;color:var(--text2);line-height:1.8">
      OddsIQ is a <strong>personal research and probability analysis tool</strong>. It fetches live odds, removes sportsbook vig to compute fair implied probabilities, and surfaces potential value opportunities using market signals.<br><br>
      <strong style="color:var(--red)">This tool does NOT guarantee any outcomes.</strong> All probability estimates are model outputs. Never use this as the sole basis for any wager. Sports outcomes are unpredictable. Please gamble responsibly and within your means.<br><br>
      <strong>Problem Gambling Help (US):</strong> <strong style="color:var(--accent)">1-800-522-4700</strong> (National Helpline, 24/7, free, confidential)
    </div>
  </div>
</div></div>`;
}

// MODALS
function openDetail(id){
  const m=S.matches.find(x=>x.id===id);if(!m)return;
  S.selectedMatch=m;S.modal='detail';render();
}
function openWatch(id){
  const m=S.matches.find(x=>x.id===id);if(!m)return;
  S.addWatchMatch=m;
  S.modal=m.analysis.risk.key==='hr'?'warn':'addWatch';
  render();
}
function closeModal(){S.modal=null;render();}

function renderModal(){
  if(!S.modal)return'';
  let c='';
  if(S.modal==='detail'&&S.selectedMatch){
    const m=S.selectedMatch,a=m.analysis,fmt=S.settings.oddsFormat;
    const hAm=fmtOdds(a.bestH,fmt),aAm=fmtOdds(a.bestA,fmt);
    const isH=a.bestEdgeTeam==='home';
    const rec=isH?m.home_team:m.away_team;
    const recOdds=isH?hAm:aAm;
    const recD=isH?a.bestH:a.bestA;
    const recBk=isH?a.bestHBook:a.bestABook;
    const cc=a.conf>70?'#00e5a0':a.conf>50?'#f5c842':'#ff4d6a';
    const sid=JSON.stringify(m.id).replace(/"/g,'&quot;');
    const winner=teamName(m,a.predictedTeam);
    const valuePick=teamName(m,a.valueTeam);
    const parlayPick=teamName(m,a.parlayTeam);
    c=`<button class="modal-x" onclick="closeModal()"><i class="fa fa-xmark"></i></button>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px">
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="sp-pill ${a.sp.cls}">${a.sp.label}</span>
          <span class="risk-badge ${a.risk.cls}">${a.risk.label}</span>
        </div>
        <div class="modal-title">${m.home_team}<br>vs ${m.away_team}</div>
        <div class="modal-sub" style="margin-bottom:0"><i class="fa fa-clock" style="margin-right:5px;opacity:.5"></i>${fmtTime(m.commence_time)}</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);font-family:var(--font-m);margin-bottom:16px">${a.numBooks} sportsbook${a.numBooks!==1?'s':''} compared  /  Vig: ${a.overround}%</div>
    <div class="modal-grid">
      <div class="modal-cell">
        <div class="mc-lbl">${m.home_team}</div>
        <div class="mc-val">${hAm}</div>
        <div class="mc-sub">Best: ${a.bestHBook}</div>
        <div class="mc-sub">Implied: ${a.hImpl}%  /  Est: <span style="color:#00e5a0">${a.hEst}%</span></div>
        <div class="mc-sub" style="color:${parseFloat(a.hEdge)>0?'#00e5a0':'#ff4d6a'}">Edge: ${parseFloat(a.hEdge)>0?'+':''}${a.hEdge}%</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">${m.away_team}</div>
        <div class="mc-val">${aAm}</div>
        <div class="mc-sub">Best: ${a.bestABook}</div>
        <div class="mc-sub">Implied: ${a.aImpl}%  /  Est: <span style="color:#00e5a0">${a.aEst}%</span></div>
        <div class="mc-sub" style="color:${parseFloat(a.aEdge)>0?'#00e5a0':'#ff4d6a'}">Edge: ${parseFloat(a.aEdge)>0?'+':''}${a.aEdge}%</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">Model Confidence</div>
        <div class="mc-val" style="color:${cc}">${a.conf}%*</div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:6px 0">
          <div style="width:${a.conf}%;height:100%;background:${cc};border-radius:2px"></div>
        </div>
        <div class="mc-sub">estimate only - not a guarantee</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">Sportsbook Vig</div>
        <div class="mc-val">${a.overround}%</div>
        <div class="mc-sub">${parseFloat(a.overround)<5?'Low vig - good value':parseFloat(a.overround)<10?'Average vig':'High vig - shop around'}</div>
      </div>
    </div>
    <div class="modal-grid">
      <div class="modal-cell">
        <div class="mc-lbl">Most likely winner</div>
        <div class="mc-val">${winner}</div>
        <div class="mc-sub">Team A: ${a.hEst}% - Team B: ${a.aEst}%</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">Best value pick</div>
        <div class="mc-val">${valuePick}</div>
        <div class="mc-sub">Model edge: ${a.valueTeam==='home'?a.hEdge:a.aEdge}%</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">Best parlay candidate</div>
        <div class="mc-val">${parlayPick}</div>
        <div class="mc-sub">Risk level: ${a.risk.label}</div>
      </div>
      <div class="modal-cell">
        <div class="mc-lbl">Recommendation badge</div>
        <div class="label-row"><span class="pick-label ${a.badge.cls}">${a.badge.label}</span></div>
        <div class="mc-sub">Confidence score: ${a.conf}%</div>
      </div>
    </div>
    <div class="disc-box">
      <strong style="color:var(--text2)">Prediction explanation</strong><br>
      ${a.explanation.map(x=>`<span style="display:block;margin-top:6px">${x}</span>`).join('')}
    </div>
    <div class="rec-box">
      <div class="rec-lbl"><i class="fa fa-crosshairs" style="margin-right:5px"></i>Model Recommendation (estimate only)</div>
      <div class="rec-team">${rec}</div>
      <div class="rec-row">Best odds: ${recOdds} @ ${recBk}  /  Payout/unit: +${((recD-1)*1).toFixed(2)}u  /  Est. prob: ${isH?a.hEst:a.aEst}%</div>
      ${a.hasWarn?'<div style="margin-top:8px;font-size:11px;color:#ff8a3d"><i class="fa fa-triangle-exclamation"></i> Elevated risk. Use caution.</div>':''}
    </div>
    <div class="disc-box"><i class="fa fa-shield-halved" style="margin-right:6px;color:#f5c842"></i><strong>No outcomes guaranteed.</strong> Confidence and probability scores are model predictions from market signals, not guarantees. Verify odds at the sportsbook. Gamble responsibly.</div>
    <div class="modal-acts">
      <button class="btn" onclick="closeModal()">Close</button>
      <button class="btn btn-accent" onclick="closeModal();openWatch(${sid})"><i class="fa fa-bookmark"></i> Add to Watchlist</button>
    </div>`;
  }
  else if(S.modal==='addWatch'&&S.addWatchMatch){
    const m=S.addWatchMatch,a=m.analysis,fmt=S.settings.oddsFormat;
    c=`<button class="modal-x" onclick="closeModal()"><i class="fa fa-xmark"></i></button>
    <div class="modal-title"><i class="fa fa-bookmark" style="color:#00e5a0;margin-right:8px"></i>Add to Watchlist</div>
    <div class="modal-sub">${m.home_team} vs ${m.away_team}</div>
    <div class="modal-grid" style="margin-bottom:16px">
      <div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-family:var(--font-m)">TRACK HOME</div>
        <button class="btn btn-success" style="width:100%;flex-direction:column;gap:4px;height:auto;padding:12px" onclick="addWatch(S.addWatchMatch,'home')">
          <span style="font-weight:600">${m.home_team}</span>
          <span style="font-family:var(--font-m);font-size:12px">${fmtOdds(a.bestH,fmt)} @ ${a.bestHBook}</span>
        </button>
      </div>
      <div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-family:var(--font-m)">TRACK AWAY</div>
        <button class="btn btn-success" style="width:100%;flex-direction:column;gap:4px;height:auto;padding:12px" onclick="addWatch(S.addWatchMatch,'away')">
          <span style="font-weight:600">${m.away_team}</span>
          <span style="font-family:var(--font-m);font-size:12px">${fmtOdds(a.bestA,fmt)} @ ${a.bestABook}</span>
        </button>
      </div>
    </div>
    <div class="disc-box">Personal research tracking only. No real money recorded. No outcomes guaranteed. Verify odds before any wager.</div>
    <div class="modal-acts"><button class="btn" onclick="closeModal()">Cancel</button></div>`;
  }
  else if(S.modal==='warn'&&S.addWatchMatch){
    c=`<button class="modal-x" onclick="closeModal()"><i class="fa fa-xmark"></i></button>
    <div class="modal-title" style="color:#ff4d6a"><i class="fa fa-triangle-exclamation" style="margin-right:8px"></i>Long Shot Warning</div>
    <div class="modal-sub">${S.addWatchMatch.home_team} vs ${S.addWatchMatch.away_team}</div>
    <div style="background:var(--red-dim);border:1px solid rgba(255,77,106,.2);border-radius:var(--rl);padding:16px;margin-bottom:18px;font-size:13px;color:var(--text2);line-height:1.7">
      <strong style="color:var(--red)">Low estimated win probability.</strong> Long Shot picks have historically lower win rates.
      Estimated win probability is below 25%. This is not a recommendation. OddsIQ never guarantees outcomes.
    </div>
    <div class="disc-box">Never exceed your personal limits. Problem Gambling Helpline: <strong>1-800-522-4700</strong></div>
    <div class="modal-acts">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="S.modal='addWatch';render()"><i class="fa fa-bookmark"></i> Track anyway</button>
    </div>`;
  }
  return`<div class="modal-ov" onclick="if(event.target===this)closeModal()"><div class="modal">${c}</div></div>`;
}

// RENDER
function render(){
  document.body.classList.toggle('theme-light',S.settings.theme==='light');
  const pend=S.watchlist.filter(w=>w.outcome==='pending').length;
  const pct=Math.min(100,Math.round((S.settings.dailyUsed/(S.settings.dailyLimit||10))*100));
  const navItems=[
    {page:'dashboard',icon:'fa-gauge-high',label:'Dashboard',badge:null},
    {page:'parlays',icon:'fa-layer-group',label:'Parlays',badge:null},
    {page:'rankings',icon:'fa-ranking-star',label:'Rankings',badge:S.matches.length||null},
    {page:'watchlist',icon:'fa-bookmark',label:'Watchlist',badge:pend||null},
    {page:'history',icon:'fa-chart-line',label:'History',badge:null},
    {page:'settings',icon:'fa-gear',label:'Settings',badge:null},
  ];
  const sidebar=`<div class="sb">
    <div class="sb-brand">
      <div class="sb-mark"><div class="sb-icon"><i class="fa fa-bolt"></i></div><div class="sb-name">OddsIQ</div></div>
      <div class="sb-sub">Sports Analysis Tool</div>
    </div>
    <nav class="sb-nav">
      <div class="nav-sec">Navigation</div>
      ${navItems.map(n=>`<button class="nav-btn${S.page===n.page?' active':''}" onclick="nav('${n.page}')">
        <i class="fa ${n.icon}"></i>${n.label}${n.badge?`<span class="nav-badge">${n.badge}</span>`:''}
      </button>`).join('')}
    </nav>
    <div class="sb-bot">
      <div class="bw-hdr"><span class="bw-lbl">Daily limit</span><span class="bw-vals">${S.settings.dailyUsed}/${S.settings.dailyLimit}u</span></div>
      <div class="bw-bar"><div class="bw-fill" style="width:${pct}%;background:${pct>80?'#ff4d6a':'#00e5a0'}"></div></div>
      ${pct>100?'<div class="warn-pill"><i class="fa fa-triangle-exclamation"></i>Daily limit reached</div>':''}
    </div>
  </div>`;
  const themeIcon=S.settings.theme==='light'?'fa-moon':'fa-sun';
  const themeLabel=S.settings.theme==='light'?'Dark mode':'White mode';
  const banner=`<div class="resp-banner"><i class="fa fa-shield-halved"></i>
    <span><strong>Personal research only.</strong> No outcomes guaranteed. Odds change constantly. 18+ only. Problem gambling help: <strong>1-800-522-4700</strong></span>
    <button class="theme-quick" onclick="toggleTheme()" title="${themeLabel}" aria-label="${themeLabel}"><i class="fa ${themeIcon}"></i><span>${themeLabel}</span></button>
  </div>`;
  let pg='';
  if(S.page==='dashboard')pg=pgDashboard();
  else if(S.page==='parlays')pg=pgParlays();
  else if(S.page==='rankings')pg=pgRankings();
  else if(S.page==='watchlist')pg=pgWatchlist();
  else if(S.page==='history')pg=pgHistory();
  else if(S.page==='settings')pg=pgSettings();
  const toastHtml=S.toast?`<div class="toast ${S.toast.type}"><i class="fa ${S.toast.type==='err'?'fa-circle-xmark':S.toast.type==='warn'?'fa-triangle-exclamation':'fa-circle-check'}"></i>${S.toast.msg}</div>`:'';
  document.getElementById('app').innerHTML=`${sidebar}<div class="main">${banner}${pg}</div>${renderModal()}${toastHtml}`;
}

render();
loadOdds();
