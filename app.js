const stateKey='tenwords-progress-v1';
const themeKey='tenwords-theme';
const REVIEW_INTERVALS=[1,3,7,14,30];
let db={packs:[]};
let reviewGroups=[];
let isSpeakingAll=false;
let speechRunId=0;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const progress=()=>JSON.parse(localStorage.getItem(stateKey)||'{}');
const saveProgress=p=>localStorage.setItem(stateKey,JSON.stringify(p));
const fmtDate=d=>new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const fmtShortDate=d=>new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date(d+'T12:00:00'));
const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const daysBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);

function allWords(){return db.packs.flatMap(p=>p.words.map(w=>({...w,date:p.date}))) }
function currentPack(){
  const t=todayISO();
  return db.packs.find(p=>p.date===t) || db.packs.at(-1);
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
  const p=progress();p[id]={...(p[id]||{}),status,updatedAt:new Date().toISOString()};saveProgress(p);renderAll();
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
  el.querySelectorAll('.status-btn').forEach(b=>{if(b.dataset.status===st)b.classList.add('active');b.onclick=()=>setStatus(word.id,b.dataset.status)});
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
  renderList($('#todayList'),words);
  const mastered=words.filter(w=>wordStatus(w.id)==='mastered').length;
  const pct=words.length?Math.round(mastered/words.length*100):0;
  $('#progressRing').style.setProperty('--p',pct+'%');
  $('#progressText').textContent=`${mastered}/${words.length}`;
}
function buildReviewGroups(){
  const t=todayISO();
  return db.packs
    .map(pack=>{
      const interval=daysBetween(pack.date,t);
      const idx=REVIEW_INTERVALS.indexOf(interval);
      if(idx<0) return null;
      return {
        sourceDate:pack.date,
        interval,
        reviewNumber:idx+1,
        words:pack.words.map(w=>({...w,date:pack.date}))
      };
    })
    .filter(Boolean)
    .sort((a,b)=>a.interval-b.interval);
}
function makeReview(){
  reviewGroups=buildReviewGroups();
  const box=$('#reviewList');box.innerHTML='';
  if(!reviewGroups.length){
    box.innerHTML='<div class="empty">今天没有正好到期的复习组。间隔计划为 1 / 3 / 7 / 14 / 30 天。</div>';
    return;
  }
  reviewGroups.forEach(group=>{
    const sec=document.createElement('section');sec.className='review-group';
    const mastered=group.words.filter(w=>wordStatus(w.id)==='mastered').length;
    sec.innerHTML=`<div class="review-group-head">
      <div>
        <div class="review-kicker">${fmtShortDate(group.sourceDate)} 学习的词</div>
        <h4>第 ${group.reviewNumber} 次复习</h4>
        <p>原学习日：${fmtDate(group.sourceDate)} · 学习后 <strong>${group.interval}</strong> 天 · 本组 ${group.words.length} 词</p>
      </div>
      <div class="review-progress">${mastered}/${group.words.length} 已掌握</div>
    </div>`;
    const list=document.createElement('div');list.className='word-list';
    group.words.forEach(w=>list.appendChild(createWordCard(w,group)));
    sec.appendChild(list);box.appendChild(sec);
  });
}
function renderHistory(){
  const box=$('#historyList');box.innerHTML='';
  [...db.packs].reverse().forEach(pack=>{
    const div=document.createElement('div');div.className='history-card';
    const mastered=pack.words.filter(w=>wordStatus(w.id)==='mastered').length;
    const repeatCount=pack.words.filter(w=>allWords().some(x=>x.word.toLowerCase()===w.word.toLowerCase() && x.date<pack.date)).length;
    div.innerHTML=`<h4>${fmtDate(pack.date)}</h4><p>${pack.words.length} 个词 · 已掌握 ${mastered}${repeatCount?` · ${repeatCount} 个再次出现`:''}</p><button>查看这一天</button>`;
    div.querySelector('button').onclick=()=>{switchView('library');$('#searchInput').value='';$('#statusFilter').value='all';renderLibrary(pack.date)};
    box.appendChild(div);
  })
}
function renderLibrary(dateOnly=null){
  const q=$('#searchInput').value.trim().toLowerCase();const sf=$('#statusFilter').value;
  let words=allWords();if(dateOnly)words=words.filter(w=>w.date===dateOnly);
  if(q)words=words.filter(w=>[w.word,w.meaning,w.collocation,w.example,w.translation,w.scene].join(' ').toLowerCase().includes(q));
  if(sf!=='all')words=words.filter(w=>wordStatus(w.id)===sf);
  const unique=new Set(words.map(w=>w.word.toLowerCase())).size;
  $('#libraryCount').textContent=`共 ${words.length} 条学习记录 · ${unique} 个不同单词`;
  renderList($('#libraryList'),words);
}
function switchView(name){
  stopSpeech();
  $$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $('#'+name+'View').classList.add('active-view');
  if(name==='review')makeReview();if(name==='history')renderHistory();if(name==='library')renderLibrary();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderAll(){renderToday();makeReview();renderHistory();renderLibrary()}
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
  stopSpeech();
  isSpeakingAll=true;
  const runId=++speechRunId;
  const btn=$('#speakAllBtn');btn.textContent='■ 停止朗读';btn.classList.add('speaking');btn.setAttribute('aria-pressed','true');
  const pack=currentPack();
  try{
    for(const w of pack.words){
      if(runId!==speechRunId || !isSpeakingAll) break;
      const keepGoing=await utter(`${w.word}. ${w.example}`,runId);
      if(!keepGoing) break;
    }
  }finally{
    if(runId===speechRunId) stopSpeech();
  }
}
async function init(){
  try{db=await fetch('data/words.json',{cache:'no-store'}).then(r=>r.json())}catch(e){
    document.body.innerHTML='<div style="padding:30px;font-family:sans-serif">无法读取词库。请通过本地服务器或部署后的网址打开，而不是直接双击 index.html。</div>';return;
  }
  db.packs.sort((a,b)=>a.date.localeCompare(b.date));
  const savedTheme=localStorage.getItem(themeKey);if(savedTheme==='dark')document.documentElement.classList.add('dark');
  $$('.tab').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#searchInput').oninput=()=>renderLibrary();$('#statusFilter').onchange=()=>renderLibrary();
  $('#themeBtn').onclick=()=>{document.documentElement.classList.toggle('dark');localStorage.setItem(themeKey,document.documentElement.classList.contains('dark')?'dark':'light')};
  $('#speakAllBtn').onclick=speakAll;
  $('#shuffleReviewBtn').onclick=()=>{
    reviewGroups.forEach(g=>g.words.sort(()=>Math.random()-.5));
    const box=$('#reviewList');box.innerHTML='';
    reviewGroups.forEach(group=>{
      const sec=document.createElement('section');sec.className='review-group';
      const mastered=group.words.filter(w=>wordStatus(w.id)==='mastered').length;
      sec.innerHTML=`<div class="review-group-head"><div><div class="review-kicker">${fmtShortDate(group.sourceDate)} 学习的词</div><h4>第 ${group.reviewNumber} 次复习</h4><p>原学习日：${fmtDate(group.sourceDate)} · 学习后 <strong>${group.interval}</strong> 天 · 本组 ${group.words.length} 词</p></div><div class="review-progress">${mastered}/${group.words.length} 已掌握</div></div>`;
      const list=document.createElement('div');list.className='word-list';group.words.forEach(w=>list.appendChild(createWordCard(w,group)));sec.appendChild(list);box.appendChild(sec);
    });
  };
  $('#resetBtn').onclick=()=>{if(confirm('确定要清空所有“掌握/模糊”记录吗？')){localStorage.removeItem(stateKey);renderAll()}};
  window.addEventListener('beforeunload',stopSpeech);
  renderAll();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}
init();
