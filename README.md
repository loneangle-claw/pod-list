# POD·LIST

搜尋 Apple Podcast → 把單集收進自己的播放清單 → 線上播放。純前端 PWA，手機可「加入主畫面」。

- 資料來源：iTunes Search API（`search`、`lookup?entity=podcastEpisode`，每節目取最新 200 集）
- 清單儲存：localStorage ＋ GitHub Contents API 同步（設定頁填 owner / repo / 分支 / 路徑 / token）
- Token：Fine-grained PAT，只勾 private repo `pod-list-data`、Contents: Read and write；只存在裝置瀏覽器，不進 repo
- 播放進度只存本機，不同步
- 改版記得把 `sw.js` 的 `CACHE` 版號 +1

## 部署

- **GitHub Pages**（目前上線中）：https://loneangle-claw.github.io/pod-list/ ，push 到 `main` 即自動更新
- **Cloudflare Workers**（備用，設定已備好）：Cloudflare 後台 → Workers & Pages → Create → Import a repository → 選這個 repo，之後 push 一樣自動部署到 `https://pod-list.fbiericlin.workers.dev/`
  - `wrangler.jsonc` 走純靜態資產（沒有後端，清單同步是前端直接打 GitHub API），只上傳 8 個網站檔，其餘由 `.assetsignore` 排除
  - `not_found_handling` 刻意設 `none`：本站沒有前端路由，漏檔要誠實回 404，否則會拿到 200 + index.html 被 `sw.js` 的 network-first 寫進快取
  - index.html／manifest／sw.js 全用相對路徑，所以 Pages 子路徑與 Workers 根目錄都能跑
  - 本機驗證設定：`npx wrangler deploy --dry-run`

## 操作

- 節目頁「＋ 全部 N」：把目前列出的單集（有篩選就只加篩選後的）一次加進某個清單，重複的自動略過
- 清單頁「清空」：只清單集，清單本身留著
- 單集右邊 ＋ 變 ✓ 代表已在某個清單裡（長按/游標可看在哪幾個清單）；同一清單絕不重複加入
- 版本：index.html 以 `?v=N` 引用 app.js/style.css，改版時 index.html、sw.js 的 SHELL、app.js 的 BUILD 要一起改號，避免 GitHub Pages 的 max-age=600 讓 HTML 與 JS 版本錯開
- 手機鎖縮放：viewport `user-scalable=no`＋`touch-action:manipulation`＋擋 iOS `gesture*` 事件；表單一律 16px（iOS 低於 16px 聚焦時會自動放大整頁）
- 外觀三主題（設定頁切換，存 localStorage `podlist.theme`）：玻璃／POP／黑膠。皮膚全在 style.css 的 `[data-theme=…]` 區塊，token 為「底色／前景」成對制；圖示是 app.js 的 `IC` 常數（SVG），不用 emoji
- 動態：播放畫面展開／收合（迷你列封面飛到大封面）、切歌封面滑出滑入，全用 WAAPI 可中斷；黑膠主題播放中唱片會轉；系統開「減少動態效果」時全部停用。播放畫面可往下滑收合
- ⚠️ 手機版面別用 `vh` 算尺寸：iOS Safari 的 `vh` 是網址列收起時的高度，實際可視區較矮會溢出。封面大小用容器查詢單位 `cqw/cqh`，全螢幕層用 `100dvh`
- 時間排序：節目頁的「新→舊／舊→新」只影響顯示（偏好存 localStorage `podlist.sort`），同時決定「＋全部」與播放順序；清單頁的「依時間排序」會重排並存檔（清單本來就有手動順序）
- 換首：封面是三格一列（上一集／目前／下一集），換首＝整列滑一格並輪轉三個節點的角色，當下不載圖；封面可左右拖換首。`app.js` 的 `GAP` 要與 `style.css` 的 `.cover{--gap}` 一致
- 排除詞：節目頁每個節目各記一組（`data.excludes[節目id]`，跟清單一起同步），標題含任一詞即隱藏，也不進「＋全部」與播放順序；多個詞用逗號分開，不用空白分（英文片名有空白）
