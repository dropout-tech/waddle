# 桌面系統通知

2026-09-21 實作：Electron 主行程提供會議、喝水、專注完成通知。一般設定的「桌面系統通知」預設關閉；手動开启後仍尊重既有會議提前時間及喝水開關。專注只在自然完成時通知，靜音設定不發通知聲。點通知只開啟 Huddle，不由通知開啟外部網址。

視窗開啟／最小化期間檢查；關閉視窗、完全退出、睡眠期間不保證通知。恢復後會議僅在尚未開始時提醒。桌面主視窗停用 background throttling，以保留背景輪詢與計時；不是常駐服務。

安全界線：IPC 限主視窗主 frame 同來源；限制種類、文字長度、重複 ID 及突發數量。預設不啟用，未登入不發送；換帳號／登出清除仍持有的原生通知。專注正文不含任務名稱。為防先前帳號持久化計時器跨帳號洩露，專注通知僅接受目前認證載入後開始的計時；**重新載入 App 後恢復的旧計時仍可在 App 完成，但不發此桌面通知**。待計時資料有完整帳號歸屬後再放寬。

系統能力可查但 OS 實際通知權限無法由目前 bridge 判定；設定文字及測試結果只說已交給系統，不保證已顯示。系統勿擾／專注模式、關閉通知均可能攔截。macOS 通知需使用適當簽署的發行版本；目前 unsigned beta 未完成真機 OS 通知驗證，不能宣稱該安裝包已通過。Windows 已設定 AppUserModelId，但尚未驗證 Windows 安裝與通知。

參考：[Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)。

驗證：`node --test desktop/*.test.cjs` 15 項通過；`pnpm exec tsc --noEmit` 通過。測試使用假的 Notification／IPC，不發送真實系統通知，不操作真實使用者資料。
