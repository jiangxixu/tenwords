import fs from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const WORDS_URL = new URL('../data/words.json', import.meta.url);
const DAILY_DIR = new URL('../data/daily/', import.meta.url);
const INDEX_URL = new URL('../data/daily/index.json', import.meta.url);
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) throw new Error('Missing DEEPSEEK_API_KEY');

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const db = JSON.parse(await fs.readFile(WORDS_URL, 'utf8'));
const used = new Set(db.packs.flatMap(p => p.words.map(w => w.word.toLowerCase())));

const index = JSON.parse(await fs.readFile(INDEX_URL, 'utf8'));
if (index.dates.includes(today)) {
  console.log(`Pack ${today} already exists.`);
  process.exit(0);
}

const usedList = [...used].slice(-500).join(', ');

const prompt = `你正在维护一个计算机科学硕士生的英语学习网站。
请生成今天 ${today} 的10个新英语单词。

要求：
1. 通用高频英语为主。
2. 适当加入 AI、大模型、Agent、机器人、无人机、论文阅读词汇。
3. 不允许重复已有词：${usedList}
4. 每个词返回：word, ipa, meaning, collocation, scene, example, translation。
5. 返回严格 JSON：{"words":[...]}
6. 不要 markdown，不要解释。
`;

const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You output valid JSON only.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  })
});

if (!response.ok) throw new Error(await response.text());

const result = await response.json();
const parsed = JSON.parse(result.choices[0].message.content);

if (!Array.isArray(parsed.words) || parsed.words.length !== 10) {
  throw new Error('Invalid word count');
}

const words = parsed.words.map((w, i) => ({
  id: `${today}-${String(i + 1).padStart(2, '0')}`,
  word: w.word.trim(),
  ipa: w.ipa.trim(),
  meaning: w.meaning.trim(),
  collocation: w.collocation.trim(),
  scene: w.scene.trim(),
  example: w.example.trim(),
  translation: w.translation.trim()
}));

await fs.writeFile(
  new URL(`${today}.json`, DAILY_DIR),
  JSON.stringify({ date: today, words }, null, 2)
);

index.dates.push(today);
index.dates.sort();
await fs.writeFile(INDEX_URL, JSON.stringify(index, null, 2));

console.log(`Generated ${today}`);
