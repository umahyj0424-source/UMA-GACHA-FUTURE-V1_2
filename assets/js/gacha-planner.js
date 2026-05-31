/* Uma Gacha Planner Site v1.2 - static HTML module */
(function(){
'use strict';

const TOP_LABEL={character:'3★',support:'SSR'};
const MID_LABEL={character:'2★',support:'SR'};
const LOW_LABEL={character:'1★',support:'R'};
const RATE={top:.03, mid:.18, low:.79, guaranteedTop:.03, guaranteedMid:.97, pickup:.0075, jewelPerPull:150, ceiling:200};
const MODE_KO={character:'말딸',support:'서폿'};
const MODE_FULL={character:'캐릭터',support:'서포트 카드'};
const TIER_MAP={character:{'3★':'top','2★':'mid','1★':'low'},support:{'SSR':'top','SR':'mid','R':'low'}};

function $(root,sel){
  // v1.1: accept both $(root, selector) and $(selector, root).
  // The first planner build accidentally used both orders; the browser threw
  // 'root.querySelector is not a function' after rendering only the shell.
  if(typeof root==='string' && sel && typeof sel.querySelector==='function'){
    const selector=root; root=sel; sel=selector;
  }
  return root ? root.querySelector(sel) : null;
}
function $all(root,sel){
  if(typeof root==='string' && sel && typeof sel.querySelectorAll==='function'){
    const selector=root; root=sel; sel=selector;
  }
  return root ? Array.from(root.querySelectorAll(sel)) : [];
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function num(v){return Number(v||0).toLocaleString('ko-KR')}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function asDate(s){const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d}
function diffDays(a,b){const da=asDate(a), db=asDate(b); if(!da||!db) return 0; return Math.max(0, Math.round((db-da)/86400000))}
function dateMin(a,b){return !a?b:!b?a:(asDate(a)<=asDate(b)?a:b)}
function dateMax(a,b){return !a?b:!b?a:(asDate(a)>=asDate(b)?a:b)}
function rnd(arr){return arr[Math.floor(Math.random()*arr.length)]}
function byId(arr,id){return arr.find(x=>String(x.id)===String(id))}
function pct(x){return (x*100).toFixed(x<.01?3:2).replace(/0+$/,'').replace(/\.$/,'')+'%'}
function monthBoundaries(from,to){
  const a=asDate(from), b=asDate(to); if(!a||!b||b<=a) return 0;
  let y=a.getFullYear(), m=a.getMonth()+1, count=0;
  let cur=new Date(y,m,1);
  while(cur<=b){ if(cur>a) count++; cur=new Date(cur.getFullYear(),cur.getMonth()+1,1); }
  return count;
}
function titlePlain(s){return String(s||'').replace(/^#\d+\s*/,'').trim()}

class Planner{
  constructor(root, opt){
    this.root=typeof root==='string'?document.querySelector(root):root;
    if(!this.root) throw new Error('mount target not found');
    this.data=(opt&&opt.data)||window.UMA_GACHA_DATA;
    this.plan=(opt&&opt.plannerData)||window.UMA_GACHA_PLANNER_DATA;
    if(!this.data||!this.plan) throw new Error('gacha/planner data missing');
    this.groups=this.buildGroups();
    this.state=this.defaultState();
    this.loadLocal(false);
    if(!this.state.activeGroupId) this.state.activeGroupId=this.firstPlayableId();
    this.renderShell();
    this.bind();
    this.renderAll();
  }
  buildGroups(){
    const rows=this.plan.xlsxRows||[];
    const rowBySource=new Map(rows.map(r=>[r.sourceTitle,r]));
    const map=new Map();
    const add=(mode,b)=>{
      if(!b||String(b.id||'').includes('empty')||!b.number) return;
      const key=String(b.number);
      const g=map.get(key)||{id:'g-'+key,number:b.number,startDate:b.startDate,endDate:b.endDate,sourceTitle:b.sourceTitle,modes:{},pickupNames:[],rawKind:'',plannedDefault:false,freePulls:0,expectedJewelUse:0,notes:[]};
      g.startDate=dateMin(g.startDate,b.startDate); g.endDate=dateMax(g.endDate,b.endDate); g.sourceTitle=g.sourceTitle||b.sourceTitle;
      g.modes[mode]=b;
      (b.pickupNames||[]).forEach(n=>{if(n&&!g.pickupNames.includes(n))g.pickupNames.push(n)});
      const row=rowBySource.get(b.sourceTitle);
      if(row){g.rawKind=row.kind||g.rawKind; g.plannedDefault=!!row.plannedDefault; g.freePulls=Number(row.freePulls||0); g.expectedJewelUse=Number(row.expectedJewelUse||0); if(row.note)g.notes.push(row.note)}
      map.set(key,g);
    };
    (this.data.presetBanners.character||[]).forEach(b=>add('character',b));
    (this.data.presetBanners.support||[]).forEach(b=>add('support',b));
    return Array.from(map.values()).sort((a,b)=>a.number-b.number);
  }
  defaultState(){
    const init=this.plan.initial||{};
    const settings={baseDate:init.baseDate||'2026-05-31',jewels:+init.jewels||0,characterTickets:+init.characterTickets||0,supportTickets:+init.supportTickets||0,limitBreakPieces:+init.limitBreakPieces||0,monthlyCharTickets:+init.monthlyCharTickets||0,monthlySupportTickets:+init.monthlySupportTickets||0,dailyJewels:+init.dailyJewels||0,monthlyJewels:+init.monthlyJewels||0,dailyJewelPack:!!init.dailyJewelPack,trainingPass:!!init.trainingPass,selectorPack:!!init.selectorPack,premiumPack:!!init.premiumPack,medalShop:init.medalShop!==false,clubRank:init.clubRank||'',teamRank:init.teamRank||'',championsMeeting:init.championsMeeting||'',loh:init.loh||''};
    const per={};
    this.groups.forEach(g=>{per[g.id]={skipped:!g.plannedDefault&&false,completed:false,freePulls:g.freePulls||0,manualJewelUse:g.expectedJewelUse||0,extraJewelIncome:0,sim:{character:this.blankSim(),support:this.blankSim()}}});
    return {settings,per,activeGroupId:null,activeMode:'character',useTicketsFirst:true,showSkipped:false,log:[]};
  }
  blankSim(){return {pulls:0,freeSpent:0,ticketSpent:0,jewelsSpent:0,topCount:0,pickupCount:0,history:[],collection:{}}}
  firstPlayableId(){const g=this.groups.find(x=>!this.state?.per?.[x.id]?.skipped);return g?g.id:(this.groups[0]&&this.groups[0].id)}
  saveLocal(){try{localStorage.setItem('umaGachaPlannerState',JSON.stringify(this.state))}catch(e){}}
  loadLocal(notify=true){try{const raw=localStorage.getItem('umaGachaPlannerState');if(raw){const s=JSON.parse(raw);this.state={...this.state,...s,settings:{...this.state.settings,...(s.settings||{})},per:{...this.state.per,...(s.per||{})}}; if(notify) alert('저장 상태를 불러왔습니다.')}}catch(e){}}
  resetLocal(){localStorage.removeItem('umaGachaPlannerState');this.state=this.defaultState();this.state.activeGroupId=this.firstPlayableId();this.renderAll()}

  renderShell(){
    this.root.innerHTML=`<div class="wrap">
      <header class="header"><div><h1>우마무스메 가챠 미래시 플래너</h1><p>엑셀 미래시 계산기식 자원 계획 + 배너별 가챠 시뮬레이터를 한 화면에서 진행합니다.</p></div>
      <div class="header-actions"><button data-act="export">상태 JSON</button><button class="secondary" data-act="import">JSON 불러오기</button><button class="danger" data-act="reset-all">전체 초기화</button></div></header>
      <section class="card user-card"><div class="user-grid" data-role="settings"></div><div class="kpi-row" data-role="kpis"></div><textarea class="json-box" data-role="json" placeholder="상태 JSON 내보내기/불러오기"></textarea></section>
      <main class="main"><section><div class="timeline-head"><h2>미래시 진행표</h2><div class="timeline-tools"><label><input type="checkbox" data-opt="showSkipped"> 숨긴 가챠 보기</label><button class="secondary" data-act="activate-next">다음 진행 가챠</button></div></div><div class="timeline" data-role="timeline"></div></section><aside class="card sim-panel" data-role="sim"></aside></main>
      <div class="footnote"><b>데이터 주의:</b> 업로드된 XLSX의 <code>가챠 정보(평가x)</code> 시트는 IMPORTRANGE 캐시가 <code>#REF!</code> 상태라, 배너 시작/종료일·픽업명은 v4 가챠 데이터의 보정 결과를 우선 사용합니다. 무료뽑 수는 화면에서 직접 수정할 수 있고, 기간 수입은 XLSX의 각 사료 시트에서 추출한 이벤트를 합산합니다.</div>
    </div>`;
    const st=$('[data-role="settings"]',this.root);
    const opts=this.plan.settingOptions||{};
    const selectHtml=(k)=>{const list=opts[k]||[];return `<select data-setting="${k}">${list.map(o=>`<option value="${esc(o)}" ${String(this.state.settings[k]||'')===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select>`};
    const fields=[
      ['baseDate','기준일','date'],['jewels','현재 주얼','number'],['characterTickets','말뽑 티켓','number'],['supportTickets','서폿 티켓','number'],['limitBreakPieces','한돌석 조각','number'],['monthlyCharTickets','월초 말뽑티켓','number'],['monthlySupportTickets','월초 서폿티켓','number'],
      ['clubRank','서클','select'],['teamRank','팀레','select'],['championsMeeting','챔미','select'],['loh','말오스','select']
    ];
    st.innerHTML=fields.map(([k,l,t])=>`<div class="field"><label>${l}</label>${t==='select'?selectHtml(k):`<input data-setting="${k}" type="${t}" value="${esc(this.state.settings[k])}">`}</div>`).join('')+
      ['dailyJewelPack:데일리 쥬얼팩','trainingPass:트레이닝 패스','selectorPack:선택권 구매','premiumPack:흑우팩 구매','medalShop:메달상점 구매'].map(x=>{const[k,l]=x.split(':');return `<div class="field checkbox"><label><input type="checkbox" data-setting="${k}" ${this.state.settings[k]?'checked':''}> ${l}</label></div>`}).join('');
  }
  bind(){
    this.root.addEventListener('input',e=>{
      const s=e.target.dataset.setting;if(s){const t=e.target;this.state.settings[s]=t.type==='checkbox'?t.checked:(t.type==='number'?Number(t.value||0):t.value);this.renderDynamic();return}
      const gid=e.target.dataset.gid, field=e.target.dataset.field;if(gid&&field){const p=this.state.per[gid];p[field]=Number(e.target.value||0);this.renderDynamic();return}
      const j=$('[data-role="json"]',this.root); if(e.target===j) return;
    });
    this.root.addEventListener('change',e=>{
      const s=e.target.dataset.setting;if(s){const t=e.target;this.state.settings[s]=t.type==='checkbox'?t.checked:(t.type==='number'?Number(t.value||0):t.value);this.renderDynamic();return}
      const opt=e.target.dataset.opt;if(opt){this.state[opt]=e.target.checked;this.renderAll()}
    });
    this.root.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return; const act=b.dataset.act;
      if(act==='reset-all'){if(confirm('모든 진행 상태를 초기화할까요?'))this.resetLocal()}
      if(act==='export')this.exportState(); if(act==='import')this.importState(); if(act==='activate-next'){this.activateNext();}
      const gid=b.dataset.gid; if(gid&&act==='skip'){this.state.per[gid].skipped=true;if(this.state.activeGroupId===gid)this.activateNext();this.renderAll()}
      if(gid&&act==='restore'){this.state.per[gid].skipped=false;this.state.activeGroupId=gid;this.renderAll()}
      if(gid&&act==='open'){this.state.activeGroupId=gid;this.state.activeMode=this.defaultModeForGroup(this.group(gid));this.renderAll()}
      if(act==='mode'){this.state.activeMode=b.dataset.mode;this.renderAll()}
      if(act==='draw'){this.draw(Number(b.dataset.count||1))}
      if(act==='complete'){this.completeActive()}
      if(act==='sim-reset'){this.resetActiveSim()}
    });
  }
  exportState(){const j=$('[data-role="json"]',this.root);j.value=JSON.stringify(this.state,null,2);j.focus();j.select();}
  importState(){const j=$('[data-role="json"]',this.root);try{const s=JSON.parse(j.value);this.state={...this.state,...s,settings:{...this.state.settings,...(s.settings||{})},per:{...this.state.per,...(s.per||{})}};this.renderShell();this.renderAll();}catch(e){alert('JSON 형식이 올바르지 않습니다.')}}
  renderAll(){this.renderSettingsValues();this.renderDynamic();}
  renderSettingsValues(){ $all(this.root,'[data-setting]').forEach(el=>{const v=this.state.settings[el.dataset.setting]; if(el.type==='checkbox')el.checked=!!v; else el.value=v??''}); const opt=$('[data-opt="showSkipped"]',this.root); if(opt)opt.checked=!!this.state.showSkipped; }
  renderDynamic(){const calc=this.compute();this.calc=calc;this.renderKpis(calc);this.renderTimeline(calc);this.renderSim(calc);this.saveLocal();}
  renderKpis(calc){const last=calc.rows.filter(r=>!r.skipped).at(-1);const active=calc.byId[this.state.activeGroupId];const k=$('[data-role="kpis"]',this.root);k.innerHTML=[
      ['현재 주얼',num(this.state.settings.jewels)],['현재 말/서폿 티켓',`${num(this.state.settings.characterTickets)} / ${num(this.state.settings.supportTickets)}`],['활성 가챠 시작 주얼',active?num(active.start.jewels):'-'],['마지막 계산 후 주얼',last?num(last.after.jewels):num(this.state.settings.jewels)],['완료/숨김',`${calc.rows.filter(r=>r.completed).length} / ${calc.rows.filter(r=>r.skipped).length}`]
    ].map(([a,b])=>`<div class="kpi"><span>${a}</span><b>${b}</b></div>`).join('')}
  compute(){
    const rows=[],byId={};let jewels=+this.state.settings.jewels||0, ct=+this.state.settings.characterTickets||0, st=+this.state.settings.supportTickets||0, lb=+this.state.settings.limitBreakPieces||0;let cursor=this.state.settings.baseDate;
    for(const g of this.groups){const p=this.state.per[g.id]||{};const skipped=!!p.skipped;if(skipped&&!this.state.showSkipped){rows.push({g,skipped:true,hidden:true});continue}
      const days=diffDays(cursor,g.startDate);const months=monthBoundaries(cursor,g.startDate);const reward=this.sumRewardsBetween(cursor,g.startDate);reward.jewels+=(+p.extraJewelIncome||0);
      jewels+=reward.jewels;ct+=reward.characterTickets;st+=reward.supportTickets;lb+=reward.limitBreakPieces;
      const start={jewels,characterTickets:ct,supportTickets:st,limitBreakPieces:lb,days,months,income:reward.jewels,addCt:reward.characterTickets,addSt:reward.supportTickets,addLb:reward.limitBreakPieces,reward};
      const used=this.usage(p);
      if(!skipped){jewels-=used.jewels;ct-=used.characterTickets;st-=used.supportTickets;lb-=used.limitBreakPieces;}
      const after={jewels,characterTickets:ct,supportTickets:st,limitBreakPieces:lb};
      const row={g,p,skipped,completed:!!p.completed,start,used,after};rows.push(row);byId[g.id]=row;cursor=g.startDate||cursor;
    }
    return {rows,byId};
  }
  usage(p){const cs=p.sim?.character||this.blankSim(), ss=p.sim?.support||this.blankSim();return {jewels:(cs.jewelsSpent||0)+(ss.jewelsSpent||0)+(+p.manualJewelUse||0),characterTickets:cs.ticketSpent||0,supportTickets:ss.ticketSpent||0,limitBreakPieces:0,free:(cs.freeSpent||0)+(ss.freeSpent||0),pulls:(cs.pulls||0)+(ss.pulls||0)}}
  emptyReward(){return {jewels:0,characterTickets:0,supportTickets:0,limitBreakPieces:0,events:0,details:{}}}
  addReward(total,v){if(!v)return;total.jewels+=+v.jewels||0;total.characterTickets+=+v.characterTickets||0;total.supportTickets+=+v.supportTickets||0;total.limitBreakPieces+=+v.limitBreakPieces||0;total.events+=(v.events||1);if(v.source){const d=total.details[v.source]||{jewels:0,characterTickets:0,supportTickets:0,limitBreakPieces:0,events:0};d.jewels+=+v.jewels||0;d.characterTickets+=+v.characterTickets||0;d.supportTickets+=+v.supportTickets||0;d.limitBreakPieces+=+v.limitBreakPieces||0;d.events+=(v.events||1);total.details[v.source]=d;}}
  sumRewardsBetween(from,to){const total=this.emptyReward();const rewards=this.plan.rewards||[];const a=asDate(from), b=asDate(to);if(!a||!b)return total;for(const ev of rewards){const d=asDate(ev.date);if(!d||!(d>a&&d<=b))continue;this.addReward(total,this.eventValue(ev));}return total}
  eventValue(ev){const s=this.state.settings;if(ev.condition&&s[ev.condition]!==true)return null;if(ev.kind){
      if(ev.kind==='championsMeeting')return {...(this.plan.pvpRewards?.championsMeeting?.[s.championsMeeting]||{}),source:ev.source};
      if(ev.kind==='loh')return {...(this.plan.pvpRewards?.loh?.[s.loh]||{}),source:ev.source};
      if(ev.kind==='teamRank')return {...(this.plan.pvpRewards?.teamRank?.[s.teamRank]||{}),source:ev.source};
      if(ev.kind==='clubRank')return {...(this.plan.pvpRewards?.clubRank?.[s.clubRank]||{}),source:ev.source};
      if(ev.kind==='trainingPass'){const c=this.plan.dynamicRewardConstants?.trainingPass||{};return {...(s.trainingPass?c.premium:c.normal),source:ev.source};}
      if(ev.kind==='monthlyShop')return {characterTickets:+s.monthlyCharTickets||0,supportTickets:+s.monthlySupportTickets||0,limitBreakPieces:s.medalShop?1:0,source:ev.source};
    }
    return {jewels:+ev.jewels||0,characterTickets:+ev.characterTickets||0,supportTickets:+ev.supportTickets||0,limitBreakPieces:+ev.limitBreakPieces||0,source:ev.source};}
  group(id){return this.groups.find(g=>g.id===id)}
  defaultModeForGroup(g){return g?.modes?.character?'character':'support'}
  renderTimeline(calc){const el=$('[data-role="timeline"]',this.root);const visible=calc.rows.filter(r=>!r.hidden);if(!visible.length){el.innerHTML='<div class="card empty">표시할 가챠가 없습니다.</div>';return}
    el.innerHTML=visible.map(r=>this.cardHtml(r)).join('');}
  cardHtml(r){const g=r.g,p=r.p;const active=this.state.activeGroupId===g.id;const modes=Object.keys(g.modes);const modeBadges=modes.map(m=>`<span class="badge">${MODE_FULL[m]}</span>`).join('');const pick=g.pickupNames.length?g.pickupNames.map(n=>`<li>${esc(n)}</li>`).join(''):'<li class="small">픽업 매칭 정보 없음/직접 설정 필요</li>';
    const startJewelCls=r.start.jewels<0?'negative':'';const afterCls=r.after.jewels<0?'negative':'positive';
    return `<article class="card gacha-card ${active?'active':''} ${r.completed?'completed':''}">
      <div class="banner-art"><div><span class="pickup-no">PICKUP #${g.number}</span><div class="pickup-title">${esc(g.sourceTitle||g.pickupNames.join(', '))}</div></div><div class="pickup-date">${esc(g.startDate)} ~ ${esc(g.endDate)}</div></div>
      <div class="gacha-body"><div class="gacha-top"><div><div class="gacha-title">#${g.number} ${esc(g.pickupNames.join(', ')||titlePlain(g.sourceTitle))}</div><div class="badges">${modeBadges}${g.plannedDefault?'<span class="badge plan">엑셀 체크</span>':''}${r.skipped?'<span class="badge skip">숨김</span>':''}${p.freePulls?`<span class="badge free">무료 ${num(p.freePulls)}연</span>`:''}${r.completed?'<span class="badge done">완료</span>':''}</div></div></div>
      <ul class="pickups">${pick}</ul>
      <div class="info-grid"><div class="info"><label>시작 시 주얼</label><b class="${startJewelCls}">${num(Math.floor(r.start.jewels))}</b></div><div class="info"><label>시작 말/서폿 티켓</label><b>${num(Math.floor(r.start.characterTickets))} / ${num(Math.floor(r.start.supportTickets))}</b></div><div class="info"><label>기간 수입</label><b>+${num(Math.floor(r.start.income))}</b><span class="small">말 +${num(Math.floor(r.start.addCt||0))} / 서 +${num(Math.floor(r.start.addSt||0))} / 조각 +${num(Math.floor(r.start.addLb||0))}</span></div><div class="info"><label>차감 후 주얼</label><b class="${afterCls}">${num(Math.floor(r.after.jewels))}</b></div></div>
      <div class="edit-grid"><div class="field"><label>무료뽑</label><input type="number" min="0" data-gid="${g.id}" data-field="freePulls" value="${p.freePulls||0}"></div><div class="field"><label>예정/추가 주얼 사용</label><input type="number" min="0" step="150" data-gid="${g.id}" data-field="manualJewelUse" value="${p.manualJewelUse||0}"></div><div class="field"><label>추가 수입 보정</label><input type="number" step="1" data-gid="${g.id}" data-field="extraJewelIncome" value="${p.extraJewelIncome||0}"></div><div class="info"><label>시뮬 사용</label><b>${num(r.used.jewels)} 주얼 / ${num(r.used.free)} 무료</b></div><div class="info"><label>교환 Pt</label><b>${this.ceilingText(p)}</b></div></div>
      <div class="card-actions">${r.skipped?`<button data-act="restore" data-gid="${g.id}">다시 표시</button>`:`<button data-act="open" data-gid="${g.id}">이 가챠 시뮬레이터</button><button class="ghost" data-act="skip" data-gid="${g.id}">픽업 하지않음</button>`}</div>
      ${g.notes&&g.notes.length?`<div class="calc-note">${esc(g.notes[0])}</div>`:''}</div></article>`}
  ceilingText(p){const c=(p.sim?.character?.pulls||0),s=(p.sim?.support?.pulls||0);const arr=[];if(c)arr.push(`말 ${c%200}/200 (${Math.floor(c/200)}개)`);if(s)arr.push(`서 ${s%200}/200 (${Math.floor(s/200)}개)`);return arr.join(' · ')||'0/200 (0개)'}

  renderSim(calc){const el=$('[data-role="sim"]',this.root);const row=calc.byId[this.state.activeGroupId];if(!row||row.skipped){el.innerHTML='<div class="empty">진행할 가챠를 선택하세요.</div>';return}const g=row.g;if(!g.modes[this.state.activeMode])this.state.activeMode=this.defaultModeForGroup(g);const mode=this.state.activeMode, banner=g.modes[mode], p=row.p, sim=p.sim[mode];const rem=this.remainingFor(row,mode);const modes=Object.keys(g.modes).map(m=>`<button data-act="mode" data-mode="${m}" class="${m===mode?'active':''}">${MODE_FULL[m]}</button>`).join('');const topItems=Object.entries(sim.collection||{}).sort((a,b)=>b[1].count-a[1].count).slice(0,20);
    el.innerHTML=`<div class="sim-header"><div><h2>가챠 시뮬레이터</h2><div class="sim-title">#${g.number} ${esc(banner.label||g.sourceTitle)}</div><div class="small">${esc(g.startDate)} ~ ${esc(g.endDate)}</div></div></div><div class="mode-tabs">${modes}</div>
      <div class="resource-box"><div class="resource"><span>남은 주얼</span><b class="${rem.jewels<0?'negative':''}">${num(Math.floor(rem.jewels))}</b></div><div class="resource"><span>남은 티켓</span><b>${num(Math.floor(rem.tickets))}</b></div><div class="resource"><span>남은 무료뽑</span><b>${num(Math.floor(rem.free))}</b></div></div>
      <div class="draw-options"><label><input type="checkbox" data-opt="useTicketsFirst" ${this.state.useTicketsFirst?'checked':''}> 무료뽑 다음 티켓 우선 사용</label><span>픽업 ${pct((banner.pickupRate||RATE.pickup)*(banner.pickupIds||[]).length || RATE.pickup)}</span></div>
      <div class="draw-actions"><button data-act="draw" data-count="1">1번 가챠</button><button data-act="draw" data-count="10">10번 가챠</button><button data-act="draw" data-count="100">100연차</button><button class="secondary" data-act="complete">완료하고 다음</button><button class="danger" data-act="sim-reset">이 배너 시뮬 초기화</button></div>
      <div class="result-grid">${this.resultsHtml(sim.history.slice(0,10))}</div>
      <table class="stats-table"><tr><td>총 횟수</td><td>${num(sim.pulls)}</td></tr><tr><td>무료/티켓/주얼 사용</td><td>${num(sim.freeSpent)} / ${num(sim.ticketSpent)} / ${num(sim.jewelsSpent)}</td></tr><tr><td>${TOP_LABEL[mode]} 획득</td><td>${num(sim.topCount)}</td></tr><tr><td>픽업 획득</td><td>${num(sim.pickupCount)}</td></tr><tr><td>교환 Pt</td><td>${sim.pulls%200} / 200 (${Math.floor(sim.pulls/200)}개)</td></tr></table>
      <h3>지금까지 획득 (${TOP_LABEL[mode]}만)</h3><div class="owned">${topItems.length?topItems.map(([id,o])=>`<div class="owned-item"><span>${esc(o.name)}</span><b>x${o.count}</b></div>`).join(''):'<div class="small">아직 최고 등급 획득 없음</div>'}</div>`}
  resultsHtml(items){if(!items.length)return '<div class="empty">버튼을 누르면 결과가 표시됩니다.</div>';return items.map(it=>`<div class="result-card ${it.tier==='top'?'top':''} ${it.pickup?'pickup':''}"><div class="rarity">${esc(it.rarity)}${it.pickup?' PICKUP':''}</div><div class="name">${esc(it.name)}</div></div>`).join('')}
  remainingFor(row,mode){const sim=row.p.sim[mode];const tickets=mode==='character'?row.start.characterTickets-row.used.characterTickets:row.start.supportTickets-row.used.supportTickets;const free=(row.p.freePulls||0)-row.used.free;return {jewels:row.start.jewels-row.used.jewels,tickets,free}}
  getPools(mode,banner){const all=mode==='support'?this.data.supports:this.data.characters;const n=Number(banner.number);const avail=all.filter(it=>{const rn=Number(it.releaseBannerNumber);return !Number.isFinite(n)||!Number.isFinite(rn)||rn<=n});return {top:avail.filter(it=>this.tier(mode,it)==='top'),mid:avail.filter(it=>this.tier(mode,it)==='mid'),low:avail.filter(it=>this.tier(mode,it)==='low')}}
  tier(mode,it){return TIER_MAP[mode][it.rarity]||(it.rarityValue===3?'top':it.rarityValue===2?'mid':'low')}
  draw(count){let baseRow=this.calc.byId[this.state.activeGroupId];if(!baseRow)return;const mode=this.state.activeMode,banner=baseRow.g.modes[mode],p=baseRow.p,sim=p.sim[mode];let made=0, stopped=false;const batch=count;
    for(let i=1;i<=batch;i++){const current=this.compute().byId[this.state.activeGroupId];let rem=this.remainingFor(current,mode);if(rem.free>0){sim.freeSpent++}else if(this.state.useTicketsFirst&&rem.tickets>0){sim.ticketSpent++}else if(rem.jewels>=RATE.jewelPerPull){sim.jewelsSpent+=RATE.jewelPerPull}else{stopped=true;break}
      const guarantee=(batch>=10 && i%10===0);const item=this.roll(mode,banner,guarantee);sim.pulls++;made++;if(item.tier==='top'){sim.topCount++;const o=sim.collection[item.id]||{name:item.name,count:0};o.count++;sim.collection[item.id]=o}if(item.pickup)sim.pickupCount++;sim.history.unshift(item);sim.history=sim.history.slice(0,80);
    }
    if(stopped)alert(`${made}회 진행 후 자원이 부족해서 멈췄습니다.`);this.renderDynamic();}
  roll(mode,banner,guarantee){const pools=this.getPools(mode,banner);let tier='low';const r=Math.random();if(guarantee){tier=r<RATE.guaranteedTop?'top':'mid'}else{tier=r<RATE.top?'top':(r<RATE.top+RATE.mid?'mid':'low')}
    const ids=banner.pickupIds||[], pickupRate=(banner.pickupRate||RATE.pickup)*ids.length;
    let picked=false,item=null;if(tier==='top'&&ids.length&&Math.random()<Math.min(pickupRate/RATE.top,1)){const id=rnd(ids);item=byId(mode==='support'?this.data.supports:this.data.characters,id);picked=!!item}
    if(!item){let pool=pools[tier]||[];if(tier==='top'&&ids.length)pool=pool.filter(x=>!ids.includes(String(x.id)));item=rnd(pool.length?pool:(pools.top.concat(pools.mid,pools.low)))||{id:'unknown',display:'알 수 없음',name:'알 수 없음',rarity:'?'};}
    return {id:String(item.id),name:item.display||item.name,rarity:item.rarity||TOP_LABEL[mode],tier,pickup:picked};}
  activateNext(){const idx=this.groups.findIndex(g=>g.id===this.state.activeGroupId);const next=this.groups.slice(Math.max(idx+1,0)).find(g=>!this.state.per[g.id]?.skipped)||this.groups.find(g=>!this.state.per[g.id]?.skipped);if(next){this.state.activeGroupId=next.id;this.state.activeMode=this.defaultModeForGroup(next);this.renderAll()}}
  completeActive(){const id=this.state.activeGroupId;if(id)this.state.per[id].completed=true;this.activateNext()}
  resetActiveSim(){const row=this.calc.byId[this.state.activeGroupId];if(!row)return;if(confirm('현재 배너의 시뮬레이션 결과만 초기화할까요?')){row.p.sim={character:this.blankSim(),support:this.blankSim()};row.p.completed=false;this.renderDynamic()}}
}

window.UmaGachaPlanner={mount:(root,opt)=>new Planner(root,opt)};
})();
