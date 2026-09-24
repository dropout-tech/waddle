# macOS 桌面標題列修正

PR56：https://github.com/dropout-tech/waddle/pull/56
正式 main：201ff7b6699f51de2b9eaafbe68b56fea72c504e
Zeabur deployment：6571193583，狀態 success。

macOS 已安裝桌面版在網頁頂端預留 48px 視窗控制區，調整可視高度與浮層位置。一般瀏覽器、Windows、手機與獨立彈窗不增加間距。既有桌面程式重新載入即可取得。

驗證：正式 build、獨立程式審查、Cursor Security、20 項本機排版測試、實際 Electron 主視窗與 popup 行為通過。正式站 https://waddle.zeabur.app 的 20 項模擬資料排版測試亦通過；測試攔截 Supabase，不操作真實資料。

這次發布未包含 PR55 的後端功能；其 Supabase 權限與外部服務設定仍待完成。
