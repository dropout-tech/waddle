// English dictionary fragment — keys are the Traditional Chinese source strings.
export const dict: Record<string, string> = {
  // report-dashboard.tsx
  '回顧': 'Review',
  '慢慢回頭看，走過的都算數': 'Take your time looking back — every step counted',
  '週': 'Week',
  '月': 'Month',
  '季': 'Quarter',
  '年': 'Year',
  '本週': 'This week',
  '上週': 'last week',
  '本月': 'This month',
  '上月': 'last month',
  '本季': 'This quarter',
  '上季': 'last quarter',
  '今年': 'This year',
  '去年': 'last year',
  '{label}還沒有留下紀錄': '{label} has nothing recorded yet',
  '等你記下第一件事，Huddle 就開始幫你回顧': 'Once you jot down your first thing, Huddle will start looking back with you',
  '{label}的節奏': "{label}'s rhythm",
  '{label}你完成了': '{label}, you completed',
  '件事，大多在{clause}。': ' things, mostly in the {clause}.',
  '件事。': ' things.',
  '比{prevLabel}多完成了{diff}件。': "That's {diff} more than {prevLabel}.",
  '和{prevLabel}的步調差不多。': 'About the same pace as {prevLabel}.',
  '比{prevLabel}少一些——節奏本來就有起伏，沒關係。': "A bit less than {prevLabel} — rhythms naturally ebb and flow, that's okay.",
  '留給自己的專注時間約': 'You gave yourself about',
  '小時。': ' hours of focus time.',
  '小時，比{prevLabel}多了一點。': ' hours of focus — a little more than {prevLabel}.',
  '小時，比{prevLabel}短一些。': ' hours of focus — a bit less than {prevLabel}.',
  '{label}你記下了': '{label}, you noted down',
  '件事，還沒有完成的紀錄——正在進行，也是一種前進。': ' things — nothing finished yet, but being in progress is its own kind of progress.',
  '每日完成 · 最近 {n} 天': 'Daily completions · last {n} days',
  '時間都花在哪': 'Where the time went',
  '會議': "Meeting",
  '小時': 'hours',
  '專注': 'Focus',
  '沒有會議打擾': 'no meetings to interrupt',
  '{label}還沒有排上時間軸的事。想試著把一件事放進日曆看看嗎？': '{label} has nothing on the timeline yet. Want to try putting something on the calendar?',
  '完成的事': 'Things completed',
  '{label}還沒有完成的紀錄。沒關係，正在進行也是一種前進。': "{label} has no completions yet. That's okay — being in progress is its own kind of progress.",
  'Huddle 的觀察': "Huddle's take",
  '{label}有超過一半的排程時間在會議裡。也許可以幫自己留一段不被打擾的專注時光。': '{label} had more than half your scheduled time in meetings. Maybe carve out some uninterrupted focus time for yourself.',
  '{phase} {display} 點左右的你最有進展，把重要的事留給那段時間，也許會更輕鬆。': 'You tend to make the most progress around {display} in the {phase} — save the important stuff for that window, it might feel easier.',
  '有 {overdueCount} 件事悄悄過了原本的日期。不用急，挑一件最想完成的開始就好。': '{overdueCount} things have quietly slipped past their date. No rush — just pick the one you most want to finish and start there.',
  '{label}比{prevLabel}更有節奏了，保持這個舒服的步調就好。': '{label} found more rhythm than {prevLabel} — just keep up this comfortable pace.',
  '不論快慢，{label}走過的每一步都算數。': 'Fast or slow, every step counts — {label} still moved forward.',
  '{label}還沒有完成的紀錄。沒關係，慢慢來，Huddle 會在這裡陪你。': "{label} has nothing completed yet. That's okay, take your time — Huddle will be here with you.",
  '早上': 'morning',
  '下午': 'afternoon',
  '晚上': 'evening',
  '今天': 'Today',
  '昨天': 'Yesterday',
  '{n} 件': '{n} tasks',
  '{full} {n} 件': '{full}: {n}',
  '每日完成數量：{items}': 'Daily completions: {items}',
  '{full}：完成 {n} 件': '{full}: {n} completed',
  '一天之中排程活動的分佈': 'Distribution of scheduled activity throughout the day',
  '{hour}:00 · {n} 件': '{hour}:00 · {n} tasks',
  '{n} 分鐘': '{n} min',
  '{n} 小時': '{n}h',

  // notification-center.tsx
  '{n} 天前': '{n} days ago',
  '{n} 週前': '{n} weeks ago',
  '{n} 個月前': '{n} months ago',
  '{n} 年前': '{n} years ago',
  '{n} 個任務已經放了一陣子': '{n} tasks have been sitting for a while',
  '最久的一件是{time}的。有些也許已經不用做了——放心整理掉，留下真正想做的就好。':
    'The oldest one is from {time}. Some of these might not need doing anymore — feel free to clear them out and keep what you actually want to do.',
  '整理任務': 'Clean up tasks',
  '{n} 個任務剛過了預定日': '{n} tasks just passed their due date',
  '日子過了也沒關係，挑個合適的時段重新安排就好。': "It's fine that the date passed — just pick a new time that works.",
  '查看任務': 'View tasks',
  '今天排了 {n} 件事': "{n} things on today's schedule",
  '還有時間，可以慢慢做——一件一件來就好。': "There's still time — take it one thing at a time.",
  '{n} 個任務這幾天到期': '{n} tasks are due in the next few days',
  '接下來三天會陸續到期，先挑個順手的時段放上日曆，到時候就從容多了。':
    "These are due over the next three days — put them on the calendar at a time that works, and you'll feel more at ease when they arrive.",
  '{n} 個任務靜靜躺了兩週': '{n} tasks have been quietly sitting for two weeks',
  '還想做的話，挑個日子放上日曆；不想做了也沒關係，歸檔就好。':
    "If you still want to do them, pick a day and put them on the calendar. If not, that's fine too — just archive them.",
  '急件好像有點多': 'Quite a few urgent items',
  '有 {n} 個任務都標了高優先。全部都急，反而不知道從哪開始——挑出真正的前幾名，其他的緩緩也可以。':
    "{n} tasks are marked high priority. When everything's urgent, it's hard to know where to start — pick out the real top few and let the rest wait.",
  '調整優先順序': 'Adjust priorities',
  '多數任務未排程': 'Most tasks are unscheduled',
  '有 {n} 個任務還沒排到日曆上。挑個時段放進去，比較容易把事情做完。':
    "{n} tasks haven't made it onto the calendar yet. Pick a time slot for them — it's easier to get things done that way.",
  '排程任務': 'Schedule tasks',
  '通知 ({n})': 'Notifications ({n})',
  '通知': 'Notifications',
  '通知中心': 'Notification Center',
  '一切順利！': 'All clear!',
  '目前沒有需要注意的事項': 'Nothing needs your attention right now',
  '還有 {n} 個任務...': '{n} more tasks...',
  '全部歸檔': 'Archive all',

  // onboarding-tour.tsx — chrome
  '新手導覽': 'Onboarding tour',
  '關閉導覽': 'Close tour',
  '上一步': 'Back',
  '下一步': 'Next',
  '略過導覽': 'Skip tour',
  '導覽進度': 'Tour progress',
  '套用模板': 'Use a template',
  '工作、個人、學習三個工作區，分類已排好，任務你來填':
    'Three workspaces (Work, Personal, Learning) with categories ready to go; you fill in the tasks',
  '空白開始': 'Start blank',
  '一個空工作區，從零開始打造你自己的結構': 'One empty workspace — build your own structure from scratch',

  // Used outside the tour (kept here from the original tour block).
  '匯出行程圖檔': "Export schedule image",
  '專注白板': "Focus board",

  // onboarding-tour.tsx — step titles. Titles that are plain feature names
  // (白板 / 記事本 / 便條紙 / 更多工具 / 通知中心 / 專注計時 / 懸浮小視窗 /
  // 常用連結 / 新增任務) reuse the feature's own dictionary entry, so the
  // title always reads the same as the label on screen.
  '歡迎來到 Huddle': 'Welcome to Huddle',
  '左邊：任務清單': 'Left side: your task list',
  '「任務」分頁': 'The Tasks tab',
  '完成任務、打開任務': 'Check off or open a task',
  '點一下編輯，長按拖到日曆': 'Tap to edit, long-press to drag to the calendar',
  '會議、整理、完成': 'Meeting, Review, Done',
  '🔄 左邊 = 右邊': '🔄 Left = right',
  '日曆：上面待排程，下面時間軸': 'Calendar: unscheduled on top, timeline below',
  '🤚 拖曳就是排程': '🤚 Drag to schedule',
  '🤚 左右滑動': '🤚 Swipe left and right',
  '切換日、週、月': 'Switch between Day, Week and Month',
  '📅 每日簽到': '📅 Daily check-in',
  '📅 每日簽到 ＆ 會議轉任務': '📅 Daily check-in & Meetings to tasks',
  '右上角：帳號選單': 'Top right: account menu',
  '🗒️ 會議轉任務': '🗒️ Meetings to tasks',
  '更多工具都在「⋯」': 'More tools live in "⋯"',
  '底部五個分頁': 'Five tabs at the bottom',
  '💧 喝水小提醒': '💧 Water reminder',
  '✨ 你準備好了！': "✨ You're all set!",

  // onboarding-tour.tsx — hints
  '👉 試試點一下這個任務': '👉 Try clicking this task',
  '👉 點點看，切換不同檢視': '👉 Click to try another view',
  '👉 點開試試': '👉 Give it a try',
  '👉 點開計時器': '👉 Open the timer',

  // onboarding-tour.tsx — step bodies shared by the desktop and phone tours
  '任務、行事曆、專注計時和日記，都放在同一個地方。花一兩分鐘帶你走一圈，隨時可以略過。':
    'Tasks, calendar, focus timer and journal, all in one place. Take a minute or two to look around; you can skip at any time.',
  '所有任務都收在這裡，分成三層：工作區 → 分類 → 任務。最上面的「未分類」是收件匣，還沒決定放哪的任務會先到這裡。':
    'Every task lives here, in three layers: workspace → category → task. "Uncategorized" at the top is your inbox: tasks you have not filed yet land there first.',
  '「會議」列出今天的會議，可以直接加入視訊。有任務過了原訂時間，這裡會出現「整理」，讓你逐一重新安排。「完成」可以回顧做完的任務和統計。':
    '"Meeting" lists today\'s meetings so you can join the call directly. When tasks slip past their planned time, "Review" appears here so you can reschedule them one by one. "Done" lets you look back at finished tasks and your stats.',
  '設定一段時間，專心做一件事；預設是 25 分鐘的番茄鐘。可以搭配背景音樂或環境音，例如雨聲、海浪、咖啡廳。結束後會自動記到今天的日曆。':
    'Set a stretch of time and focus on one thing; the default is a 25-minute Pomodoro. Add music or ambient sound such as rain, waves or a cafe. When it ends, the session is logged on today\'s calendar automatically.',
  '每 60 分鐘，Huddle 會提醒你喝口水。想晚點再喝，按「再過一下」，五分鐘後再提醒。間隔可以在「設定」調整，也可以整個關掉。':
    'Every 60 minutes, Huddle reminds you to drink some water. Not now? Press "Snooze" and it comes back in five minutes. Change the interval in Settings, or turn it off entirely.',
  '角落這隻企鵝是你專屬的。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。牠偶爾會提醒你會議和過期的任務，但多半只是在說些荒謬的話。':
    'The penguin in the corner is yours. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu. Now and then it reminds you about meetings and overdue tasks, but mostly it just says absurd things.',
  '導覽結束後，你可以領養一隻專屬企鵝，牠會住在畫面角落。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。':
    'After the tour you can adopt a penguin of your own, and it will live in the corner of the screen. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu.',
  '打開任務，按右上角的小人圖示，就能把任務交給共享夥伴或組織成員。任務會出現在對方的清單和日曆；對方完成或退回，你都看得到。進度在帳號選單的「指派任務」；建立組織需要 Pro 會員。':
    'Open a task and use the person icon at the top right to hand it to a sharing partner or an organization member. It shows up in their list and calendar, and you can see when they finish it or send it back. Track progress under "Assignments" in the account menu; creating an organization requires Pro.',
  '最後一步：你想怎麼開始？': 'Last step: how do you want to start?',

  // onboarding-tour.tsx — step bodies (desktop)
  '點左邊的圓圈，任務就完成了。點任務名稱可以打開編輯：改時間、寫備註，或把它設成「會議」。':
    'Click the circle on the left to mark a task done. Click its name to open it and change the time, add notes, or mark it as a meeting.',
  '左邊的清單和右邊的日曆，看的是同一批任務。在任何一邊完成、修改或刪除，另一邊會立刻跟著變。':
    'The list on the left and the calendar on the right show the same tasks. Complete, edit or delete something on one side and the other updates right away.',
  '每天最上面那一格，放「有日期、還沒排時間」的任務；下面的時間軸，放排好時間的任務。任務前面會標出所屬分類，方便一眼分辨。想和夥伴互看行事曆，按上方工具列的「共享」。':
    'The strip at the top of each day holds tasks that have a date but no time yet; the timeline below holds tasks with a set time. Each task is labelled with its category so you can tell them apart at a glance. To see each other\'s calendars with a partner, use "Sharing" in the toolbar above.',
  '把任務拖到時間軸，就排好時間；拖回最上面那一格，就取消時間。在時間軸空白處點兩下，可以直接新增任務。重複的任務換時間時，Huddle 會問你只改這一天，還是之後也一起改。':
    'Drag a task onto the timeline to give it a time; drag it back to the top strip to clear the time. Double-click an empty spot on the timeline to add a task right there. When you move a repeating task, Huddle asks whether to change just that day or the later ones too.',
  '看細節用「日」，排一週用「週」，看整個月用「月」。':
    'Day for the details, Week for planning, Month for the big picture.',
  '工作到一半冒出想法？拉開白板，隨手記下文字、待辦、圖片或連結。每天一張新的，之前的也翻得回去。':
    'Had an idea mid-task? Pull down the whiteboard and jot text, to-dos, images or links. You get a fresh board each day, and can flip back to earlier ones.',
  '想寫長一點的筆記，點這裡。打字時輸入「/」，可以插入標題、待辦清單、圖片等區塊；選取文字，會跳出粗體、連結等格式按鈕。':
    'For longer notes, click here. Type "/" while writing to insert blocks such as headings, to-do lists and images; select text to bring up formatting like bold and links.',
  '按一下，畫面上會多一層便條紙，換頁也不會消失。便條紙可以拖動、換顏色；暫時用不到的，收進旁邊的「收納」。':
    'Click to lay sticky notes over the screen; they stay put when you change pages. Drag them around or change their color, and tuck the ones you do not need right now into the drawer next to this button.',
  '這個小箭頭裡收著日記、報告、每日簽到、匯出等功能。「匯出」可以把行程存成圖片分享；開啟隱私模式，就只顯示時段、不顯示任務名稱。':
    'This little arrow holds Journal, Reports, Daily check-in, Export and more. Export saves your schedule as an image to share; turn on privacy mode to show time blocks without task names.',
  '同一個選單裡的「每日簽到」：每天簽到一次，累積分數。頁面下方有匿名排行榜，只顯示小企鵝編號，不顯示帳號。':
    '"Daily check-in" is in the same menu: check in once a day to earn points. Further down that page is an anonymous leaderboard that shows penguin numbers, never account names.',
  '鈴鐺會提醒你快到期、已過期，或放了很久沒動的任務。有新提醒時，鈴鐺上會出現數字。':
    'The bell flags tasks that are due soon, overdue, or have sat untouched for a while. A number appears on it when there is something new.',
  '點頭像打開選單：帳號資料、會員與推薦、深色模式和登出都在這裡。另外，按 ⌘K 或 Ctrl+K 可以快速搜尋任務，按「?」可以看所有快捷鍵。':
    'Click your avatar to open the menu: account details, Membership & Referrals, dark mode and log out are all here. Also, press ⌘K or Ctrl+K to search your tasks quickly, and "?" to see every shortcut.',
  '同一個選單裡的「會議轉任務」：貼上會議逐字稿或筆記，Huddle 會幫你整理出待辦，並標出負責人和期限。':
    '"Meetings to tasks" is in the same menu: paste a meeting transcript or notes and Huddle turns them into to-dos, picking out owners and due dates.',
  '按這個按鈕，會跳出一個永遠在最上層的小視窗，切到別的軟體也看得到。裡面有計時器、記事本和白板三個分頁。':
    'This button opens a small window that always stays on top, even when you switch to another app. Inside are three tabs: Timer, Notebook and Whiteboard.',
  '把常開的網址放在這裡，例如 Notion、GitHub、Gmail。點一下，就在新分頁打開。':
    'Keep the sites you open most here, such as Notion, GitHub or Gmail. One click opens them in a new tab.',

  // onboarding-tour.tsx — step bodies (phone)
  '點左邊的圓圈完成任務，點任務名稱打開編輯。長按任務再拖動，可以直接排進日曆。':
    'Tap the circle on the left to mark a task done, or tap its name to open it. Long-press a task and drag to put it straight onto the calendar.',
  '在「任務」分頁往左滑，會切到日曆。在日曆裡左右滑，可以往前、往後翻日期。':
    'Swipe left on the Tasks tab to switch to the calendar. Inside the calendar, swipe left or right to move between dates.',
  '每天最上面那一格，放「有日期、還沒排時間」的任務；下面的時間軸，放排好時間的任務。任務前面會標出所屬分類，方便一眼分辨。想和夥伴互看行事曆，到右上角「⋯」裡的「共享」。':
    'The strip at the top of each day holds tasks that have a date but no time yet; the timeline below holds tasks with a set time. Each task is labelled with its category so you can tell them apart at a glance. To see each other\'s calendars with a partner, open "Sharing" under "⋯" at the top right.',
  '通知、帳號、記事本、便條紙和設定，都收在右上角的「⋯」。有新通知時，「⋯」上會出現數字。':
    'Notifications, Account, Notebook, Sticky notes and Settings are all tucked into "⋯" at the top right. A number appears on "⋯" when there is something new.',
  '按這顆「＋」新增任務。也可以在時間軸的空白處點兩下，直接在那個時段建立。':
    'Tap "+" to add a task. Or double-tap an empty spot on the timeline to create one right in that slot.',
  '「重點」看各分類的進度，「任務」是完整清單，「白板」隨手記想法，「日曆」排時間，「連結」放常開的網址。':
    'Focus shows progress by category, Tasks is the full list, Whiteboard is for quick notes, Calendar is for scheduling, and Links holds the sites you open most.',
  '「⋯」裡的「每日簽到」：每天簽到一次，累積分數。「⋯」→「帳號」→「會議轉任務」：貼上會議逐字稿，Huddle 會幫你整理出待辦。':
    'Daily check-in, under "⋯": check in once a day to earn points. Meetings to tasks, under "⋯" then Account: paste a meeting transcript and Huddle turns it into to-dos.',
}
