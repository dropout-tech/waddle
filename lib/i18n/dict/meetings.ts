// English dictionary fragment — keys are the Traditional Chinese source strings.
// Scope: meeting-workspace.tsx, assignment-inbox.tsx, lib/meeting-import.ts
// (meeting-import errors are thrown as the Chinese key and translated by the
// catching component with t(), per the "outside render" pattern).
export const dict: Record<string, string> = {
  // meeting-workspace.tsx
  '暫時無法讀取共享夥伴，仍可使用未指派 checklist。':
    'Could not load shared partners right now. You can still use an unassigned checklist.',
  '無法讀取任務分類，請重新開啟此頁。': 'Could not load task categories. Please reopen this page.',
  '這次整理未成功，沒有扣除次數。請再試一次。':
    'This summary did not complete, and no credit was used. Please try again.',
  '仍在整理中，完成後會自動更新。': 'Still processing — this will update automatically once done.',
  '會議紀錄已儲存。請確認下方任務後再加入。':
    'Meeting notes saved. Review the tasks below before adding them.',
  '整理未完成': 'The summary did not complete',
  '已儲存 checklist：指派給自己的直接加入，其他人的指派等待對方接受。':
    'Checklist saved: items assigned to you were added directly; items assigned to others are waiting for their acceptance.',
  '任務未能建立': 'Could not create the tasks',
  '請選擇 160 KB 以內的 TXT、MD、SRT 或 VTT 文字檔。':
    'Please choose a TXT, MD, SRT or VTT text file under 160 KB.',
  '請提供 40,000 字元以內的純文字內容。': 'Please provide plain text content under 40,000 characters.',
  // '返回工作面板' and '會議轉任務' already translated in dict/account.ts — reused as-is.
  '貼上逐字稿或會議筆記，整理重點，留下接下來要做的事。':
    'Paste a transcript or meeting notes to summarize the key points and capture what to do next.',
  '本月已用 {used} / 20 次': 'Used {used} / 20 this month',
  ' · {pending} 份處理中': ' · {pending} processing',
  '正在讀取額度…': 'Loading quota…',
  '額度暫時無法讀取': 'Quota temporarily unavailable',
  '每月 1 日重置 · 台北時間': 'Resets on the 1st of each month · Taipei time',
  'AI 整理尚未啟用。已有會議紀錄仍可查看與建立任務。':
    'AI summarizing is not enabled yet. Existing meeting notes can still be viewed and turned into tasks.',
  '本月 20 次已用完，下個月 1 日（台北時間）會重新開放。已整理的紀錄仍可建立任務。':
    "This month's 20 summaries are used up and will reset on the 1st of next month (Taipei time). Already-processed notes can still be turned into tasks.",
  '剩餘額度正在處理中，完成後會更新。': 'Remaining quota is being processed and will update once done.',
  '整理另一份會議': 'Summarize another meeting',
  '新增會議紀錄': 'Add meeting notes',
  '會議名稱': 'Meeting name',
  '例如：網站改版討論': 'e.g. Website redesign discussion',
  '會議日期': 'Meeting date',
  '會議時間（台北時間，可留空）': 'Meeting time (Taipei time, optional)',
  '自己的任務加入哪個分類': 'Which category to add your tasks to',
  '有明確依據、指派給「我」的任務，整理完成後直接建立':
    'Automatically create tasks with clear evidence that are assigned to "me" once the summary finishes',
  '逐字稿／會議筆記': 'Transcript / meeting notes',
  '匯入文字檔': 'Import text file',
  '選擇逐字稿文字檔': 'Choose a transcript text file',
  '把會議內容貼在這裡。保留說話者、日期與原句，可以讓任務更清楚。':
    'Paste the meeting content here. Keeping speaker names, dates and original sentences makes the tasks clearer.',
  '{count} / 40,000 字元 · 至少 20 字元': '{count} / 40,000 characters · minimum 20 characters',
  '整理紀錄與任務': 'Summarize notes and tasks',
  '成功整理扣 1 次；確認與建立任務不另扣次。':
    'A successful summary uses 1 credit; confirming and creating tasks does not use an extra one.',
  '送出後，文字會交由 AI 服務整理，並儲存在你的帳號中。本功能不接收錄音檔。':
    'After you submit, the text is processed by an AI service and stored in your account. This feature does not accept audio recordings.',
  '整理結果': 'Summary result',
  '紀錄已儲存': 'Notes saved',
  '整理未完成，未扣次': 'Summary did not complete; no credit used',
  '正在整理': 'Processing',
  '時間：{time}（台北） · ': 'Time: {time} (Taipei) · ',
  '與會者：{list}': 'Participants: {list}',
  '未提供': 'Not provided',
  '正在整理重點與任務，請稍候。離開此頁仍可從最近紀錄查看結果。':
    'Summarizing key points and tasks — please wait. You can leave this page and check the result later from recent notes.',
  '會議摘要': 'Meeting summary',
  '決議': 'Decisions',
  '待確認事項': 'Open questions',
  '確認接下來要做的事': 'Confirm what to do next',
  '核對原文後，選擇指派給自己、共享夥伴或不指派。對方接受前，不會加入對方的任務清單。':
    "After checking the original text, assign each item to yourself, a shared partner, or leave it unassigned. It won't be added to the other person's task list until they accept it.",
  '這份紀錄沒有明確待辦，已保留會議摘要。':
    'No clear action items were found in these notes; the meeting summary was still saved.',
  '加入哪個分類': 'Which category to add to',
  '請先回工作面板建立可用分類。': 'Please go back to the board and create a category first.',
  '已送出，等待接受': 'Sent, waiting for acceptance',
  '對方已接受': 'Accepted by recipient',
  '對方已拒絕': 'Declined by recipient',
  '已加入自己的任務': 'Added to your tasks',
  '選取任務 {n}': 'Select task {n}',
  // '任務名稱' already translated in dict/modals.ts ('Task name') — reused as-is.
  '指派給': 'Assign to',
  '任務 {n} 指派給': 'Task {n} assignee',
  '不指派，保留 checklist': 'Leave unassigned, keep as checklist',
  '我': 'Me',
  // '共享夥伴' already translated in dict/account.ts ('Shared peer') — reused as-is.
  '期限': 'Due date',
  '原文提及：{owner}。': 'Mentioned in the source: {owner}.',
  '負責人待確認，請自行選擇。': 'Assignee unconfirmed — please choose one.',
  '查看來源原文': 'View source text',
  '儲存並處理 {count} 個待辦': 'Save and process {count} tasks',
  '最近紀錄': 'Recent notes',
  '重新整理': 'Refresh',
  '最近 50 份 · 查看紀錄不扣次': 'Last 50 · viewing notes uses no credit',
  '第一份會議紀錄，從貼上文字開始。': 'Your first meeting note — start by pasting some text.',
  '已整理': 'Summarized',
  '未完成': 'Incomplete',
  '處理中': 'Processing',

  // assignment-inbox.tsx
  '無法讀取分類，請重新開啟總覽。': 'Could not load categories. Please reopen the overview.',
  '暫時無法讀取指派，請稍後重新整理。': 'Could not load assignments right now. Please refresh later.',
  '已接受並加入你的任務清單。': 'Accepted and added to your task list.',
  '已拒絕，不會建立任務。': 'Declined — no task was created.',
  '未能處理指派': 'Could not process the assignment',
  // '待接受指派' already translated in dict/account.ts ('Pending assignments') — reused as-is.
  ' · {count}': ' · {count}',
  '暫時無法讀取指派，請稍後重試。': 'Could not load assignments right now. Please try again later.',
  '重新整理指派': 'Refresh assignments',
  '先看清楚誰指派、要做什麼，再決定是否接下。':
    'Check who assigned it and what it involves before deciding whether to accept.',
  '目前沒有等待你確認的任務。': 'No assignments are currently waiting for your response.',
  '接受後加入分類': 'Category to add to when accepted',
  '請先建立自己的任務分類再接受，仍可拒絕指派。':
    'Create a task category of your own before accepting — you can still decline.',
  '{name} 指派給你': '{name} assigned this to you',
  ' · 期限 {date}': ' · Due {date}',
  ' · 期限待確認': ' · Due date unconfirmed',
  '查看任務原文': 'View task source text',
  '接受並加入任務': 'Accept and add task',
  '拒絕': 'Decline',
  '已回覆的指派': 'Responded assignments',
  '已接受': 'Accepted',
  '已拒絕': 'Declined',
  '開啟會議轉任務': 'Open meeting to tasks',

  // lib/meeting-import.ts (thrown as the Chinese key; translated by the
  // catching component with t())
  '與會者帳號重複或已無共享關係，請重新選擇。':
    'Participant accounts are duplicated or no longer shared. Please choose again.',
  '未能處理指派，請確認共享關係與目標分類後重試。':
    'Could not process the assignment. Please check the sharing relationship and target category, then try again.',
  '本月已使用 20 次，下個月 1 日（台北時間）會重新開放。':
    "You've used all 20 this month. It resets on the 1st of next month (Taipei time).",
  '短時間內嘗試較多，請稍後再試。': 'Too many attempts in a short time. Please try again later.',
  '這份內容已變更，請開始新的整理。': 'This content has changed. Please start a new summary.',
  'AI 整理尚未啟用，請稍後再試。': 'AI summarizing is not enabled yet. Please try again later.',
  '登入已過期，請重新登入。': 'Your session has expired. Please sign in again.',
  '帳號已停用，請聯絡客服。': 'This account has been suspended. Please contact support.',
  '文字太長了，請縮短至 40,000 字元以內。': 'The text is too long. Please shorten it to under 40,000 characters.',
  '請確認標題、會議日期和逐字稿格式。': 'Please check the title, meeting date and transcript format.',
  '這次未能完成整理，沒有扣除次數。請重試。':
    'This summary could not be completed, and no credit was used. Please try again.',
  '任務未能建立，請確認目標分類仍可使用後重試。':
    'The tasks could not be created. Please confirm the target category is still available, then try again.',
  '帳號已切換，請重新開啟會議轉任務。': 'The signed-in account has changed. Please reopen meeting to tasks.',
  '暫時無法連線。內容仍留在此頁，可稍後重試或重新整理紀錄狀態。':
    'Could not connect right now. Your content stays on this page — try again later or refresh the note status.',
}
