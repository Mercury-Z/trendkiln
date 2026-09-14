# Trendkiln（复刻版）

对 <https://trendkiln.pages.dev/> 的完整复刻：一个「每天十分钟，扫完 AI 编程该看什么」的
信息聚合仪表盘，包含今日摘要、GitHub 热度榜、模型能力榜、资讯时间线、我的关注与设置六个页面。

原站是 Nuxt 3（Tailwind v3 + `@nuxtjs/i18n`，`no_prefix` 策略，默认中文）SSR 应用。
本项目沿用同一套技术栈重写，并额外支持**纯静态产物**，因此可以部署在任意免费静态托管上
（当前部署在 GitHub Pages）。

- 线上地址：<https://mercury-z.github.io/trendkiln/>
- 原站：<https://trendkiln.pages.dev/>

---

## 还原度

复刻的判定标准是**服务端渲染出的 DOM 子树 `#__nuxt` 是否与原站逐字节一致**，
比对脚本见 `_tools/compare-live.mjs`（同时抓取原站与本地 SSR，规范化空白后按标签/文本 token 求交）。

| 路由 | 结果 |
| --- | --- |
| `/` | 完全一致 |
| `/github` | 完全一致 |
| `/github?window=weekly` | 完全一致 |
| `/github?window=monthly` | 完全一致 |
| `/github?layout=list` | 完全一致 |
| `/models` | 完全一致 |
| `/models?kind=coding_index` | 完全一致 |
| `/models?kind=coding_cost` | 完全一致 |
| `/models?kind=text_to_image` | 完全一致 |
| `/models?kind=image_to_video` | 完全一致 |
| `/feed` | 完全一致 |
| `/feed?filter=unread` | 完全一致 |
| `/feed?filter=saved` | 完全一致 |
| `/watchlist` | 完全一致 |
| `/settings` | 完全一致 |

**15 / 15 条路由的 `#__nuxt` 子树 token 级 100% 一致。**

交互行为另用无头浏览器（CDP）验证，见 `_tools/smoke.mjs`：**37 / 37 项通过，无控制台报错**。

```bash
npm run dev                                   # 终端 A
node _tools/compare-live.mjs http://localhost:3000   # 终端 B：对比全站还原度
node _tools/smoke.mjs        http://localhost:3000   # 终端 B：交互冒烟
```

---

## 数据来源

原站的数据来自其服务端数据库（响应体里 `source: "db"`），由一条采集管线产出：
每条记录都带 `snapshot_at` 时间戳，`stars_delta` / `rank_delta` 是相对上一份快照的增量。

复刻版把这份数据**原样固化为静态 fixture**（`demo/*.json`，直接取自原站公开的 `/api/*` 接口），因此：

- 页面内容与原站完全一致（含 80 条资讯、19/23/17 条天/周/月榜、5 个模型分榜共 106 条记录）；
- 站点不再依赖任何后端，可以纯静态部署；
- `server/api/*` 仍然实现同一套 HTTP 契约，方便本地以 SSR 模式运行或接入真实数据源。

### 内容是真实的，但它是「某一时刻」的

这些快照对应的是**真实世界的数据**，可以逐条核实：

| 项目 | 快照值（2026-09-14T05:54Z） | 稍后抽样核对 |
| --- | --- | --- |
| `JustVugg/colibri` | ★ 30,296 | 真实 30,566 |
| `huggingface/transformers` | ★ 165,659 | 真实 165,719 |
| `bilawalsidhu/gods-eye-view` | ★ 32,344 | 真实 32,554 |

模型榜条目（Claude Fable 5.1 / GPT-6 Astra / Claude Opus 5 / Kimi K3 / GLM-5.3 等）
同样能在 Artificial Analysis 公开榜上查到。原站设置页的 `演示数据` 徽标与 `source: "db"`
描述的是它自己的演示部署形态，**并不代表内容是被编造的**。

因此复刻站的问题是**时效性**而非真实性：它是采集时刻的**冻结快照**，
没有任何爬虫或定时任务，站点内容不会随时间变化。
`_tools/check-reality.mjs` 可以随时把快照与 GitHub / Artificial Analysis 现况做对比，
`_tools/check-drift.mjs` 则用来确认快照与原站当前接口是否已经产生偏差。

---

## 技术栈与结构

```
nuxt.config.ts          Nuxt 3 + Tailwind + i18n（baseURL 可由 NUXT_APP_BASE_URL 注入）
tailwind.config.ts      与原站一致的 Tailwind 配置
assets/css/main.css     设计系统：原站编译后样式中抽取的全部自定义类
i18n/locales/*.json     中英词条（zh 取自原站渲染结果，en 为等价翻译）
layouts/default.vue     顶栏 / 导航 / 语言切换 / 页脚
components/             PageHeader · MockBadge · ModelsBarChart · DarkSelect
pages/                  index · github · models · feed · watchlist · settings
composables/            数据访问、关注列表、偏好、i18n 取值、组织色板
demo/                   固化的 fixture 与查询函数
server/api/             digest · github · models · feed · watchlist · item-state
_tools/                 还原度比对 / 冒烟测试 / 静态服务器等验证脚本
```

设计系统的还原是逐条对齐的：配色（zinc + violet 强调色、径向渐变背景）、
`.card` / `.badge-*` / `.tag*` / `.btn-*` / `.data-table` / `.aa-*` 等全部自定义类、
图表几何（`viewBox 0 0 960 380`、柱宽钳制 18–56px、38° 斜标签、tooltip 定位算法）
都按原站实现。

---

## 本地开发与构建

```bash
npm install

npm run dev        # SSR 开发模式，默认 http://localhost:3000

# 纯静态产物（部署用）
npm run generate
# 部署到项目页（子路径）时注入 base：
NUXT_APP_BASE_URL=/trendkiln/ npm run generate

# 本地预览静态产物（模拟 GitHub Pages 的目录索引 / 404 行为）
node _tools/serve-static.mjs 4173 .output/public /
node _tools/serve-static.mjs 4175 .output/public /trendkiln/
```

---

## 部署

站点以 GitHub Pages 免费托管。`.output/public` 是完整产物（含 `.nojekyll`），
推送到 `gh-pages` 分支即可；仓库 Pages 源设置为该分支根目录。

`npm run generate` 默认 `baseURL=/`；部署到项目页时用环境变量注入子路径
（本仓库线上使用 `/trendkiln/`），脚本会同步前缀化资源、导航链接与组织 logo。

```bash
# 一键发布（构建产物 -> gh-pages 分支，不污染工作区）
NUXT_APP_BASE_URL=/trendkiln/ npm run generate
node _tools/deploy-gh-pages.mjs /trendkiln/ origin
```

`_tools/deploy-gh-pages.mjs` 会在临时目录里提交并强推 `gh-pages`，
并在推送前校验产物确实是用对应 base 构建的（避免推错前缀把线上资源打挂）。

### 旧部署已归档为跳转

仓库早期的另一版实现 `trendkiln-clone` 是手写原生 JS 静态站（自有 CSS、客户端渲染，
与原站 DOM 结构不一致），现已退役：

- 线上 <https://mercury-z.github.io/trendkiln-clone/> 只保留静态跳转页，
  `/`、`/github/`、`/models/`、`/feed/`、`/watchlist/`、`/settings/`
  分别跳转到新站点的对应页面，404 兜底会把其余深层链接映射到最接近的页面；
- 旧实现代码与其历史完整保留在该仓库的 `legacy` 分支；
- 旧的每日 `update.yml` 工作流已移除，不会再产生提交。

迁移脚本：`_tools/retire-old-clone.mjs`；跳转验证：`_tools/verify-redirect.mjs`
（真实浏览器，7/7 通过）。

---

## 与原站的已知差异

复刻以「服务端渲染的 DOM 完全一致」为目标并已达成，以下差异是有意为之或平台所限：

1. **语言切换可用**。原站顶栏的 English 按钮**是坏的**——点击后界面仍为中文
   （其 i18n 词条分包在客户端未能加载）。复刻版实现了原站未能工作的切换，
   这是唯一的主动功能增强；中英词条见 `i18n/locales/`。
2. **样式以外部 CSS 引入**。原站把约 41 KB 的 Tailwind 产物内联在 `<head>`，
   复刻版由 Nuxt 输出为外链 CSS，因此 HTML 体积更小、首屏仍为同一套样式。
3. **项目页子路径**。线上部署在 `/trendkiln/` 前缀下，故页面内链接带该前缀
   （原站位于根路径）。若迁到自定义域名根路径，直接以 `baseURL=/` 重新构建即可。
4. **`<head>` 中显式声明 favicon**。原站依赖浏览器的隐式 `/favicon.ico` 查找，
   子路径部署下会 404，故改为显式 `<link rel="icon">`。
5. **交互状态持久化在浏览器**。原站把「已读 / 稍后读 / 关注列表」写入服务端数据库，
   静态部署没有后端，这部分改为 `localStorage`（键名与原站一致：
   `ai-radar:item-state`、`ai-radar:watchlist`、`ai-radar:digest-count`、
   `ai-radar:github-layout`）。因此改动只对当前浏览器可见。
6. **查询参数变体在静态托管下首帧为默认视图**。`/models?kind=…`、`/github?window=…`
   等预渲染页面的 payload 不含 query，路由在水合后才同步真实 URL，随后自动切换到正确视图
   （已由冒烟测试覆盖）。以 SSR 运行时部署则不存在该首帧。

---

## 许可

仅供学习与演示用途。页面结构、设计系统与演示数据均来自
[trendkiln.pages.dev](https://trendkiln.pages.dev/)；原始内容的权利归其作者所有。
