# Hero 插畫素材 manifest

- Asset: `public/marketing/hero-desk-art.webp`
- 實際輸出：1659 × 948 px，152,726 bytes（149.1 KiB），sRGB、不透明 WebP。
- 用途：官網 Hero 全幅底圖；真正標題、按鈕與產品截圖由 HTML 疊上，素材本身沒有文字與假 UI。
- 製作：內建 `image_gen`，依使用者指定參考重新生成原創素材，未裁切參考作成品。
- 參考：使用者提供的黃色紙質官網構圖，以及 `public/huddle-mascot.png` 的原稿角色。
- 生成原始檔：`/Users/lazylazy/.codex/generated_images/01a0be33-a82c-7f01-99c4-09ccf7a78311/exec-be7d6334-ed69-49f0-bd28-6c00f0647cb1.png`
- 網頁版本：Sharp 純 PNG → WebP 格式轉換，quality 90、effort 6，無重新繪製、裁切、合成或尺寸改動。
- 視覺：暖芥末黃纖維紙底、鉛筆蠟筆植物、膠帶紙張與原稿角色、黑色桌燈、奶油陶杯。
- 構圖安全區：上方中央約 60% 完整留白；主要內容放於中央 x 18–82%。下方中央約 64% 完整留白，x 15–85% 的寬產品截圖可自然蓋住最靠內的植物尖端及桌角。需保留四周物件時，桌機使用完整圖片比例；行動版可裁切外緣。
- 檢查：已查看生成圖及最終 WebP，無文字、螢幕、按鈕、假 UI。角色使用圓頭隆起、圓眼、奶油腹部及橢圓小嘴，沒有替換成參考中的貓。
- 本次僅產出此素材與 manifest，未變更 UI 或 feature-film。

## Final prompt

```text
Use case: ads-marketing. Create a NEW original production background illustration for a website hero, NOT a screenshot, NOT a web design. Wide landscape 1792 x 1024 or larger, approximately 16:9. Image 1 is the composition/material/color reference ONLY: recreate the mustard paper tactile feeling and outer desk objects, do not copy the layout as a flat screenshot. Image 2 is the exact mascot identity reference for one small pencil doodle; copy its round gray silhouette, round ear-like head bumps, huge cream round eyes, tiny oval beak and cream belly. This is the user's penguin mascot, NEVER draw a cat.
Scene: warm rich mustard yellow textured paper fills entire canvas, understated finely visible crayon, pastel and paper grain, artisanal editorial collage with hand-drawn black graphite edges. Sparse objects ONLY along extreme edges. On far left bottom a dark olive green crayon-textured plant with thick imperfect leaves, occupying x 0-14%, y 45-100%. On far left upper-middle, a small off-white uneven paper note taped at an angle and partially cropped by left edge, occupying x 0-12%, y 25-49%, with a small graphite doodle of Image 2 mascot. On far right upper-middle a black charcoal hand-drawn angled desk lamp extends from outside canvas, shade occupying x 88-100%, y 25-45%. On far right bottom a plain ivory ceramic mug with no text sits on a very small dark sketchy desk corner, entirely within x 89-100%, y 76-100%. The left and right objects have imperfect pencil and wax crayon texture, tactile paper collage feeling; reference's handmade premium charm.
CRITICAL NEGATIVE SPACE: central x 15-85% must be uninterrupted mustard paper from top to bottom, no lines, no objects, no marks except faint natural paper grain. Top-center x 20-80%, y 0-42% is for real HTML headline and MUST remain completely empty. Center-lower x 15-85%, y 44-100% is for real product screenshot overlaid later and MUST remain completely empty. Do not create a central frame. All decorative objects stay at the perimeter. No generated text, letters, numbers, words, logos, watermark, fake UI, buttons, screens, computers, calendar, borders, navigation, headline, or website layout. This output is solely the warm yellow desk illustration layer. No pink border and no white footer.
```
