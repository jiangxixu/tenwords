import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const ROOT=new URL('../',import.meta.url);
const DAILY_DIR=new URL('data/daily/',ROOT);
const INDEX_URL=new URL('index.json',DAILY_DIR);
export const normalizeWord=w=>w.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const fields=['word','ipa','meaning','collocation','scene','example','translation'];
export function validateWords(words,used=new Set()){
  if(!Array.isArray(words)||words.length!==10) throw Error('Expected exactly 10 words');
  const seen=new Set(used);
  for(const w of words){
    for(const key of fields) if(typeof w[key]!=='string'||!w[key].trim()||/\[object Object\]|^undefined$|^null$/.test(w[key])) throw Error(`Invalid ${key}`);
    const word=normalizeWord(w.word);
    if(seen.has(word)) throw Error(`Duplicate word: ${word}`);
    seen.add(word);
    for(const key of ['meaning','scene','translation']) if(!/[\u3400-\u9fff]/.test(w[key])) throw Error(`${key} must be Chinese`);
    if(!/[a-zA-Z]/.test(w.example)||/[\u3400-\u9fff]/.test(w.example)) throw Error('Example must be English');
    if(!/^\/[^/]+\/$/.test(w.ipa.trim())) throw Error('IPA must use /.../');
    if(w.translation.trim()===w.meaning.trim()) throw Error('Translation must translate the sentence');
  }
  return words;
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
  if(existing){validateWords(existing.words,used);await saveIndex();console.log(`${today} already exists; index repaired`);return}
  const apiKey=process.env.DEEPSEEK_API_KEY;
  if(!apiKey) throw Error('Missing DEEPSEEK_API_KEY');
  const prompt=`为计算机科学硕士生生成 ${today} 的10个英语单词，通用高频词为主，兼顾AI、Agent、机器人、无人机和论文阅读。\n只返回 {"words":[...]} JSON，每个词严格使用以下模板，所有字段都必须是字符串：\n{"word":"diagnose","ipa":"/ˈdaɪəɡnəʊz/","meaning":"诊断；查明原因","collocation":"diagnose a problem","scene":"工程调试：分析日志，查明系统故障原因","example":"Engineers diagnose the problem by checking the logs.","translation":"工程师通过检查日志来查明问题。"}\nmeaning 必须是简短中文释义；scene 必须是中文场景说明；example 必须是完整英文例句；translation 必须是该例句的完整中文翻译，不能写单词释义。不要输出数组、对象、Markdown或额外字段。必须10个不同词，严格禁止以下全部历史词（忽略大小写）：${[...used].join(', ')}`;
  let words,lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch('https://api.deepseek.com/chat/completions',{
        method:'POST',signal:AbortSignal.timeout(120000),
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:'deepseek-chat',messages:[{role:'system',content:'Output valid JSON only. Follow the exact bilingual field schema.'},{role:'user',content:prompt+(lastError?`\n上一次失败：${lastError.message}。请重新生成合规且不重复的10词。`:'')}],response_format:{type:'json_object'},temperature:0.5,max_tokens:6000})
      });
      if(!response.ok) throw Error(`DeepSeek HTTP ${response.status}`);
      const result=await response.json();
      words=validateWords(JSON.parse(result.choices[0].message.content).words,used);break;
    }catch(error){lastError=error;console.warn(`Attempt ${attempt+1}: ${error.message}`)}
  }
  if(!words) throw lastError;
  words=words.map((w,i)=>Object.fromEntries([['id',`${today}-${String(i+1).padStart(2,'0')}`],...fields.map(k=>[k,w[k].trim()])]));
  const temp=new URL(`${today}.json.tmp`,DAILY_DIR);
  await fs.writeFile(temp,JSON.stringify({date:today,words},null,2)+'\n');
  await fs.rename(temp,target);await saveIndex();console.log(`Generated ${today}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
