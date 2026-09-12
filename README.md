# TenWords · 每日 10 词

一个为“每天高效学习 10 个英语单词”设计的轻量 PWA 网站。

## 已有功能

- 今日 10 词：单词、音标、中文释义、搭配、英文例句和中文翻译
- 英语 TTS：朗读单词、例句、连续朗读当天 10 词；连续朗读期间可随时点击“停止朗读”
- 学习状态：`模糊` / `掌握`，保存在浏览器本地
- 复习页：按 1 / 3 / 7 / 14 / 30 天间隔分组；每组明确标注原学习日期、第几次复习、学习后第几天
- 历史页：按日期查看以前学过的词
- 全部词库：支持中英文、搭配、例句搜索与状态筛选
- PWA：部署到 HTTPS 后可以“添加到手机桌面”
- 自动每日更新：GitHub Actions 每天北京时间 08:00 调用 OpenAI API 生成 10 个新词

当前已内置 2026-08-14 至 2026-09-12 的全部历史学习记录：30 组、300 条记录，共 208 个不同单词。重复出现过的词保留各自日期记录，用于保持完整学习轨迹。


## 间隔复习规则

网站按固定时间点安排复习：

- 第 1 次：学习后 1 天
- 第 2 次：学习后 3 天
- 第 3 次：学习后 7 天
- 第 4 次：学习后 14 天
- 第 5 次：学习后 30 天

“复习”页不会把不同日期的词混在一起，而是按原学习日期分组。例如：`9 月 11 日学习的词 · 第 1 次复习 · 学习后 1 天`。

## 本地预览

不要直接双击 `index.html`，因为浏览器通常不允许本地 HTML 直接读取 JSON。

在项目目录运行：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 推荐部署：GitHub Pages

1. 在 GitHub 创建一个新仓库，例如 `tenwords`。
2. 把本项目所有文件上传到仓库根目录。
3. 仓库进入 `Settings -> Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/ (root)`，保存。
6. 等待 GitHub Pages 生成你的网址。

之后手机打开该网址，可以通过浏览器菜单选择“添加到主屏幕”。

## 开启每天 08:00 自动生成 10 个新词

项目已经包含：

```text
.github/workflows/daily-words.yml
scripts/generate-daily.mjs
```

你只需要给 GitHub 仓库添加 OpenAI API Key：

1. 进入仓库 `Settings`。
2. 打开 `Secrets and variables -> Actions`。
3. 点击 `New repository secret`。
4. 名称填写：`OPENAI_API_KEY`
5. Value 填写你的 OpenAI API Key。
6. 保存。

GitHub Actions 会每天 `00:00 UTC` 运行，即北京时间 `08:00`。

脚本使用 `gpt-5.6-luna` 生成每日词包，主要原因是这个任务内容简单、固定且每天只生成 10 个词，更适合使用低成本模型。

> API Key 只存放在 GitHub Secret 中，不要写进网页、JavaScript 或公开仓库。

## 手动测试自动生成

GitHub 仓库进入：

`Actions -> Generate daily 10 words -> Run workflow`

如果当天已经存在词包，脚本会自动跳过，避免重复生成。

## 数据格式

每日词包都保存在：

```text
data/words.json
```

每个单词结构：

```json
{
  "word": "retrieve",
  "ipa": "/rɪˈtriːv/",
  "meaning": "检索；取回",
  "collocation": "retrieve documents",
  "scene": "RAG 检索知识库中的相关文档",
  "example": "The system retrieves relevant documents.",
  "translation": "系统检索相关文档。"
}
```

## 一个重要限制

当前“掌握 / 模糊”记录使用浏览器 `localStorage`，因此：

- 同一台手机、同一个浏览器会一直保留；
- 换手机或清除浏览器数据会丢失；
- 第一版没有账号和云端同步。

如果之后需要多设备同步，可以把学习记录接入 Supabase / Firebase，而每日词库仍然可以沿用当前设计。
# tenwords
