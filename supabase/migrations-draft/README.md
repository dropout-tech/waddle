這裡是 AI 回顧報告的資料庫變更草稿（`20261001120000_ai_reviews.sql` 三張新表與函式、`20261003030000_task_source.sql` 任務來源欄），尚未套用到任何 Supabase 專案；本機測試用 `bash scripts/tests/ai-review-database.sh`（先套 `supabase/migrations/` 全部，再套這裡）。
上線時（老闆同意後）：兩支一起 `git mv` 回 `supabase/migrations/`，並把檔名時間戳改成當下時間（舊時間戳早於正式庫已套用的版本，`db push` 會拒絕或亂序），先在測試專案套用並重跑 `scripts/tests/*.sh`，回滾腳本在 `rollback/`。
不可直接對這個資料夾或從這裡 `supabase db push`：草稿放在 `migrations/` 以外，就是為了不讓 main 上的例行 `db push` 把它意外套進正式庫（專案 `jnikcndiexjojgvicohf`）。
