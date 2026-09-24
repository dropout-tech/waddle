# 桌面浮動視窗與提醒發布

PR57：https://github.com/dropout-tech/waddle/pull/57
正式 main：74c7b61031259d47547382aeb5b9fb805dec02e8
Zeabur deployment：6571892920，2026-09-21 15:27:00 UTC success；稍後確認正式 floating-host.html 與新版頁面完成切換。
桌面版本：https://github.com/dropout-tech/waddle/releases/tag/v0.1.2-beta.1

修正浮動視窗開啟、三分頁、收回、重複點擊及重载清理。新版桌面殼保持置頂，舊殼更新網頁後可開一般浮窗。新增預設關閉的會議／專注／喝水系統通知，主視窗來源限制、帳號切換保護與限流；一般設定提供開關和測試。

驗證：正式 build、16 項 desktop mock tests、22 項隔離 Electron 浮窗測試、7 項完整產品介面測試通過。正式 https://waddle.zeabur.app 亦通過 7 項浮窗三分頁／收回／通知設定測試，所有帳號 API 和 OS 通知均為 mock，不操作真實使用者資料。官網下載連結確認指向 v0.1.2-beta.1。兩種 DMG 的 GitHub asset SHA256 與本機一致，內含程式版本與功能也經確認。

限制：Mac installer 尚未完成正式簽署／公證與 OS 通知顯示實测；Windows 未提供安裝檔。退出或關閉視窗無提醒；恢復的舊專注計時不發桌面通知。完整界線見 docs/native/desktop-notifications.md。

iPhone／Android 五項小工具本次只完成規劃，非已上線原生功能。Google 登入品牌仍需有權限的 Cloud 專案帳號與品牌驗證；PR55 後端整合仍受 Supabase 權限／外部設定限制。
