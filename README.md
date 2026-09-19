# POD·LIST

搜尋 Apple Podcast → 把單集收進自己的播放清單 → 線上播放。純前端 PWA，手機可「加入主畫面」。

- 資料來源：iTunes Search API（`search`、`lookup?entity=podcastEpisode`，每節目取最新 200 集）
- 清單儲存：localStorage ＋ GitHub Contents API 同步（設定頁填 owner / repo / 分支 / 路徑 / token）
- Token：Fine-grained PAT，只勾 private repo `pod-list-data`、Contents: Read and write；只存在裝置瀏覽器，不進 repo
- 播放進度只存本機，不同步
- 改版記得把 `sw.js` 的 `CACHE` 版號 +1

## 操作

- 節目頁「＋ 全部 N」：把目前列出的單集（有篩選就只加篩選後的）一次加進某個清單，重複的自動略過
- 清單頁「清空」：只清單集，清單本身留著
- 單集右邊 ＋ 變 ✓ 代表已在某個清單裡（長按/游標可看在哪幾個清單）；同一清單絕不重複加入
- 版本：index.html 以 `?v=N` 引用 app.js/style.css，改版時 index.html、sw.js 的 SHELL、app.js 的 BUILD 要一起改號，避免 GitHub Pages 的 max-age=600 讓 HTML 與 JS 版本錯開
- 手機鎖縮放：viewport `user-scalable=no`＋`touch-action:manipulation`＋擋 iOS `gesture*` 事件；表單一律 16px（iOS 低於 16px 聚焦時會自動放大整頁）
