# 官網與影片正式發布驗證

PR54：https://github.com/dropout-tech/waddle/pull/54
正式main SHA：1a50f3a2db0bd053040abefcf2959c4c3525cd68
Zeabur deployment：6556365786，2026-09-20 18:47:09 UTC 成功（台北9/21 02:47）。實際新素材約18:48:38 UTC可讀取。

發布範圍：字幕安全區、活潑企鵝、中英文各自成片與圖片、三項關鍵功能文案。沒有部署新的會員／推薦／Google同步／約交集後端。

https://waddle.zeabur.app/about 與 /en/about 已完成互動驗收：影片61項、官網46項，合計107項通過。中英文MP4及三張英文產品截圖的SHA256與發布版本一致。線上互動檢查明確等待React hydration；最初只等待DOM的鍵盤測試曾遇未hydrated狀態，不把該次失敗當成通過。

Cursor安全檢查通過。非正式供應商Vercel的預覽檢查失敗，現有帳號沒有對應team日志權限，原因未確認；未變動Vercel設定。實際正式供應商Zeabur及站上版本均另行驗證。
