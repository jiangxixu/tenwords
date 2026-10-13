import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const ROOT=new URL('../',import.meta.url);
const DAILY_DIR=new URL('data/daily/',ROOT);
const INDEX_URL=new URL('index.json',DAILY_DIR);
export const normalizeWord=w=>w.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const fields=['word','ipa','meaning','collocation','scene','example','translation'];
export function validateWord(w){
  if(!w||typeof w!=='object') throw Error('Invalid word object');
  for(const key of fields) if(typeof w[key]!=='string'||!w[key].trim()||/\[object Object\]|^undefined$|^null$/.test(w[key])) throw Error(`Invalid ${key}`);
  for(const key of ['meaning','scene','translation']) if(!/[\u3400-\u9fff]/.test(w[key])) throw Error(`${key} must be Chinese`);
  if(!/[a-zA-Z]/.test(w.example)||/[\u3400-\u9fff]/.test(w.example)) throw Error('Example must be English');
  if(!/^\/[^/]+\/$/.test(w.ipa.trim())) throw Error('IPA must use /.../');
  if(w.translation.trim()===w.meaning.trim()) throw Error('Translation must translate the sentence');
  return Object.fromEntries(fields.map(key=>[key,w[key].trim()]));
}
export function validateWords(words,used=new Set()){
  if(!Array.isArray(words)||words.length!==10) throw Error('Expected exactly 10 words');
  const seen=new Set(used);
  for(const w of words){validateWord(w);const word=normalizeWord(w.word);if(seen.has(word))throw Error(`Duplicate word: ${word}`);seen.add(word)}
  return words;
}
export async function collectWords({used,requestWords,fallback,maxAttempts=4}){
  const accepted=[],seen=new Set(used);let fromFallback=0;
  for(let attempt=0;attempt<maxAttempts && accepted.length<10;attempt++){
    try{
      const candidates=await requestWords({count:10-accepted.length,excluded:[...seen],attempt});
      if(!Array.isArray(candidates)) throw Error('Missing words array');
      for(const candidate of candidates){
        try{const word=validateWord(candidate),key=normalizeWord(word.word);if(seen.has(key)){console.warn(`Skipped duplicate: ${key}`);continue}seen.add(key);accepted.push(word);if(accepted.length===10)break}catch(e){console.warn(`Skipped invalid candidate: ${e.message}`)}
      }
    }catch(error){console.warn(`Attempt ${attempt+1}: ${error.message}`)}
    console.log(`Accepted ${accepted.length}/10 after attempt ${attempt+1}`);
  }
  for(const candidate of fallback){
    if(accepted.length===10)break;
    const word=validateWord(candidate),key=normalizeWord(word.word);
    if(seen.has(key))continue;
    accepted.push(word);seen.add(key);fromFallback++;
  }
  validateWords(accepted,used);
  return {words:accepted,fromFallback};
}
async function saveIndex(){
  const dates=(await fs.readdir(DAILY_DIR)).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f=>f.slice(0,-5)).sort();
  await fs.writeFile(INDEX_URL,JSON.stringify({dates},null,2)+'\n');
}
export async function main(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const date=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const today=`${date.year}-${date.month}-${date.day}`;
  const target=new URL(`${today}.json`,DAILY_DIR);
  const db=JSON.parse(await fs.readFile(new URL('data/words.json',ROOT),'utf8'));
  const used=new Set((db.packs||[]).flatMap(p=>p.words).map(w=>normalizeWord(w.word)));
  let existing;
  for(const file of (await fs.readdir(DAILY_DIR)).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f))){
    const pack=JSON.parse(await fs.readFile(new URL(file,DAILY_DIR),'utf8'));
    if(!Array.isArray(pack.words)) throw Error(`Invalid historical pack: ${file}`);
    if(pack.date===today){existing=pack;continue}
    for(const w of pack.words) used.add(normalizeWord(w.word));
  }
  if(existing){validateWords(existing.words);await saveIndex();console.log(`${today} already exists; index repaired`);return}
  const apiKey=process.env.DEEPSEEK_API_KEY;
  const fallback=JSON.parse(await fs.readFile(new URL('scripts/fallback-words.json',ROOT),'utf8')).map(row=>Object.fromEntries(fields.map((key,i)=>[key,row[i]])));
  const {words:accepted,fromFallback}=await collectWords({used,fallback,requestWords:async({count,excluded})=>{
    if(!apiKey)throw Error('Missing DEEPSEEK_API_KEY; using reserve');
    const prompt=`为计算机科学硕士生生成 ${today} 的 ${count} 个全新英语单词。通用高频词为主，兼顾AI、机器人和论文阅读。只返回 {"words":[...]} JSON，所有字段必须是字符串。模板：{"word":"diagnose","ipa":"/ˈdaɪəɡnəʊz/","meaning":"诊断；查明原因","collocation":"diagnose a problem","scene":"工程调试：通过日志查明故障原因","example":"Engineers diagnose the problem by checking the logs.","translation":"工程师通过检查日志来查明问题。"}。meaning为简短中文释义，scene为中文场景，example为英文完整例句，translation为该例句的完整中文翻译。仅生成缺少的 ${count} 个词，不要重复已接收的词。严格禁止以下全部单词：${excluded.join(', ')}`;
    const response=await fetch('https://api.deepseek.com/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(90000),
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'deepseek-chat',messages:[{role:'system',content:'Return valid JSON with the exact bilingual word schema. Exclude every listed word.'},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0.7,max_tokens:6000})
    });
    if(!response.ok)throw Error(`DeepSeek HTTP ${response.status}`);
    const result=await response.json();
    return JSON.parse(result.choices[0].message.content).words;
  }});
  let words=accepted;
  words=words.map((w,i)=>Object.fromEntries([['id',`${today}-${String(i+1).padStart(2,'0')}`],...fields.map(k=>[k,w[k].trim()])]));
  const temp=new URL(`${today}.json.tmp`,DAILY_DIR);
  await fs.writeFile(temp,JSON.stringify({date:today,words,generation:{source:fromFallback===10?'reserve':fromFallback?'mixed':'deepseek',reserveWords:fromFallback}},null,2)+'\n');
  await fs.rename(temp,target);await saveIndex();console.log(`Generated ${today}; reserve words: ${fromFallback}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
