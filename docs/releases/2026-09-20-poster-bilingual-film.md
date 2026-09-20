# Huddle 官網、雙語及動畫更新

## 範圍

- 依使用者確認的黃色手繪海報重做公開官網，真實產品截圖使用合成示範內容。
- 中英文官網、服務條款、隱私、取消退款、支援與影片頁；英文 CTA 延續到英文登入，英文分享 metadata。
- 原稿角色施法整理便條紙、排程、重新安排、完成與專注動畫，1080p/30fps。依使用者回饋縮為 18 秒，重編 160 BPM 原創配樂，無第三方音樂或取樣。
- 網頁 OAuth callback 單一 PKCE 交換、錯誤及 20 秒逾時復原；桌面 0.1.1 已更新至本機 Applications。

## 驗證

- Production build、TypeScript、targeted ESLint、diff check 通過。
- 第一版整合回歸：影片 61、官網互動 46、Web OAuth 9，合計 116 項。
- 英文 CTA 語言和 OpenGraph 另驗證通過。
- 1440px/390px 中英文截圖；獨立設計 review 唯一 material finding（中文手機孤字）已修正，最終 verdict 通過。
- Detector 無 findings；方向契約 seed 58f78b58 保留於 production markup。

## 限制

Google 帳號實際授權與作業系統返回仍需使用者操作確認；測試為真實瀏覽器/SDK配合mock HTTP。商家法定名稱、地址、私人客服信箱、保存政策等尚待提供，不能宣稱金流送審完備。未啟用訂閱、未修改正式資料或資料庫。Mac beta 尚未公證、仍須網路；沒有 Windows 安裝檔。

## 發布證據

發布 commit、PR、Zeabur 與線上檢查結果另於本次交付確認；原始工作目錄的未提交修改不納入本次發布。
