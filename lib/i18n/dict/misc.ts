// English dictionary fragment — keys are the Traditional Chinese source strings.
// Scope: command palette, keyboard shortcuts hint, undo/redo buttons, main
// layout (mobile tab bar, focus views, review pane), resize handle,
// quick-links bar/card/edit-modal, daily-clear celebration, waddle mascot.
export const dict: Record<string, string> = {
  // command-palette.tsx
  '指令面板': 'Command Palette',
  '搜尋任務、或輸入指令…': 'Search tasks or type a command…',
  '沒有符合的結果': 'No matching results',
  '動作': 'Actions',
  '跳到今天': 'Jump to today',
  '切換為日檢視': 'Switch to day view',
  '切換為週檢視': 'Switch to week view',
  '切換為月檢視': 'Switch to month view',
  '開記事本': 'Open notebook',
  '返回日曆': "Back to calendar",
  '開設定': 'Open settings',
  '新增任務': "Add task",
  '任務': "Task",

  // keyboard-shortcuts.tsx
  '開啟指令面板（跳到今天／切換視圖／開記事本／新增任務／搜尋任務）':
    'Open the command palette (jump to today / switch view / open notebook / new task / search tasks)',
  '日曆導航': 'Calendar navigation',
  '上一日 / 下一日': 'Previous day / next day',
  '回到今天（任何畫面皆可，不必先點日曆）': 'Jump to today (works anywhere — no need to open the calendar first)',
  '日檢視（任何畫面皆可）': 'Day view (works anywhere)',
  '週檢視（任何畫面皆可）': 'Week view (works anywhere)',
  '月檢視（任何畫面皆可）': 'Month view (works anywhere)',
  '面板': 'Panels',
  '聚焦面板分隔線後微調寬度（每次 16px）': 'Focus the divider, then nudge its width (16px per press)',
  '開啟任務詳情': 'Open task details',
  '在聚焦的任務塊上開啟詳情': 'Open details on the focused task block',
  '改變任務的時段或日期': "Change a task's time or date",
  '備註編輯': 'Note editing',
  '在 bullet/checklist 行上自動延續標記': 'Auto-continue bullet/checklist markers',
  '在 ☐ 旁切換成 ☑（再點切回）': 'Toggle ☐ to ☑ (click again to undo)',
  '在備註內快速送出': 'Quick-submit inside a note',
  '一般': "Normal",
  '顯示這份快捷鍵清單': 'Show this shortcuts list',
  '關閉視窗 / 取消輸入': 'Close the window / cancel input',
  '點擊': 'Click',
  '拖拉': 'Drag',
  '鍵盤快捷鍵': 'Keyboard Shortcuts',
  '鍵盤快捷鍵 (?)': 'Keyboard shortcuts (?)',
  '關閉': "Close",
  '隨時按': 'Press',
  '重新打開這份清單': 'anytime to reopen this list',
  '按': 'Press',

  // undo-redo-buttons.tsx
  '已復原：{label}': "Undid: {label}",
  '復原失敗': 'Undo failed',
  '已重做：{label}': "Redid: {label}",
  '重做失敗': 'Redo failed',
  '復原：{label} (⌘Z)': 'Undo: {label} (⌘Z)',
  '無動作可復原 (⌘Z)': 'Nothing to undo (⌘Z)',
  '復原': 'Undo',
  '重做：{label} (⇧⌘Z)': 'Redo: {label} (⇧⌘Z)',
  '無動作可重做 (⇧⌘Z)': 'Nothing to redo (⇧⌘Z)',
  '重做': 'Redo',

  // layout/main-layout.tsx
  '日記': 'Journal',
  '報告': "Reports",
  '返回': 'Back',
  '白板': 'Scratchpad',
  '日曆': 'Calendar',
  '連結': "Link",
  '主要分頁': 'Main tabs',
  '開啟任務面板': 'Open task panel',
  '回顧欄': 'Review panel',
  '收合回顧欄': 'Collapse review panel',
  '展開回顧欄': 'Expand review panel',
  '回顧': 'Review',
  '前一天': 'Previous day',
  '後一天': 'Next day',
  '已完成任務': "Completed tasks",
  '未完成任務': 'Incomplete tasks',
  '總任務數': 'Total tasks',
  '今日任務': "Today's tasks",
  '日記內容': 'Journal entry',
  '今天發生了什麼事？有什麼想法或感受？...': 'What happened today? Any thoughts or feelings?',
  '反思提示': 'Reflection prompts',
  '今天最有成就感的事是什麼？': 'What gave you the most sense of accomplishment today?',
  '有什麼事情可以做得更好？': 'What could have gone better?',
  '今天學到了什麼新東西？': 'What did you learn today?',
  '明天最重要的任務是什麼？': "What's the most important task tomorrow?",

  // layout/resize-handle.tsx
  '調整面板寬度': 'Resize panel',

  // quick-links/quick-link-card.tsx
  '編輯 {title}': 'Edit {title}',

  // quick-links/quick-link-edit-modal.tsx
  '刪除「{title}」？': 'Delete "{title}"?',
  '編輯連結': 'Edit link',
  '新增連結': "Add link",
  '名稱': 'Name',
  '例：Notion / GitHub / Gmail': 'e.g. Notion / GitHub / Gmail',
  '網址': 'URL',
  '需要 http:// 或 https:// 開頭的網址': 'Needs a URL starting with http:// or https://',
  '圖示（emoji 或文字，留空自動取名稱第一個字）': "Icon (emoji or text — leave blank to use the name's first letter)",
  '📝 / GH / 🐧 / 任意文字皆可': '📝 / GH / 🐧 / anything works',
  '色彩': 'Color',
  '預設': 'Default',
  '刪除': 'Delete',
  '取消': 'Cancel',
  '儲存': 'Save',

  // quick-links/quick-links-bar.tsx
  '常用連結': 'Quick Links',
  '釘住網址，點一下開新分頁': 'Pin URLs — tap to open in a new tab',
  '新增': 'Add',
  '還沒有連結': 'No links yet',
  '點右上「+ 新增」加第一個': 'Tap "+ Add" up top to add your first one',

  // celebration/daily-clear-celebration.tsx
  '今天的清單清空了，企鵝替你滑了一圈冰。': 'Your list is clear for today — the penguin took a victory lap on the ice.',
  '今日事項都做完了，可以慢慢喘口氣。': "Today's tasks are all done. Take a slow breath.",
  '今天份都收工了，企鵝說辛苦了。': "Today's work is wrapped. The penguin says well done.",
  '清單見底，企鵝溜出一個漂亮的弧線。': 'List cleared — the penguin carved a beautiful arc.',
  '今天的任務都做完了，剩下的時間是你的。': "All of today's tasks are done. The rest of the time is yours.",

  // branding/waddle-mascot.tsx
  'Huddle 企鵝吉祥物': 'Huddle the penguin mascot',
}
