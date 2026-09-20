# Huddle 功能短片播放器交付

## 頁面與素材

- `/film` 是不需登入的完整預覽頁，設為 `noindex, nofollow`。
- 中英文官網在白板功能段落後共用 `FeatureFilm`；官網整體依使用者確認的黃色海報方向重做。
- 影片：`/marketing/feature-film/huddle-feature-film.mp4`
- 海報：`/marketing/feature-film/poster.jpg`
- 繁中字幕：`/marketing/feature-film/captions.vtt`
- 影片製作與素材內容由動畫工作流負責；本文件描述播放器整合。

## 互動與無障礙

影片預設靜音，提供「開啟聲音／關閉聲音」按鈕，並透過 volumechange 與原生音量控制同步。影片預留 16:9 空間，使用原生 controls、playsInline、preload="metadata"，不使用 autoplay 或 loop。使用者主動播放才開始影音，因此 reduced-motion 偏好下也不會自動出現動畫。另提供開始／暫停、從頭播放及下載入口；音量、靜音、字幕和時間軸使用原生控制列。

`track kind="captions"` 提供預設繁體中文字幕。播放器有 aria-label、情境說明與文字版功能摘要；文字版位於可展開 details。媒體錯誤顯示 status 訊息，play promise 有 catch，不造成未處理例外。所有按鈕保留鍵盤焦點輪廓與至少 44px 高度。

畫面明示「情境示意，非拍照辨識功能」。文字版需和成片最終劇情交叉確認；不能把動畫轉場表現誤寫成產品自動辨識能力。

## 官方依據

- [MDN video element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)：原生 controls、poster、preload、字幕與文字轉錄的建議。
- [MDN HTML video and audio](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/HTML_video_and_audio)：metadata 預載，以及避免令人困擾的自動播放與循環。
- [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)：play() 可能被瀏覽器拒絕，應處理 promise；本播放器僅在使用者操作時播放。
- [MDN accessible multimedia](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/Multimedia)：以字幕與文字版補足影音內容。

## 成片驗證

2026-09-20：中英文 4 個入口共 61 項播放器回歸通過。海報、MP4、VTT 載入、18 秒影片規格、播放/重播/音量/字幕、390px 與 1440px 無溢位、鍵盤操作及 reduced-motion 初始暫停均已驗證。配樂為原創程序合成，已封裝為 AAC 雙聲道；聽感仍由使用者在預覽確認。

## 英文版本

`FeatureFilm` 接受 `locale="en"`，中文仍為預設。`/en/film` 提供英文標題、操作、狀態、文字版與返回中文連結，`/film` 可切換至英文預覽。英文字幕位於 `captions.en.vtt`；英文頁預設英文字幕，仍保留可選繁中字幕，中文頁則相反。影片畫面沿用中文版本，英文文字版明示影片展示中文介面，字幕以英文解釋情境。

按鈕角半徑 4px，標題字距 -.03em。回歸腳本 `scripts/e2e/feature-film-verify.mjs` 同時涵蓋中英文官網及影片預覽、正確預設字幕、英文標題、切換連結與行動版排版。
