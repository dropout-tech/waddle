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

  // Put-away drawer + folders (便條紙收納, migration 20260929120000).
  '收起便條紙': 'Put note away',
  '便條紙收納': 'Sticky note drawer',
  '收起': 'Put away',
  '貼回畫面': 'Pin back',
  '貼在畫面上': 'On screen',
  '移到資料夾': 'Move to folder',
  '新增資料夾': 'New folder',
  '資料夾名稱': 'Folder name',
  '重新命名資料夾': 'Rename folder',
  '刪除資料夾': 'Delete folder',
  '刪除這個資料夾？裡面的便條紙會移到「未分類」，不會被刪掉。': 'Delete this folder? Its notes move to "Uncategorized" — they won\'t be deleted.',
  '這裡還沒有便條紙。在便條紙右上角按「收起」，就會收進這裡。': 'No notes here yet. Tap "Put away" at the top-right of a sticky note to file it here.',
  '（空白便條紙）': '(Empty note)',

  // Onboarding tour copy (folded into the existing "使用者選單" step, since
  // the toggle itself lives inside a dropdown that's absent from the DOM
  // until opened — a spotlight can't target it).
  '點開有你的帳號資訊、深淺色切換與登出。「📌 便條紙」開關現在也在上方工具列（記事本旁邊）就能直接點——開了會出現一片玻璃便條層，貼在畫面上、換頁也不會不見，可以拖曳、選顏色或刪除；按收起鍵會收進旁邊的「收納」抽屜（可分資料夾），之後再貼回來。桌面上按 ⌘K 隨時召喚指令面板（搜任務、切視圖、開記事本）；按 ? 看完整快捷鍵。':
    'Opens your account info, light/dark toggle, and sign-out. The "📌 Sticky notes" toggle now also lives right in the toolbar above (next to the notebook) — turning it on drops a glass layer of notes over the screen that stays put as you switch pages; drag them, pick a color, or delete them; "Put away" files a note into the drawer next to it (with folders) so you can pin it back later. On desktop, press ⌘K anytime for the command palette (search tasks, switch views, open the notebook); press ? for the full shortcut list.',
  '日曆頁「⋯」選單裡有「每日簽到」，記錄心情累積連續天數；使用者選單裡有「會議轉任務」，貼上逐字稿自動整理成待辦任務。「📌 便條紙」開關也在日曆工具列（記事本旁邊）或「⋯」選單裡就能直接點開，開了會出現一片玻璃便條層貼在畫面上，換頁也不會不見；用不到的可以收進「收納」抽屜分資料夾放。':
    'The calendar page\'s "⋯" menu has "Daily check-in" to log your mood and build a streak; the user menu has "Meeting to tasks" to turn a pasted transcript into to-dos automatically. The "📌 Sticky notes" toggle is also right there in the calendar toolbar (next to the notebook) or in the "⋯" menu — turning it on drops a glass layer of notes over the screen that stays put as you switch pages; notes you are done with can be put away into folders in the drawer.',
}
