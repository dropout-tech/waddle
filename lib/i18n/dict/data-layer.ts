// English dictionary fragment — keys are the Traditional Chinese source strings.
// Covers: hooks/use-waddle-data.ts, hooks/use-meeting-reminders.ts,
// hooks/use-undo-shortcuts.ts, lib/notifications/index.ts, lib/task-utils.ts.
export const dict: Record<string, string> = {
  // ── use-waddle-data.ts: generic save-error wrapper ──
  '儲存失敗：{op}': 'Save failed: {op}',
  '初始化資料失敗，請重新整理': 'Failed to set up your data — please refresh.',

  // handleDbError operation labels (used both for the toast above and,
  // where reused, as undo-stack action labels)
  '新增工作區': "Add workspace",
  '新增分類': "Add category",
  '更新工作區': 'Update workspace',
  '封存工作區': 'Archive workspace',
  '刪除工作區': 'Delete workspace',
  '刪除分類': 'Delete category',
  '調整分類順序': 'Reorder categories',
  '切換分類折疊': 'Toggle category collapse',
  '新增任務': "Add task",
  '建立任務': 'Create task',
  '更新任務': 'Update task',
  '切換任務狀態': 'Toggle task status',
  '刪除任務': 'Delete task',
  '更新重複任務例外': 'Update recurring task exception',
  '更新重複任務結束日': 'Update recurring task end date',
  '重新排程': 'Reschedule',
  '建立任務例外': 'Create task exception',
  '取消排程': 'Unschedule',
  '建立時間區塊': 'Create time block',
  '更新時間區塊': 'Update time block',
  '刪除時間區塊': 'Delete time block',
  '儲存設定': 'Save settings',
  '儲存時間區塊': 'Save time blocks',
  '儲存時間區塊類型': 'Save time block types',
  '儲存常用連結': 'Save quick links',
  '儲存白板': 'Save scratchpad',
  '刪除白板項目': 'Delete scratchpad item',
  '編輯白板項目': 'Edit scratchpad item',
  '重新排序白板': 'Reorder scratchpad',
  '清空白板': 'Clear scratchpad',
  '儲存導覽進度': 'Save onboarding progress',
  '清空工作區': 'Clear workspaces',
  '建立工作區': "Create workspace",
  '建立分類': 'Create categories',

  // Undo-stack action label templates
  '移動「{title}」': 'Move "{title}"',
  '編輯「{title}」': 'Edit "{title}"',
  '完成「{title}」': 'Completed "{title}"',
  '取消完成「{title}」': 'Marked "{title}" incomplete',
  '刪除「{title}」': 'Delete "{title}"',
  '重排「{title}」': 'Reschedule "{title}"',
  '更新「{label}」': 'Update "{label}"',
  '刪除「{label}」': 'Delete "{label}"',

  // Fallback task title (used when a task can't be found for the undo label)
  '任務': "Task",

  // Auth/session-expiry write-failure toasts
  '儲存失敗：無法寫入這個任務（可能登入逾時，請重新整理或登出再登入）':
    "Save failed: couldn't write this task (your session may have expired — try refreshing, or sign out and back in).",
  '任務排程沒寫入：可能登入逾時，請重新整理或登出再登入':
    "Schedule change didn't save — your session may have expired. Try refreshing, or sign out and back in.",
  '儲存失敗：無法建立時間區塊（可能登入逾時，請重新整理或登出再登入）':
    "Save failed: couldn't create this time block (your session may have expired — try refreshing, or sign out and back in).",
  '儲存失敗：無法更新時間區塊（可能登入逾時，請重新整理或登出再登入）':
    "Save failed: couldn't update this time block (your session may have expired — try refreshing, or sign out and back in).",
  '儲存失敗：無法刪除時間區塊（可能登入逾時，請重新整理或登出再登入）':
    "Save failed: couldn't delete this time block (your session may have expired — try refreshing, or sign out and back in).",

  // Onboarding template — default workspace / category names seeded at signup
  '工作': 'Work',
  '本週': 'This week',
  '進行中': 'In progress',
  '完成': 'Done',
  '個人': 'Personal',
  '生活': 'Life',
  '健康': "Healthy",
  '學習': 'Learning',
  '課程': 'Courses',
  '閱讀': 'Reading',
  '我的工作區': 'My Workspace',
  // NOTE: '一般' is reused for two different meanings — the default
  // "General" category name (addWorkspace / blank onboarding template) and
  // the mid-low urgency label in lib/task-utils.ts ("normal" priority).
  // Both share this one key/translation by design of the flat dictionary;
  // "General" was chosen as the compromise that reads acceptably in both
  // places. See report for detail.
  '一般': "Normal",

  // ── use-undo-shortcuts.ts ──
  '已重做：{label}': "Redid: {label}",
  '已復原：{label}': "Undid: {label}",
  '重做失敗': 'Redo failed',
  '復原失敗': 'Undo failed',

  // ── lib/notifications/index.ts + hooks/use-meeting-reminders.ts (shared) ──
  '{time} 開始（{lead} 分鐘後）': 'Starts at {time} ({lead} min)',
  '地點：{location}': 'Location: {location}',
  '參與者：{attendees}': 'Attendees: {attendees}',
  '會議提醒 · {title}': 'Meeting reminder · {title}',
  '會議': "Meeting",

  // ── lib/task-utils.ts ──
  '極度緊急': 'Critical',
  '高度緊急': "Urgent",
  '中等': "Medium",
  '輕鬆': "Low",
  '已過期': 'Overdue',

  // ── lib/demo-data.ts: new (non-owner) signup demo seed content ──
  // Note: '午休' and '專案' are already covered by other dict fragments
  // (app-shell.ts/calendar.ts/modals.ts) with matching translations, so
  // they're intentionally not repeated here.
  '歡迎': 'Welcome',
  '快速上手': 'Get started',
  '點擊我看任務細節': 'Tap me to see task details',
  '可以編輯標題、描述、時間、急迫度': 'You can edit the title, description, time, and urgency',
  '勾選左邊圈圈完成任務': 'Check the circle on the left to complete a task',
  '已完成的任務長這樣': 'This is what a completed task looks like',
  '點圈圈可以取消勾選': 'Tap the circle again to mark it incomplete',
  '撰寫週報': 'Write the weekly report',
  '週五前完成': 'Finish by Friday',
  '團隊會議': 'Team meeting',
  '回覆客戶 email': 'Reply to a customer email',
  '新版本上線規劃': 'Plan the new release',
  '需要和設計、工程一起對齊': 'Needs sign-off from design and engineering',
  '運動 30 分鐘': 'Exercise for 30 minutes',
  '每天養成習慣': 'Build the daily habit',
  '買菜 + 備餐': 'Grocery run + meal prep',
  '讀《原子習慣》第三章': 'Read Chapter 3 of Atomic Habits',
}
