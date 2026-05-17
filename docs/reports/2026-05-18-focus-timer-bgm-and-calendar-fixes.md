# 專注計時器加入背景音樂 + 環境音，並修兩個日曆 bug

# Description

使用者反映三件事，一起處理：

1. **新功能**：專注記時想要 3–4 種背景音樂可選（放鬆 / 激昂 / 大自然），加上可疊加的環境音（雨聲、火焰…）讓自己混音。
2. **桌面 bug**：開啟 app 時日曆不會跳到當天，會停在前幾天。
3. **手機 bug**：當天日期格子被切一半，沒辦法剛好對齊整個畫面。

# Changes Made

## Bug 1 — 桌面日曆停在前幾天

`components/calendar/day-scroll-view.tsx:113-126, 270-298`

根因：`DAY_WIDTH` 兩階段解析（先 fallback `DEFAULT_DAY_WIDTH=280`，ResizeObserver 後才拿到實際容器寬），但置中 useEffect 只依賴 `selectedDate`，所以用舊寬度算出的 `scrollLeft` 在 DAY_WIDTH 改變後沒有重算 → 顯示日期偏移到今天往前 6–7 天。

修法：把 `DAY_WIDTH` 加入 deps，並以 `extras===0` 守門避免使用者手動滾動後被拉回。

## Bug 2 — 手機日期格被切一半

`components/calendar/day-scroll-view.tsx:113-126, 924`

根因：手機 `DAY_WIDTH = window.innerWidth - 56`，但實際 scroll container 寬度會被 safe-area inset / scrollbar 吃掉幾 px，累積後 `scroll-snap-align: start` 對不齊整格。

修法：改用實測 `containerWidth - TIME_COL_WIDTH`（與桌面同邏輯），並在 header scroll container 上補 `scroll-snap-stop: always` 防止快速 swipe 跳過一格。

## 新功能 — 背景音樂 + 環境音引擎

新增 `lib/timer-bgm.ts`（音訊引擎，~210 行）
- Music channel：單軌，切換時 300ms 交叉淡出
- Ambient channel：多軌可疊加，各自 enable + volume
- `fadeTo` 用 WeakMap 儲存 rAF handle，新淡入會 cancel 舊 handle，避免拖音量時 chain 疊加
- `preload()` 在 panel 開啟時預先實例化所有 audio element，缺檔的 `error` 事件先 fire 一輪
- `subscribe()` 讓 UI 監聽可用性變化
- SSR 安全：`getBgmEngine()` 在 server 回 `null`，型別誠實標 `BgmEngine | null`

修改 `components/timer/focus-timer.tsx`
- `TimerPrefs` 擴充 `music`、`musicVolume`、`ambient` 欄位，寫回原本的 localStorage key
- `loadPrefs` 的合法 id 列表從 `BGM_MUSIC` / `BGM_AMBIENT` 推導（不重複維護）
- 設定面板新增「背景音樂」（無 / 🌿放鬆 / 🔥激昂 / 🌲大自然 + 音量條）與「環境音（可疊加）」區塊（🌧雨聲 / 🔥火焰 / 🌊海浪 / ☕咖啡廳 + 各自音量條）
- 在番茄鐘 + 碼錶兩種模式下都可用
- 三個 useEffect 串接：prefs → engine 同步、計時器 state → 播放開關、unmount → 停音
- 缺音檔的選項顯示為 line-through + cursor-not-allowed + `title` hint，並在區塊底部加 italic 提示

新增 `public/audio/README.md`
- 列出引擎期望的 7 個檔名與路徑
- 推薦 Pixabay Music / Mixkit / Freesound CC0 來源 + 每個 slot 的具體搜尋字串
- 使用者下載後重新命名直接丟進資料夾即可，不用改程式

更新 `README.md`
- 焦點工具描述補上「番茄鐘 / 碼錶 + 背景音樂 + 可疊加環境音」
- `lib/` 樹新增 `timer-bgm.ts` 一行

更新 `lib/timer-sound.ts:7-15`
- 在 file-header 註解補上 BGM 引擎走另一條路的設計理由（rich timbre + 長 loop 是 WebAudio synth 給不了的；BGM 在 user gesture 後才播，缺檔 UI 友善降級）

# Updates

針對 `/code-review` 第一輪的 7 條發現全部修完：

- Fixed [critical] `lib/timer-sound.ts:7-15` — BGM 引擎重新引入 shipped audio 依賴的決策衝突；補上註解說明兩條音訊路線的不同 tradeoff
- Fixed [warning] `lib/timer-bgm.ts:92-115` — `fadeTo` 無 rAF cancellation；改用 WeakMap 儲存 handle、新淡入 cancel 舊的
- Fixed [warning] `lib/timer-bgm.ts:213-217` — `getBgmEngine` 回傳 null 但型別騙人；改成 `BgmEngine | null`
- Fixed [warning] `lib/timer-bgm.ts:58-79`, `focus-timer.tsx:167-184` — `subscribe`/`isAvailable` 整套寫了卻沒接 UI；UI 接上，缺檔顯示 disabled + line-through
- Fixed [warning] `focus-timer.tsx:65` — `validMusic` 重複 `BGM_MUSIC` id；改成從常數 map 推導
- Fixed [warning] `focus-timer.tsx:62-66` — `validAmbient` + `DEFAULT_AMBIENT` 重複；同樣從 `BGM_AMBIENT` 推導
- Fixed [warning] `lib/timer-bgm.ts` — `setAmbientVolume` 死碼；刪除

第二輪 review 額外發現：

- Fixed [medium] `lib/timer-bgm.ts:71-79`, `focus-timer.tsx:178-181` — 原本 audio element 是 lazy 建立的，缺檔的 disabled 狀態要等使用者第一次點才顯示；新增 `preload()`、在 panel mount 時呼叫，缺檔即時顯示

# Unsolved Issues

- [low] `lib/timer-bgm.ts:140-148` — `setMusicVolume` 用 80ms 淡入，若使用者在 300ms 交叉淡出途中拖音量條會截斷新軌的淡入。罕見且 WeakMap cancellation 已讓聲音不爆，延後
- [low] `components/timer/focus-timer.tsx:676, 727` — 缺檔的選項用 HTML `disabled` 而非 `aria-disabled`，screen reader 使用者無法 focus 聽到 title hint。a11y audit 時再補
- [low] `public/audio/` 仍是空的 — 使用者選了選項 B（CC0 由我挑選），但 Pixabay / Freepd 等 CDN 都需要 referrer / 已關站，自動下載失敗；最終走 README 指引手動下載路線，使用者尚未實際放入音檔
- [pre-existing] `pnpm lint` ESLint 9.39 載入 legacy config 噴 `TypeError: Converting circular structure to JSON`，整個專案都跑不動，跟本次 diff 無關

# Result

- `tsc --noEmit` 通過
- 5 個檔案修改、2 個新增（`lib/timer-bgm.ts`、`public/audio/README.md`）
- 第二輪 `/code-review`：status = clean（0 critical, 0 warning）
- 手動 UI 測試（dev server）延後，使用者直接進入 wrap-up 流程
