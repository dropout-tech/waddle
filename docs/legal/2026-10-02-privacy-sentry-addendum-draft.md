# Privacy page addendum draft: Sentry error reporting

Status: DRAFT, not published. Do not insert into `app/privacy/page.tsx` or `app/en/privacy/page.tsx` until the owner has created the Sentry account, chosen the data region and approved the wording. Items marked `[TBD]` need the owner's input. Have a lawyer review before publishing (legal-sensitive text).

Where it goes: both pages have a section "Service providers and device storage" / 「服務供應商與裝置儲存」. Suggested placement is a NEW section right after it, using the same `<LegalSection>` pattern as the other sections (shown below as ready-to-paste JSX, one line per page, matching the single-line style of the existing files). Also add one half-sentence to the existing provider list: "and Sentry for error reports" / 「並使用 Sentry 接收錯誤回報」.

## 繁體中文（app/privacy/page.tsx）

Section title: `錯誤回報（Sentry）`

Plain text:

> 當 Huddle 在你的裝置上發生程式錯誤時，會自動把一份錯誤報告傳送給 Sentry（Functional Software, Inc.）的錯誤監控服務，讓我們能發現並修正問題。這項功能只在「發生錯誤的當下」才會傳送資料；沒有錯誤時不會傳送任何東西。網頁版、iPhone App 與桌面版都適用。
>
> 我們會蒐集：錯誤的類型與（經截短，並盡力遮蔽個人資訊的）簡短說明、發生錯誤的頁面路徑（不含網址後面的參數，路徑中的識別碼也會遮蔽）、裝置與瀏覽器／系統版本、Huddle 的 App 版本，以及錯誤發生前的少量操作軌跡（例如換了哪個頁面、呼叫了哪個後端網址路徑）。
>
> 我們不會蒐集：你的任務、行程、筆記、白板內容與上傳檔案，你的 Email、姓名或帳號識別碼，登入憑證與 Cookie，也不會錄製畫面或操作過程。錯誤報告目前不會附帶可識別你身分的資訊。錯誤說明是程式自動產生的文字，我們會以自動化方式盡力遮蔽其中可能出現的個人內容（例如 Email、冒號或引號內的文字、非英文字句），但無法保證百分之百遮蔽。
>
> 資料存放地區：[待老闆選 Sentry 資料區域後填入（美國或歐盟）]。Sentry 可能在你所在地區以外處理這些資料。
>
> 保存期間：Sentry 免費方案的錯誤資料預設保存 30 天，之後自動刪除（來源：https://docs.sentry.io/security-legal-pii/security/data-retention-periods/ ，查閱日期 2026-10-02）。若日後改用付費方案，保存期間可能不同，屆時會更新本頁。
>
> 這些資料只用來診斷與修正錯誤，不用於廣告，也不會出售。

Ready-to-paste JSX (one line, same style as existing sections):

```tsx
<LegalSection title="錯誤回報（Sentry）"><p>當 Huddle 在你的裝置上發生程式錯誤時，會自動把一份錯誤報告傳送給 Sentry（Functional Software, Inc.）的錯誤監控服務，讓我們能發現並修正問題。這項功能只在「發生錯誤的當下」才會傳送資料；沒有錯誤時不會傳送任何東西。網頁版、iPhone App 與桌面版都適用。</p><p>我們會蒐集：錯誤的類型與（經截短，並盡力遮蔽個人資訊的）簡短說明、發生錯誤的頁面路徑（不含網址後面的參數，路徑中的識別碼也會遮蔽）、裝置與瀏覽器／系統版本、Huddle 的 App 版本，以及錯誤發生前的少量操作軌跡（例如換了哪個頁面、呼叫了哪個後端網址路徑）。我們不會蒐集：你的任務、行程、筆記、白板內容與上傳檔案，你的 Email、姓名或帳號識別碼，登入憑證與 Cookie，也不會錄製畫面或操作過程。錯誤報告目前不會附帶可識別你身分的資訊。錯誤說明是程式自動產生的文字，我們會以自動化方式盡力遮蔽其中可能出現的個人內容（例如 Email、冒號或引號內的文字、非英文字句），但無法保證百分之百遮蔽。</p><p>資料存放地區：[待老闆選 Sentry 資料區域後填入]。Sentry 可能在你所在地區以外處理這些資料。Sentry 免費方案的錯誤資料預設保存 30 天，之後自動刪除；若日後改用付費方案，保存期間可能不同，屆時會更新本頁。這些資料只用來診斷與修正錯誤，不用於廣告，也不會出售。</p></LegalSection>
```

## English (app/en/privacy/page.tsx)

Section title: `Error reporting (Sentry)`

Plain text:

> When Huddle hits a software error on your device, it automatically sends an error report to the error-monitoring service Sentry (Functional Software, Inc.) so we can find and fix the problem. Data is sent only at the moment an error happens; nothing is sent when there is no error. This applies to the website, the iPhone app and the desktop app.
>
> What we collect: the type of error and a short description (truncated, with personal information masked on a best-effort basis), the page path where it happened (without anything after the "?" in the address, and with identifiers in the path masked), device and browser/operating-system version, the Huddle app version, and a short trail of what happened just before the error (for example which page you moved to and which backend address path was called).
>
> What we do not collect: your tasks, calendar entries, notes, whiteboards or uploaded files; your email, name or account identifier; sign-in credentials or cookies. We do not record your screen or your activity. Error reports currently carry no information that identifies you. The error description is automatically generated text; we mask personal content that may appear in it (such as emails, quoted text and non-English text) automatically and on a best-effort basis, but we cannot guarantee that every piece is caught.
>
> Where it is stored: [TBD: fill in once the owner picks the Sentry data region (US or EU)]. Sentry may process this data outside your region.
>
> How long: on Sentry's free plan, error data is kept for 30 days by default and then deleted automatically (source: https://docs.sentry.io/security-legal-pii/security/data-retention-periods/, checked 2026-10-02). If we move to a paid plan the period may differ and this page will be updated.
>
> This data is used only to diagnose and fix errors. It is not used for advertising and is not sold.

Ready-to-paste JSX:

```tsx
<LegalSection title="Error reporting (Sentry)"><p>When Huddle hits a software error on your device, it automatically sends an error report to the error-monitoring service Sentry (Functional Software, Inc.) so we can find and fix the problem. Data is sent only at the moment an error happens; nothing is sent when there is no error. This applies to the website, the iPhone app and the desktop app.</p><p>What we collect: the type of error and a short description (truncated, with personal information masked on a best-effort basis), the page path where it happened (without anything after the “?” in the address, and with identifiers in the path masked), device and browser or operating-system version, the Huddle app version, and a short trail of what happened just before the error (for example which page you moved to and which backend address path was called). What we do not collect: your tasks, calendar entries, notes, whiteboards or uploaded files; your email, name or account identifier; sign-in credentials or cookies. We do not record your screen or your activity. Error reports currently carry no information that identifies you. The error description is automatically generated text; we mask personal content that may appear in it (such as emails, quoted text and non-English text) automatically and on a best-effort basis, but we cannot guarantee that every piece is caught.</p><p>Where it is stored: [TBD: fill in once the owner picks the Sentry data region]. Sentry may process this data outside your region. On Sentry’s free plan, error data is kept for 30 days by default and then deleted automatically; if we move to a paid plan the period may differ and this page will be updated. This data is used only to diagnose and fix errors. It is not used for advertising and is not sold.</p></LegalSection>
```

## Notes for the owner

- Wording is deliberately "best effort": the scrubber (`lib/monitoring/sentry-scrub.ts`, unit-tested in `scripts/tests/sentry-scrub.test.mjs`) masks emails, tokens, quoted text containing spaces or non-ASCII, non-ASCII prose, query strings, UUIDs / long tokens in paths and non-web URL schemes (data:, blob:, file:), but free-form error text can never be proven clean. Do not tighten these sentences into a guarantee.
- The "nothing sent when there is no error" and "no identifier" statements are true of the code as committed (release-health sessions, tracing, replay, console and click breadcrumbs are all disabled; `buildSentryUser` returns null). If you later decide to attach an anonymous user id, change the "do not collect ... account identifier" sentence and the "carry no information that identifies you" sentence before shipping that change.
- The Apple App Store privacy questionnaire ("App Privacy" nutrition label) must be updated too: Diagnostics > Crash Data / Other Diagnostic Data, not linked to the user, not used for tracking. Check the exact wording in App Store Connect at submission time.
- Mention Sentry in the Google OAuth / Supabase-facing documents only if a reviewer asks; no Google user data is sent to Sentry.
- Sentry's own dashboard: also enable "Prevent Storing of IP Addresses" in project settings as a second layer (server-side IP is otherwise inferred from the connection).
