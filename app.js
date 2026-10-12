const stateKey='tenwords-progress-v1';
const themeKey='tenwords-theme';
const databaseKey='tenwords-database-v1';
let libraryDate=null;
let libraryLimit=50;
let lastSync=0;
let toastTimer;
let refreshing=false;
const REVIEW_INTERVALS=[1,3,7,14,30];
let db={packs:[]};
let reviewGroups=[];
let isSpeakingAll=false;
let speechRunId=0;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
let progressRaw,progressValue={};
const progress=()=>{const raw=localStorage.getItem(stateKey)||'{}';if(raw!==progressRaw){try{progressValue=JSON.parse(raw);progressRaw=raw}catch(e){console.warn('学习记录读取失败',e)}}return {...progressValue}};
const saveProgress=p=>{try{localStorage.setItem(stateKey,JSON.stringify(p));return true}catch(e){notify('记录保存失败，请检查设备存储空间');return false}};
function notify(message,action=null){
  const box=$('#toast');if(!box)return;clearTimeout(toastTimer);box.replaceChildren();
  const text=document.createElement('span');text.textContent=message;box.appendChild(text);
  if(action){const button=document.createElement('button');button.textContent=action.label;button.onclick=()=>{action.run();box.hidden=true};box.appendChild(button)}
  box.hidden=false;toastTimer=setTimeout(()=>box.hidden=true,action?8000:4000);
}
function cachedDatabase(){try{const value=JSON.parse(localStorage.getItem(databaseKey)||'null');if(value?.packs?.length && value.packs.every(p=>typeof p.date==='string'&&Array.isArray(p.words)))return value}catch(e){console.warn(e)}return null}
function storeDatabase(value){try{localStorage.setItem(databaseKey,JSON.stringify(value))}catch(e){console.warn('离线词库缓存保存失败',e)}}
const fmtShortDate=d=>{const [y,m,day]=d.split('-');return `${Number(m)}.${Number(day)}`};
const fmtDate=fmtShortDate;
const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);

async function fetchJSON(path){
  const sep=path.includes('?')?'&':'?';
  const r=await fetch(`${path}${sep}v=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadDatabase(){
  const base=await fetchJSON('data/words.json');
  const packMap=new Map([...(cachedDatabase()?.packs||[]),...(base.packs||[])].map(pack=>[pack.date,pack]));
  const todayRequest=fetchJSON(`data/daily/${todayISO()}.json`).then(pack=>{
    if(pack.date===todayISO() && Array.isArray(pack.words)) packMap.set(pack.date,pack);
  }).catch(e=>console.warn('今日词包尚未可用',e));
  try{
    const index=await fetchJSON('data/daily/index.json');
    const dates=[...new Set(index.dates||[])].sort();
    const results=await Promise.allSettled(dates.map(date=>fetchJSON(`data/daily/${date}.json`)));
    results.forEach(result=>{
      if(result.status==='fulfilled'){
        const pack=result.value;
        if(pack && pack.date && Array.isArray(pack.words)) packMap.set(pack.date,pack);
      }
    });
  }catch(e){
    console.warn('每日词包暂时加载失败，已回退到历史总词库。',e);
  }
  await todayRequest;
  return {
    reviewIntervals:base.reviewIntervals||REVIEW_INTERVALS,
    packs:[...packMap.values()].sort((a,b)=>a.date.localeCompare(b.date))
  };
}

function allWords(){return db.packs.flatMap(p=>p.words.map(w=>({...w,date:p.date}))) }
function currentPack(){
  const t=todayISO();
  return db.packs.find(p=>p.date===t) || [...db.packs].filter(p=>p.date<=t).at(-1) || db.packs.at(-1);
}
function stopSpeech(){
  speechRunId++;
  isSpeakingAll=false;
  if('speechSynthesis' in window) speechSynthesis.cancel();
  const btn=$('#speakAllBtn');
  if(btn){btn.textContent='▶ 连续朗读';btn.classList.remove('speaking');btn.setAttribute('aria-pressed','false')}
}
function speak(text){
  stopSpeech();
  if(!('speechSynthesis' in window)) return alert('当前浏览器不支持语音朗读。');
  const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.9;speechSynthesis.speak(u);
}
function wordStatus(id){return progress()[id]?.status||'new'}
function setStatus(id,status){
  const p=progress(),previous=p[id];
  const next=previous?.status===status?'new':status;
  p[id]={...(previous||{}),status:next,updatedAt:new Date().toISOString()};
  if(!saveProgress(p))return;renderAll();
  notify(next==='mastered'?'已标记掌握':next==='fuzzy'?'已标记模糊':'已取消标记',{label:'撤销',run:()=>{const latest=progress();if(previous)latest[id]=previous;else delete latest[id];if(saveProgress(latest))renderAll()}});
}
function createWordCard(word,meta=null){
  const el=$('#wordCardTemplate').content.firstElementChild.cloneNode(true);
  el.dataset.id=word.id;
  el.querySelector('.word-title').textContent=word.word;
  el.querySelector('.ipa').textContent=word.ipa;
  el.querySelector('.meaning').textContent=word.meaning;
  el.querySelector('.collocation').textContent=word.collocation;
  el.querySelector('.date-pill').textContent=`学习：${fmtShortDate(word.date)}`;
  el.querySelector('.example').textContent=word.example;
  el.querySelector('.translation').textContent=word.translation;
  el.querySelector('.scene').textContent=word.scene||'通用英语 / AI / 论文阅读场景';
  el.querySelector('.speak-word').onclick=()=>speak(word.word);
  el.querySelector('.speak-example').onclick=()=>speak(word.example);
  const st=wordStatus(word.id);
  el.querySelectorAll('.status-btn').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.status===st));if(b.dataset.status===st)b.classList.add('active');b.onclick=()=>setStatus(word.id,b.dataset.status)});
  if(meta){
    const metaPill=document.createElement('span');metaPill.className='pill review-pill';
    metaPill.textContent=`第${meta.reviewNumber}次 · +${meta.interval}天`;
    el.querySelector('.pill-row').appendChild(metaPill);
  }
  return el;
}
function renderList(container,words,meta=null){
  container.innerHTML='';
  if(!words.length){container.innerHTML='<div class="empty">这里暂时没有内容。</div>';return}
  words.forEach(w=>container.appendChild(createWordCard(w,meta)));
}
function renderToday(){
  const pack=currentPack();
  if(!pack){$('#todayList').innerHTML='<div class="empty">词库为空。</div>';return}
  const words=pack.words.map(w=>({...w,date:pack.date}));
  $('#heroDate').textContent=fmtDate(pack.date);
  $('#heroTitle').textContent=pack.date===todayISO()?'今天，记住 10 个真正有用的词':'最新词包 · 10 个词';
  const newest=db.packs.at(-1);
  $('#syncStatus').textContent=!navigator.onLine?'离线浏览 · 学习标记仍可保存':pack.date!==todayISO()?'今日词包尚未发布，当前显示最新词包':lastSync?'已同步 · 每日凌晨 3:00 开始生成':'已加载缓存 · 正在检查更新';
  $('#heroSubtitle').textContent=`词库已更新至 ${fmtShortDate(newest.date)} · ${db.packs.length} 组学习记录 · 复习间隔 1/3/7/14/30 天`;
  renderList($('#todayList'),words);
  const mastered=words.filter(w=>wordStatus(w.id)==='mastered').length;
  const pct=words.length?Math.round(mastered/words.length*100):0;
  $('#progressRing').style.setProperty('--p',pct+'%');
  $('#progressText').textContent=`${mastered}/${words.length}`;
}
function buildReviewGroups(){
  const t=todayISO();
  return db.packs.map(pack=>{
    const interval=daysBetween(pack.date,t);
    const idx=REVIEW_INTERVALS.indexOf(interval);
    if(idx<0) return null;
    return {sourceDate:pack.date,interval,reviewNumber:idx+1,words:pack.words.map(w=>({...w,date:pack.date}))};
  }).filter(Boolean).sort((a,b)=>a.interval-b.interval);
}
function renderReviewGroups(){
  const box=$('#reviewList');box.innerHTML='';
  if(!reviewGroups.length){
    box.innerHTML='<div class="empty">今天没有正好到期的复习组。间隔计划为 1 / 3 / 7 / 14 / 30 天。</div>';
    return;
  }
  reviewGroups.forEach(group=>{
    const sec=document.createElement('section');sec.className='review-group';
    const mastered=group.words.filter(w=>wordStatus(w.id)==='mastered').length;
    sec.innerHTML=`<div class="review-group-head"><div><div class="review-kicker">${fmtShortDate(group.sourceDate)} 学习的词</div><h4>第 ${group.reviewNumber} 次复习</h4><p>原学习日：${fmtDate(group.sourceDate)} · 学习后 <strong>${group.interval}</strong> 天 · 本组 ${group.words.length} 词</p></div><div class="review-progress">${mastered}/${group.words.length} 已掌握</div></div>`;
    const list=document.createElement('div');list.className='word-list';
    group.words.forEach(w=>list.appendChild(createWordCard(w,group)));
    sec.appendChild(list);box.appendChild(sec);
  });
}
function makeReview(){reviewGroups=buildReviewGroups();renderReviewGroups()}
function renderHistory(){
  const box=$('#historyList');box.innerHTML='';
  const firstSeen=new Map();
  for(const w of allWords()){const key=w.word.toLowerCase();if(!firstSeen.has(key))firstSeen.set(key,w.date)}
  [...db.packs].reverse().forEach(pack=>{
    const div=document.createElement('div');div.className='history-card';
    const mastered=pack.words.filter(w=>wordStatus(w.id)==='mastered').length;
    const repeatCount=pack.words.filter(w=>firstSeen.get(w.word.toLowerCase())<pack.date).length;
    div.innerHTML=`<h4>${fmtDate(pack.date)}</h4><p>${pack.words.length} 个词 · 已掌握 ${mastered}${repeatCount?` · ${repeatCount} 个再次出现`:''}</p><button>查看这一天</button>`;
    div.querySelector('button').onclick=()=>{switchView('library');$('#searchInput').value='';$('#statusFilter').value='all';renderLibrary(pack.date)};
    box.appendChild(div);
  })
}
function renderLibrary(dateOnly=libraryDate){
  libraryDate=dateOnly;
  const q=$('#searchInput').value.trim().toLowerCase();const sf=$('#statusFilter').value;
  let words=allWords();if(dateOnly)words=words.filter(w=>w.date===dateOnly);
  if(q)words=words.filter(w=>[w.word,w.meaning,w.collocation,w.example,w.translation,w.scene].join(' ').toLowerCase().includes(q));
  if(sf!=='all')words=words.filter(w=>wordStatus(w.id)===sf);
  const unique=new Set(words.map(w=>w.word.toLowerCase())).size;
  $('#libraryCount').textContent=`共 ${words.length} 条学习记录 · ${unique} 个不同单词`;
  $('#libraryScope').hidden=!dateOnly;
  $('#libraryScopeText').textContent=dateOnly?`${fmtDate(dateOnly)} 的词包`:'';
  renderList($('#libraryList'),words.slice(0,libraryLimit));
  $('#loadMoreBtn').hidden=words.length<=libraryLimit;
  $('#loadMoreBtn').textContent=`再显示 50 条（剩余 ${Math.max(0,words.length-libraryLimit)} 条）`;
}
function switchView(name){
  stopSpeech();
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $('#'+name+'View').classList.add('active-view');
  if(name==='library'){libraryDate=null;libraryLimit=50}
  if(name==='review')makeReview();if(name==='history')renderHistory();if(name==='library')renderLibrary();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderAll(){renderToday();const view=$('.tab.active')?.dataset.view;if(view==='review')makeReview();if(view==='history')renderHistory();if(view==='library')renderLibrary()}
function utter(text,runId){
  return new Promise(resolve=>{
    if(runId!==speechRunId || !isSpeakingAll) return resolve(false);
    const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.88;
    u.onend=()=>resolve(runId===speechRunId && isSpeakingAll);
    u.onerror=()=>resolve(false);
    speechSynthesis.speak(u);
  });
}
async function speakAll(){
  if(!('speechSynthesis' in window)) return alert('当前浏览器不支持语音朗读。');
  if(isSpeakingAll){stopSpeech();return}
  stopSpeech();isSpeakingAll=true;
  const runId=++speechRunId;
  const btn=$('#speakAllBtn');btn.textContent='■ 停止朗读';btn.classList.add('speaking');btn.setAttribute('aria-pressed','true');
  const pack=currentPack();
  try{
    for(const w of pack.words){
      if(runId!==speechRunId || !isSpeakingAll) break;
      const keepGoing=await utter(`${w.word}. ${w.example}`,runId);
      if(!keepGoing) break;
    }
  }finally{if(runId===speechRunId) stopSpeech()}
}
async function refreshData(showNotice=true){
  if(refreshing)return;
  if(!navigator.onLine){renderAll();if(showNotice)notify('当前离线，已显示本机缓存词库');return}
  refreshing=true;const btn=$('#refreshBtn');btn.disabled=true;btn.textContent='…';
  try{
    const value=await loadDatabase();db=value;lastSync=Date.now();storeDatabase(db);renderAll();
    if(showNotice)notify(`词库已刷新 · 最新 ${fmtShortDate(db.packs.at(-1).date)}`);
  }catch(e){console.error(e);$('#syncStatus').textContent='同步失败 · 已保留本机词库';if(showNotice)notify('同步失败，请稍后重试')}
  finally{refreshing=false;btn.disabled=false;btn.textContent='↻'}
}
function exportProgress(){
  const data={version:1,exportedAt:new Date().toISOString(),progress:progress(),theme:localStorage.getItem(themeKey)||'light'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`TenWords-学习记录-${todayISO()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notify('学习记录已导出，请保存下载的文件');
}
async function importProgress(file){
  try{
    if(file.size>5*1024*1024)throw Error('文件过大');
    const data=JSON.parse(await file.text());
    if(data.version!==1||!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw Error('不是有效的 TenWords 备份');
    const entries=Object.entries(data.progress);
    for(const [id,value] of entries){if(!/^\d{4}-\d{2}-\d{2}-\d+$/.test(id)||!value||!['new','mastered','fuzzy'].includes(value.status))throw Error('备份包含无效记录')}
    const merged=progress();let count=0;
    for(const [id,value] of entries){if(!merged[id] || (Number.isFinite(Date.parse(value.updatedAt))&&Date.parse(value.updatedAt)>Date.parse(merged[id].updatedAt||'1970-01-01'))){merged[id]={status:value.status,updatedAt:value.updatedAt||new Date().toISOString()};count++}}
    if(!saveProgress(merged))return;renderAll();notify(`已合并 ${count} 条学习记录`);
  }catch(e){notify(`导入失败：${e.message}`)}
}
async function registerServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  try{const reg=await navigator.serviceWorker.register('./sw.js?v=10',{updateViaCache:'none'});await reg.update()}catch(e){console.warn('Service Worker 更新失败',e)}
}
async function init(){
  db=cachedDatabase()||{packs:[]};
  const savedTheme=localStorage.getItem(themeKey);if(savedTheme==='dark')document.documentElement.classList.add('dark');
  $$('.tab').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#searchInput').oninput=()=>{libraryLimit=50;renderLibrary()};$('#statusFilter').onchange=()=>{libraryLimit=50;renderLibrary()};
  $('#clearScopeBtn').onclick=()=>{libraryDate=null;libraryLimit=50;renderLibrary()};
  $('#loadMoreBtn').onclick=()=>{libraryLimit+=50;renderLibrary()};
  $('#exportBtn').onclick=exportProgress;
  $('#importBtn').onclick=()=>$('#importFile').click();
  $('#importFile').onchange=e=>{const file=e.target.files[0];if(file)importProgress(file);e.target.value=''};
  $('#themeBtn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem(themeKey,document.documentElement.classList.contains('dark')?'dark':'light')};
  $('#refreshBtn').onclick=()=>refreshData(true);
  $('#speakAllBtn').onclick=speakAll;
  $('#shuffleReviewBtn').onclick=()=>{reviewGroups=buildReviewGroups();reviewGroups.forEach(g=>{for(let i=g.words.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[g.words[i],g.words[j]]=[g.words[j],g.words[i]]}});renderReviewGroups()};
  $('#resetBtn').onclick=()=>{if(confirm('确定要清空所有“掌握/模糊”记录吗？')){localStorage.removeItem(stateKey);renderAll()}};
  window.addEventListener('beforeunload',stopSpeech);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stopSpeech();else if(Date.now()-lastSync>60000)refreshData(false)});
  window.addEventListener('storage',e=>{if(e.key===stateKey)renderAll()});
  window.addEventListener('online',()=>refreshData(false));
  window.addEventListener('offline',()=>renderAll());
  if(db.packs.length)renderAll();
  else $('#todayList').innerHTML='<div class="empty">正在加载词库，请稍候…</div>';
  registerServiceWorker();
  await refreshData(false);
  if(!db.packs.length){$('#todayList').innerHTML='<div class="empty">暂时无法加载词库，请联网后点击右上角刷新。</div>';$('#syncStatus').textContent='尚无本机缓存'}
}
init();

