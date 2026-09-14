const pairs = [
  ["digest", "/api/digest?limit=10"],
  ["github-daily", "/api/github?window=daily"],
  ["models-intelligence", "/api/models?kind=intelligence&limit=40"],
  ["feed-all", "/api/feed?filter=all"],
]
import { readFileSync } from "node:fs"
for (const [name, path] of pairs) {
  const mine = readFileSync(`E:/复刻钟政ds41f/_recon/api/${name}.json`, "utf8")
  const live = await (await fetch("https://trendkiln.pages.dev" + path)).text()
  const a = JSON.stringify(JSON.parse(mine)), b = JSON.stringify(JSON.parse(live))
  console.log(`${name.padEnd(22)} identical=${a === b}  myLen=${a.length} liveLen=${b.length}`)
}
