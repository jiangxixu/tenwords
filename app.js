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
const fmtDate=d=>{
  const date=new Date(d+'T12:00:00');
  return `${date.getMonth()+1}.${date.getDate()}`;
};
const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
