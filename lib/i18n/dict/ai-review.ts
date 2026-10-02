// English dictionary fragment — keys are the Traditional Chinese source strings.
// AI review (review-page block, report viewer, consent screens, settings) and the
// shared AI consent screen used by AI meeting import.
// Consent wording follows docs/legal/2026-10-01-ai-consent-copy-draft.md.
export const dict: Record<string, string> = {
  // ---- review block ----
  'AI 回顧': 'AI Review',
  '讓 AI 讀你這段期間的紀錄，寫一份只給你自己看的回顧。': 'Let AI read your records for a period and write a review only you can see.',
  '回顧期間': 'Review period',
  '本週是最近 7 天，本月是最近一個月，和上方的回顧一致。': 'This week means the last 7 days and this month means the last month, matching the review above.',
  '產生報告': 'Generate report',
  '正在產生…': 'Generating…',
  '本月還能產生 {n} 次': 'You can generate {n} more this month',
  '正在讀取你的紀錄並寫報告，最多約 90 秒。請先留在這個畫面；完成後也會出現在歷史報告裡。':
    'Reading your records and writing the report. This can take up to about 90 seconds. Please stay on this screen; it will also appear in your past reports.',
  '這段期間還沒有紀錄': 'Nothing recorded in this period yet',
  '所選的這段期間沒有任務、便條紙、白板或時間區塊的紀錄，Huddle 先不幫你寫回顧，也沒有扣掉你的份數。休息也是節奏的一部分。':
    "There are no tasks, sticky notes, whiteboard items or time blocks in the period you chose, so Huddle won't write a review for it, and no report was used up. Rest is part of the rhythm too.",
  '歷史報告': 'Past reports',
  '撤回同意': 'Withdraw consent',
  '讀不到歷史報告，請稍後再試。': "Couldn't load past reports. Please try again later.",
  '還沒有任何報告。': 'No reports yet.',
  '產生於 {date}': 'Generated {date}',
  '刪除這份報告': 'Delete this report',
  '刪除這份報告？': 'Delete this report?',
  '刪除後無法復原。刪除不會退回本月的份數。': 'This cannot be undone. Deleting does not give back this month\'s report count.',
  '已刪除這份報告': 'Report deleted',
  '刪除失敗，請稍後再試': "Couldn't delete. Please try again later.",

  // ---- report viewer ----
  '由 AI 依你的紀錄整理的回顧報告，只有你看得到。': 'A review written by AI from your records. Only you can see it.',
  '這段時間的節奏': 'Your rhythm in this period',
  '這段期間你完成了': 'In this period you completed',
  '開了': 'You had',
  '場會。': ' meetings.',
  '專注計時器另外記下': 'The focus timer logged another',
  '分鐘。': ' minutes.',
  '做了哪些事': 'What you got done',
  '時間花在哪': 'Where the time went',
  '還掛著的事': 'Still open',
  '一兩句觀察': 'A quiet observation',
  '文字由 AI 依你的紀錄整理，只有你看得到；數字以 Huddle 計算為準。':
    "The text is written by AI from your records and only you can see it. Numbers are Huddle's own calculation.",
  '本月還能產生 {n} 次。': 'You can generate {n} more this month.',

  // ---- withdraw / settings ----
  '撤回 AI 回顧的同意？': 'Withdraw your AI Review consent?',
  '撤回之後不會再傳送新的內容；已經送出的內容無法收回。既有的報告仍可查看與刪除。下次要用時會重新請你確認。':
    'After you withdraw, no new content is sent. Content already sent cannot be recalled. Existing reports can still be viewed and deleted. You will be asked to confirm again next time you use it.',
  '同時刪除我所有的 AI 回顧報告（無法復原）': 'Also delete all my AI Review reports (cannot be undone)',
  '已撤回同意，並刪除 {n} 份報告': 'Consent withdrawn, and {n} {n|report|reports} deleted',
  '已撤回同意': 'Consent withdrawn',
  '你已同意 AI 回顧：只有在你按下「產生報告」時，才會把所選期間的內容送給 OpenAI（美國）。':
    'You have agreed to AI Review: content from the period you choose is sent to OpenAI (United States) only when you tap "Generate report".',
  '也納入 AI 會議整理的重點': 'Also include AI meeting summary highlights',
  '會議重點可能包含與會者的姓名與發言。': 'Meeting highlights may include attendees\' names and what they said.',
  '你還沒有同意 AI 回顧。第一次按「產生報告」時，會先請你確認內容。':
    'You have not agreed to AI Review yet. The first time you tap "Generate report", you will be asked to confirm.',

  // ---- error messages ----
  '本月的 AI 回顧份數已用完。下次重置日：{date}。': "You've used all your AI Review reports this month. Next reset: {date}.",
  '本月的 AI 回顧份數已用完。下個月 1 日（台北時間）重新計算。': "You've used all your AI Review reports this month. The count resets on the 1st of next month (Taipei time).",
  '一小時內試了太多次，請 {time} 之後再試。': "You've tried too many times in the last hour. Please try again after {time}.",
  '一小時內試了太多次，請稍後再試。': "You've tried too many times in the last hour. Please try again later.",
  '本月的嘗試次數已達上限（失敗也會計入）。下次重置日：{date}。': "You've reached this month's attempt limit (failed attempts count too). Next reset: {date}.",
  '本月的嘗試次數已達上限（失敗也會計入）。下個月 1 日（台北時間）重新計算。': "You've reached this month's attempt limit (failed attempts count too). It resets on the 1st of next month (Taipei time).",
  '已經有一份報告正在產生中，請等它完成。': 'A report is already being generated. Please wait for it to finish.',
  '這個請求已經送出過了，請重新按一次「產生報告」。': 'This request was already sent. Please tap "Generate report" again.',
  '產生途中你的同意設定有變動，這次沒有存檔。請再按一次「產生報告」。': 'Your consent settings changed while generating, so nothing was saved. Please tap "Generate report" again.',
  '同意畫面的版本已更新，請重新整理頁面後再試。': 'The consent screen has been updated. Please refresh the page and try again.',
  '這段期間的內容裡含有圖片編碼（例如貼進便條紙的圖片資料），為了安全，這次整份都沒有送出，也沒有扣掉你的份數。請改選其他期間，或先清掉那段內容。':
    "This period contains encoded image data (for example, image data pasted into a sticky note). For safety nothing was sent, and no report was used up. Please pick another period or clear that content first.",
  '這次沒能完成報告，沒有扣掉你的份數。請稍後再試。': "The report couldn't be completed this time, and no report was used up. Please try again later.",
  '等了太久，這次沒有產生報告，也沒有扣掉你的份數。請稍後再試。': 'It took too long, so no report was generated and none was used up. Please try again later.',
  'AI 回顧目前沒有開放。': 'AI Review is not available right now.',
  'AI 回顧今天的使用量很高，暫時停止服務。請明天再試。': 'AI Review is very busy today and is paused for now. Please try again tomorrow.',
  '暫時讀不到你的紀錄，這次沒有扣掉你的份數。請稍後再試。': "Couldn't read your records right now, and no report was used up. Please try again later.",
  '訪客帳號無法使用 AI 回顧，請先登入正式帳號。': 'AI Review is not available for guest accounts. Please sign in with a full account.',
  '連不上伺服器，請檢查網路後再試。': "Can't reach the server. Please check your connection and try again.",
  '這次請求沒有成功，請重新整理頁面後再試。': "That request didn't go through. Please refresh the page and try again.",

  // ---- consent screen (shared by AI Review and AI meeting import) ----
  '不同意': 'Decline',
  '同意並繼續': 'Agree and continue',
  '資料與隱私說明': 'Data & Privacy',
  '我已滿 18 歲，或已取得法定代理人同意。': "I am 18 or older, or I have my parent's or legal guardian's consent.",
  '會議重點可能包含與會者的姓名與發言。打開前，請確認你可以這樣使用這些內容。':
    "Meeting highlights may include attendees' names and what they said. Please make sure you may use that content this way before turning it on.",
  '誰在處理': 'Who processes it',
  'Huddle 由 {name} 營運。聯絡方式：{email}。': 'Huddle is operated by {name}. Contact: {email}.',
  '其他個人資料的請求，請聯絡 {email}。': 'For other personal data requests, contact {email}.',
  '用途': 'Purpose',
  '會送出的內容': 'What is sent',
  '不會送出的內容': 'What is not sent',
  '送給誰、送到哪裡': 'Who receives it, and where',
  '保留多久': 'How long it is kept',
  '你可以做的事': 'What you can do',
  '不同意會怎樣': 'If you decline',
  '提醒': 'Note',

  // AI Review
  '開啟 AI 回顧之前': 'Before you turn on AI Review',
  'AI 回顧會把你的部分內容送給第三方 AI 服務來寫報告。請先看完下面的說明，再決定要不要使用。':
    'AI Review sends some of your content to a third-party AI service to write your report. Please read this before deciding.',
  '只用來產生一份給你自己看的回顧報告，不做其他用途。': 'Only to generate a review report for you. Nothing else.',
  '你在所選期間內自己建立的：': 'From the period you choose, items you created yourself:',
  '任務的標題、說明、備註、分類、日期與完成狀態': 'Tasks: title, description, notes, category, dates and completion status',
  '便條紙的文字': 'Sticky note text',
  '專注白板的文字與待辦': 'Focus whiteboard text and to-dos',
  '行事曆時間區塊與專注紀錄': 'Calendar time blocks and focus records',
  '圖片與手寫、記事本、Google 日曆事件、別人指派給你的任務、會議連結、地點、與會者名單、會議逐字稿。':
    'Images and handwriting, Notebook, Google Calendar events, tasks other people assigned to you, meeting links, locations, attendee lists, and meeting transcripts.',
  '你接受別人的會議指派而產生的任務，只會送出標題、完成狀態、完成時間、截止日與排程時間。':
    "For tasks created when you accepted someone's meeting assignment, only the title, completion status, completion time, due date, and scheduled time are sent.",
  'OpenAI（第三方 AI 服務），在美國處理。只有在你按下「產生報告」時才會傳送。':
    'OpenAI (a third-party AI service), processed in the United States. Content is sent only when you tap "Generate report".',
  'OpenAI 預設不會用這些內容訓練模型。為了偵測濫用，OpenAI 可能保留最長 30 天的紀錄；法律要求時可能更久。':
    'By default OpenAI does not use this content to train its models. To detect abuse, OpenAI may keep logs for up to 30 days, or longer where the law requires.',
  '產生的報告存在 Huddle，直到你刪除報告或刪除帳號。': 'Generated reports are stored in Huddle until you delete the report or your account.',
  '你可以隨時在「設定」撤回同意，也可以刪除任何一份報告。撤回之後不會再傳送新的內容；已經送出的內容無法收回。':
    'You can withdraw consent in Settings at any time and delete any report. After you withdraw, no new content is sent; content already sent cannot be recalled.',
  '只是不能使用 AI 回顧。Huddle 的其他功能照常使用。': "You simply can't use AI Review. Everything else in Huddle works as usual.",
  'AI 產生的內容可能有誤。你的內容如果含有他人資訊或敏感資訊（例如健康、財務），請自行斟酌是否使用。':
    "AI-generated content may contain mistakes. If your content includes other people's information or sensitive information (such as health or finances), please consider whether to use this feature.",

  // AI meeting import
  '使用 AI 會議整理之前': 'Before you use AI meeting summary',
  'AI 會議整理會把你貼上的內容送給第三方 AI 服務來整理重點。請先看完下面的說明。':
    'AI meeting summary sends the content you paste to a third-party AI service to pull out the key points. Please read this first.',
  '只用來整理這場會議的重點、決議與建議任務。': 'Only to summarize this meeting\'s key points, decisions and suggested tasks.',
  '你貼上的會議逐字稿或筆記、會議標題與日期、你填寫的與會者姓名與所屬組織。':
    'The meeting transcript or notes you paste, the meeting title and date, and the attendee names and organizations you enter.',
  'OpenAI（第三方 AI 服務），在美國處理。只有在你按下「整理」時才會傳送。':
    'OpenAI (a third-party AI service), processed in the United States. Content is sent only when you tap "Summarize".',
  '你貼上的內容與整理結果會存在 Huddle。你可以隨時在每筆會議紀錄刪除逐字稿原文；整理結果會保留到你刪除帳號。':
    'The content you paste and the summary are stored in Huddle. You can delete the original transcript from any meeting record at any time; the summary is kept until you delete your account.',
  '你可以隨時在「設定」撤回同意。撤回之後不會再傳送新的內容；已經送出的內容無法收回。':
    'You can withdraw consent in Settings at any time. After you withdraw, no new content is sent; content already sent cannot be recalled.',
  '只是不能使用 AI 會議整理。Huddle 的其他功能照常使用。': "You simply can't use AI meeting summary. Everything else in Huddle works as usual.",
  'AI 產生的內容可能有誤。逐字稿通常包含其他與會者的姓名與發言，請確認你可以這樣使用，並避免貼上他人未同意分享的機密或敏感內容。':
    "AI-generated content may contain mistakes. Transcripts usually include other attendees' names and what they said. Please make sure you may use them this way, and avoid pasting confidential or sensitive content that others have not agreed to share.",
}
