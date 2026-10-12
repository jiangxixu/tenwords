import fs from 'node:fs/promises';

const WORDS_URL = new URL('../data/words.json', import.meta.url);
const DAILY_DIR = new URL('../data/daily/', import.meta.url);
const INDEX_URL = new URL('../data/daily/index.json', import.meta.url);
const API_KEY = process.env.DEEPSEEK_API_KEY;

if (!API_KEY) throw new Error('Missing DEEPSEEK_API_KEY');

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const db = JSON.parse(await fs.readFile(WORDS_URL, 'utf8'));
const index = JSON.parse(await fs.readFile(INDEX_URL, 'utf8'));

const dailyFiles = await fs.readdir(DAILY_DIR);
const dailyWords = [];
for (const file of dailyFiles.filter(f => f.endsWith('.json'))) {
  try {
    const data = JSON.parse(await fs.readFile(new URL(file, DAILY_DIR), 'utf8'));
    if (Array.isArray(data.words)) dailyWords.push(...data.words);
  } catch {}
}

const used = new Set([
  ...db.packs.flatMap(p => p.words.map(w => w.word.toLowerCase())),
  ...dailyWords.map(w => w.word.toLowerCase())
]);

if (index.dates.includes(today)) process.exit(0);

const prompt = `你正在维护一个计算机科学硕士生的英语学习网站。
生成今天 ${today} 的10个英语单词。

固定格式要求：
每个单词必须包含：
word
ipa
meaning
collocation
scene
example
translation

要求：
1. 通用高频词为主，加入 AI、大模型、Agent、机器人、无人机、论文阅读相关词汇。
2. 不允许重复已有词：${[...used].slice(-1000).join(', ')}
3. 只返回 JSON：{"words":[...]}
4. 不要 markdown，不要解释。
`;

const response = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You output valid JSON only.' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.5
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
  word: String(w.word).trim(),
  ipa: String(w.ipa).trim(),
  meaning: String(w.meaning).trim(),
  collocation: String(w.collocation).trim(),
  scene: String(w.scene).trim(),
  example: String(w.example).trim(),
  translation: String(w.translation).trim()
}));

await fs.writeFile(
  new URL(`${today}.json`, DAILY_DIR),
  JSON.stringify({ date: today, words }, null, 2)
);

index.dates.push(today);
index.dates.sort();
await fs.writeFile(INDEX_URL, JSON.stringify(index, null, 2));

console.log(`Generated ${today}`);
