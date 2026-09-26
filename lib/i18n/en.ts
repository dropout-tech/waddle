import { dict as appShell } from './dict/app-shell'
import { dict as taskPanel } from './dict/task-panel'
import { dict as calendar } from './dict/calendar'
import { dict as timer } from './dict/timer'
import { dict as notebook } from './dict/notebook'
import { dict as modals } from './dict/modals'
import { dict as misc } from './dict/misc'
import { dict as reports } from './dict/reports'
import { dict as dataLayer } from './dict/data-layer'
import { dict as growth } from './dict/growth'
import { dict as operations } from './dict/operations'
import { dict as account } from './dict/account'
import { dict as meetings } from './dict/meetings'
import { dict as pet } from './dict/pet'
import { dict as stickyNotes } from './dict/sticky-notes'
import { dict as assignments } from './dict/assignments'

// Merged English dictionary. Keys are the Traditional Chinese source strings
// (see lib/i18n/index.ts). Split by feature area purely to keep files
// reviewable; duplicate keys across fragments are harmless as long as the
// translations agree.
export const en: Record<string, string> = {
  ...appShell,
  ...taskPanel,
  ...calendar,
  ...timer,
  ...notebook,
  ...modals,
  ...misc,
  ...reports,
  ...dataLayer,
  ...growth,
  ...account,
  ...operations,
  ...meetings,
  ...pet,
  ...stickyNotes,
  ...assignments,
  // Whiteboard canvas controls.
  "手寫筆記": "Handwritten note",
  "請選擇圖片檔案。": "Please choose an image file.",
  "圖片需小於 5 MB。": "Images must be smaller than 5 MB.",
  "無法讀取圖片，請重試。": "Unable to read the image. Please try again.",
  "請輸入有效的網址，或按 Escape 取消。": "Enter a valid URL, or press Escape to cancel.",
  "檢查清單": "Checklist",
  "連結網址": "Link URL",
  "畫布內容": "Canvas content",
  "貼上網址…": "Paste a URL…",
  "輸入待辦…": "Enter a task…",
  "直接寫下想法…": "Write your thoughts here…",
  "連結標題": "Link title",
  "連結標題（選填）": "Link title (optional)",
  "點空白處儲存": "Click outside to save",
  "取消": "Cancel",
  "白板": "Whiteboard",
  "按兩下空白處寫字；開啟內容可使用記事本編輯工具。": "Double-click an empty area to write; open an item to use the notebook editor.",
  "縮小畫布區域": "Collapse canvas area",
  "放大畫布區域": "Expand canvas area",
  "白板使用說明": "Whiteboard help",
  "全螢幕白板": "Full-screen whiteboard",
  "結束全螢幕": "Exit full screen",
  "畫布工具": "Canvas tools",
  "文字": "Text",
  "圖片": "Image",
  "連結": "Link",
  "畫筆": "Pen",
  "加入畫布圖片": "Add an image to the canvas",
  "白板，使用縮放與顯示全部按鈕調整視野": "Whiteboard. Use zoom and Show all to adjust the view.",
  "拖動卡片": "Move card",
  "待辦": "Task",
  "筆記": "Note",
  "編輯連結": "Edit link",
  "開啟內容": "Open content",
  "已完成 {checked} / {total} 項": "{checked} / {total} completed",
  "畫布圖片": "Canvas image",
  "完成畫布待辦": "Complete canvas task",
  "編輯{type}：{content}": "Edit {type}: {content}",
  "開啟內容，開始編輯檢查清單": "Open to edit the checklist",
  "開啟內容，開始寫筆記": "Open to start writing",
  "調整卡片大小": "Resize card",
  "這天還沒有白板內容": "No whiteboard content for this day",
  "在空白處開始畫圖": "Start drawing in an empty area",
  "按兩下這裡直接寫字，或點「文字」開始。": "Double-click here to write, or select Text to begin.",
  "縮小畫布": "Zoom out",
  "放大畫布": "Zoom in",
  "顯示全部": "Show all",
  "刪除選取的畫布卡片": "Delete the selected canvas card",
  "確定刪除這張畫布卡片？": "Delete this canvas card?",
}
