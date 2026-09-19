# POD·LIST

搜尋 Apple Podcast → 把單集收進自己的播放清單 → 線上播放。純前端 PWA，手機可「加入主畫面」。

- 資料來源：iTunes Search API（`search`、`lookup?entity=podcastEpisode`，每節目取最新 200 集）
- 清單儲存：localStorage ＋ GitHub Contents API 同步（設定頁填 owner / repo / 分支 / 路徑 / token）
- Token：Fine-grained PAT，只勾本 repo、Contents: Read and write；只存在裝置瀏覽器，不進 repo
- 播放進度只存本機，不同步
- 改版記得把 `sw.js` 的 `CACHE` 版號 +1
