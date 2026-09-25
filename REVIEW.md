---
reviewed: 2026-09-26
base: 83f7cf2
head: 2491294
findings:
  critical: 2
  warning: 1
  suggestion: 1
  nit: 0
  total: 4
status: issues_found
---
# Code Review

六個面向由三位 reviewer 分工覆核，獨立 scorer 評分；CLAUDE、歷史與規格面向無發現。

| 面向 | 位置（原始 review HEAD） | 問題 | 信心 | 處理 |
|---|---|---|---|---|
| performance | components/widgets/widget-sync.tsx:58 | 全域 focus 導致每次編輯觸發通知 RPC、每三秒整板重抓 | 95 | d822b20 改专屬 debounce 事件 |
| performance | components/widgets/widget-gallery.tsx:64 | 計時每秒重算 49 天掃描 | 55 | d822b20 memo 基础快照 |
| bugs-security | components/widgets/widget-sync.tsx:35 | optimistic timestamp 被誤用為 server revision | 85 | d822b20 使用 server row 建立可操作任務快照 |
| bugs-security | ios/App/App/HuddleWidgetsPlugin.swift:26 | 碼表已經過時間誤顯示為倒數 | 95 | d822b20 Live Activity 限番茄鐘 |

等級依技能的信心分級，並非產品安全事件嚴重度。原生實機驗收仍待進行；不能以靜態覆核宣稱原生發布完成。
