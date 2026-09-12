import fs from 'node:fs/promises';

const DATA_URL = new URL('../data/words.json', import.meta.url);
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error('Missing OPENAI_API_KEY');

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const db = JSON.parse(await fs.readFile(DATA_URL, 'utf8'));
if (db.packs.some(p => p.date === today)) {
  console.log(`Pack for ${today} already exists. Skip.`);
  process.exit(0);
}

const used = new Set(db.packs.flatMap(p => p.words.map(w => w.word.toLowerCase())));
const usedList = [...used].sort().join(', ');

const prompt = `你正在为一名计算机科学硕士生维护“每日10词”英语学习网站。请为 ${today} 生成恰好10个新的英语单词。
要求：
1. 以通用高频英语为主，适当加入计算机、AI、论文阅读、机器人/无人机高频词。
2. 不能重复以下已经学过的词：${usedList}
3. 每个词必须包含：word, ipa, meaning, collocation, scene, example, translation。
4. meaning 用简洁中文；collocation 只给1个高频搭配；scene 用一句简短中文说明真实使用场景；example 必须自然、简短、适合朗读；translation 是例句中文翻译。
5. 不要使用生僻、过时或纯考试技巧型词汇。
6. 返回严格 JSON，不要 markdown，不要解释，格式：{"words":[{...}]}。`;

const res = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-5.6-luna',
    input: prompt,
    reasoning: { effort: 'low' },
    max_output_tokens: 4500
  })
});

if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
const out = await res.json();
const text = (out.output || [])
  .flatMap(item => item.content || [])
  .filter(c => c.type === 'output_text')
  .map(c => c.text)
  .join('\n')
  .trim();

const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
const parsed = JSON.parse(cleaned);
if (!Array.isArray(parsed.words) || parsed.words.length !== 10) throw new Error('Model did not return exactly 10 words.');

const localSeen = new Set();
const words = parsed.words.map((w, i) => {
  const word = String(w.word || '').trim();
  const key = word.toLowerCase();
  if (!word || used.has(key) || localSeen.has(key)) throw new Error(`Duplicate/invalid word: ${word}`);
  localSeen.add(key);
  for (const field of ['ipa','meaning','collocation','scene','example','translation']) {
    if (!String(w[field] || '').trim()) throw new Error(`Missing ${field} for ${word}`);
  }
  return {
    id: `${today}-${String(i+1).padStart(2,'0')}`,
    word,
    ipa: String(w.ipa).trim(),
    meaning: String(w.meaning).trim(),
    collocation: String(w.collocation).trim(),
    scene: String(w.scene).trim(),
    example: String(w.example).trim(),
    translation: String(w.translation).trim()
  };
});

db.reviewIntervals = db.reviewIntervals || [1, 3, 7, 14, 30];
db.packs.push({ date: today, words });
db.packs.sort((a,b) => a.date.localeCompare(b.date));
await fs.writeFile(DATA_URL, JSON.stringify(db, null, 2) + '\n', 'utf8');
console.log(`Added ${today}: ${words.map(w => w.word).join(', ')}`);
