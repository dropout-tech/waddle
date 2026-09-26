// English dictionary fragment — keys are the Traditional Chinese source
// strings. Sticky-notes glass overlay (便條紙), shared across every page.
export const dict: Record<string, string> = {
  '便條紙': 'Sticky notes',
  '顯示便條紙': 'Show sticky notes',
  '隱藏便條紙': 'Hide sticky notes',
  '新增便條紙': 'New sticky note',
  '刪除便條紙': 'Delete sticky note',
  '確定刪除這張便條紙？': 'Delete this sticky note?',
  '拖曳便條紙': 'Drag sticky note',
  '調整便條紙大小': 'Resize sticky note',
  '便條紙顏色': 'Note color',
  '黃色': 'Yellow',
  '鼠尾草綠': 'Sage',
  '玫瑰粉': 'Rose',
  '奶油色': 'Cream',

  // Onboarding tour copy (folded into the existing "使用者選單" step, since
  // the toggle itself lives inside a dropdown that's absent from the DOM
  // until opened — a spotlight can't target it).
  '點開有你的帳號資訊、深淺色切換與登出，還有「📌 顯示便條紙」——開了會出現一片玻璃便條層，貼在畫面上、換頁也不會不見，可以拖曳、選顏色或刪除。桌面上按 ⌘K 隨時召喚指令面板（搜任務、切視圖、開記事本）；按 ? 看完整快捷鍵。':
    'Opens your account info, light/dark toggle, sign-out, and "📌 Show sticky notes" — turning it on drops a glass layer of notes over the screen that stays put as you switch pages; drag them, pick a color, or delete them. On desktop, press ⌘K anytime for the command palette (search tasks, switch views, open the notebook); press ? for the full shortcut list.',
  '日曆頁「⋯」選單裡有「每日簽到」，記錄心情累積連續天數；使用者選單裡有「會議轉任務」，貼上逐字稿自動整理成待辦任務。使用者選單裡也有「📌 顯示便條紙」，開了會出現一片玻璃便條層貼在畫面上，換頁也不會不見。':
    'The calendar page\'s "⋯" menu has "Daily check-in" to log your mood and build a streak; the user menu has "Meeting to tasks" to turn a pasted transcript into to-dos automatically. The user menu also has "📌 Show sticky notes" — turning it on drops a glass layer of notes over the screen that stays put as you switch pages.',
}
