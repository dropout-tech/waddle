# Huddle 產品動畫配樂來源

製作日期：2026-09-20。此版重新編曲以配合 18 秒快節奏影片。

## 素材與可重製性

這段配樂為原創程序合成作品。旋律、和聲、低音、鼓點與音色全部由 `scripts/media/compose-huddle-score.py` 產生，不是將前版 24 秒 WAV 加速。未引用既有曲目、第三方錄音、loop、sample library 或付費音樂服務。

合成僅使用 Python 標準函式庫：正弦振盪器、諧波、包絡、固定種子噪音及短延遲。沒有網路請求或外部音檔輸入。這是來源與製作方式說明，不保證所有司法管轄區的權利歸屬，也不宣稱與世界所有旋律皆無偶然相似。

重製：

```sh
python3 scripts/media/compose-huddle-score.py
```

## 規格與實際數值

- 檔案：`public/marketing/feature-film/huddle-score.wav`
- 18.000 秒、160 BPM、4/4 拍、12 小節。
- 44,100 Hz、雙聲道、PCM16 little-endian；793,800 frames。
- 讀回 PCM 後峰值：**-1.800006 dBFS**；目標 -1.8 dBFS。
- 讀回 PCM 後 RMS：**-14.802346 dBFS**，這不是 LUFS。
- clipping samples：**0**；最後一個 stereo frame 為 `[0, 0]`。
- 起音 15 ms 淡入，最後 550 ms 淡出。短 stereo room taps 為 61/119 ms。
- SHA-256：`53fb2be3e43e0b4cf583d73a0ec9b4e7a48c49beb685dc3e8b8cb859bc37d30b`。

數值以獨立 Python WAV 讀回驗證，檢查 frames、取樣率、聲道、sample width、峰值與 clipping；另外以 FFmpeg volumedetect 複核：mean_volume -14.8 dB、max_volume -1.8 dB，與直接讀回結果一致。

## 新編曲

以 D 大調、I–V–vi–IV 開場，再經 ii–V 推進回主和弦。新的短旋律採上行四分音符及切分回應；音色為圓潤諧波銅管感 lead，加上明亮 bell、持續八分音符 bass、四拍 kick、第二與第四拍 snare 及輕巧 hi-hat。鼓聲以包絡及正規化控制，不使用硬削波。最後兩小節減少鼓點，讓主和弦有空間收尾。

| 時間 | 安排 |
| --- | --- |
| 0–4.5 秒 | 立即進入 160 BPM 鼓與 bass，明亮上行主旋律，建立堅定的推進感 |
| 4.5–8.25 秒 | 新 D 大調上行晶亮音群，左右移動，主旋律在此降低音量 |
| 8.25–15 秒 | 回到短旋律與清楚鼓拍，配合拖曳、改時段與完成 |
| 15–18 秒 | 主和弦展開、lead 解決，減少鼓點，最後 550 ms 淡出 |

落位提示音精準對應原影片節點乘以 0.75：**7.35、10.35、12.9、14.475、17.1 秒**。這些提示音直接合成在 WAV，mux 時不可再次疊同一組音效。

本次已完成音檔生成與數值驗證；最終 mux 的音畫同步與實際聽感需由成片檢查確認。
