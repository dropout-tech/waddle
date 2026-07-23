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
  '慢慢搖擺，把事情做完': "Take it slow, get it done.",

  // onboarding-tour.tsx
  '新手導覽': 'Onboarding tour',
  '關閉導覽': 'Close tour',
  '上一步': 'Back',
  '下一步': 'Next',
  '略過導覽': 'Skip tour',
  '套用模板': 'Use a template',
  '工作 / 個人 / 學習 三個工作區，分類已排好，任務你來填':
    'Three workspaces — Work / Personal / Learning — with categories ready to go; you fill in the tasks',
  '空白開始': 'Start blank',
  '一個空工作區，從零開始打造你自己的結構': 'One empty workspace — build your own structure from scratch',

  // onboarding-tour.tsx — tour step titles
  '歡迎來到 Huddle': 'Welcome to Huddle',
  '左側：三層結構': 'Left side: three layers',
  '勾選 / 點開任務': 'Check off / open a task',
  '今日會議 ＆ 已完成': "Today's meetings & completed",
  '🔄 左邊 = 右邊': '🔄 Left = right',
  '日曆：上方待排程 / 下方時間軸': 'Calendar: unscheduled above / timeline below',
  '🤚 拖曳就是排程': '🤚 Drag to schedule',
  '切換 日 / 週 / 月': 'Switch Day / Week / Month',
  '匯出行程圖檔': "Export schedule image",
  '專注白板': "Focus board",
  '專注計時器 ＋ 背景音': 'Focus timer + background sound',
  '💧 喝水小提醒': '💧 Water reminder',
  '常用連結（最底下）': 'Quick links (at the very bottom)',
  '右上角：使用者選單': 'Top right: user menu',
  '✨ 你準備好了！': "✨ You're all set!",
  '任務分頁': 'Tasks tab',
  '點任務 = 編輯，長按 = 拖到日曆': 'Tap a task to edit, long-press to drag to the calendar',
  '🤚 左右滑動': '🤚 Swipe left / right',
  '✨ 底部四分頁': '✨ Four tabs at the bottom',

  // onboarding-tour.tsx — tour step bodies & hints (desktop)
  '整合任務、時間排程、專注計時、日記反思的工作面板。慢慢搖擺，把事情做完。90 秒帶你走過。':
    'One workspace for tasks, scheduling, focus time, and journaling. Take it slow and get things done. Takes about 90 seconds.',
  '工作區（工作 / 個人 / 學習）→ 分類（本週 / 待辦…）→ 任務。所有任務都在這。工作區標題右邊的「＋」可以新增分類；上方篩選列還能切換「精簡 / 舒適」兩種密度，任務多的時候切精簡一次看更多。':
    'Workspaces (Work / Personal / Learning) → categories (This week / To-do…) → tasks. Everything lives here. The "+" next to a workspace name adds a category; the filter bar above can switch between Compact and Comfortable density — switch to Compact when you have a lot of tasks to see more at once.',
  '左邊圈圈 = 完成；點任務本身 = 打開詳細編輯。打開後可以把任務標為「會議」，會多三個欄位（參與者 / 地點 / 視訊連結）。':
    'The circle on the left marks it done; tapping the task itself opens the detail editor. Once open, you can mark it as a Meeting to reveal three more fields (attendees / location / video link).',
  '👉 試試點一下這個任務': '👉 Try tapping this task',
  '左邊 chip 顯示今天還剩幾場會議，點開可一鍵加入視訊。右邊「已完成」進到專屬抽屜，內含 KPI 統計（連續天數、平均耗時）。':
    "The chip on the left shows how many meetings are left today — tap it to join the video call with one tap. Completed on the right opens a dedicated drawer with stats (streak days, average time to finish).",
  '左側清單和右側日曆是**同一份資料的兩種視圖**。在任一邊改動（完成、編輯、刪除）都會即時同步，不會重複。':
    'The list on the left and the calendar on the right are **two views of the same data**. Changes on either side (complete, edit, delete) sync instantly — nothing gets duplicated.',
  "每一天上方那條是「待排程」（有日期沒時間）；下方時間軸是「已排時間」的任務。日曆上的任務會自動冠上分類（例：Let's Play｜夏令營），一眼看出屬於哪個分類；不想要可在設定關掉。另外在「設定 → 共享」可以邀請夥伴互看行事曆，對方開放的行程會疊加顯示在這裡。":
    "The strip at the top of each day is Unscheduled (has a date, no time); the timeline below is for Scheduled tasks. Tasks on the calendar automatically get tagged with their category (e.g. Let's Play | Summer Camp) so you can tell at a glance — turn it off in Settings if you don't want it. You can also invite a partner in Settings → Sharing to see each other's calendars — whatever they share overlays right here.",
  '把任務拖到時間軸 = 排時間。從時間軸拖回上方待排程 = 取消時間（日期保留）。每週循環的任務拖到別的時間時，Huddle 會問你：只改這一天、改這天與之後、還是改所有循環 — 像 Google 日曆一樣自由。':
    'Drag a task onto the timeline to schedule it. Drag it back up to Unscheduled to clear the time (the date stays). Drag a recurring task to a new time and Huddle will ask: just this day, this day and after, or all occurrences — as flexible as Google Calendar.',
  '看細節用日、週計畫用週、看大局用月。試試看。': 'Day for the details, Week for planning, Month for the big picture. Give it a try.',
  '👉 點看看其他視圖': '👉 Try switching views',
  '挑日期範圍，產出乾淨的 PNG，適合分享到 LINE / IG / Slack。隱私模式可以只顯示時段顏色不洩漏內容。':
    'Pick a date range to generate a clean PNG — great for sharing to LINE / IG / Slack. Privacy mode shows only time-block colors without revealing the content.',
  '上方鈴鐺集中放 Huddle 要跟你說的事：已逾期、快到期、放太久沒動的任務，偶爾也有小提醒。有事情時會出現數字小標，看完可以逐則關掉。':
    "The bell up top gathers everything Huddle wants to tell you: overdue, due-soon, and untouched-for-too-long tasks, plus the occasional gentle nudge. A number badge shows up when there's something to see, and you can dismiss each one once you've read it.",
  'Notion 式的長文筆記空間——打字時輸入「/」就能叫出區塊選單（標題／待辦／清單／收合／引言…），選取文字則會跳出格式工具列。跟每天的白板分開存，工具列上有常駐入口，想寫長一點的東西點這裡。':
    "A Notion-style space for long-form notes — type / to summon the block menu (heading / to-do / list / toggle / quote…), or select text to bring up the formatting toolbar. It's kept separate from the daily scratchpad, with a permanent toolbar entry whenever you want to write something longer.",
  '工作中冒出靈感？拉開白板丟文字、貼圖、連結，事後還能隨手編輯。每天分開存。':
    'Got an idea mid-work? Pull open the scratchpad and drop in text, images, or links — you can tidy it up later. Each day gets its own space.',
  '👉 點開試試': '👉 Give it a try',
  '右下角番茄鐘，設定 25 分鐘專心做一件事。展開後可以挑背景音樂（Lo-fi、雨聲、咖啡店白噪音…）配著做事，結束時 Huddle 會輕輕提醒你。':
    'A Pomodoro timer in the bottom right — set 25 minutes to focus on one thing. Expand it to pick background sound (Lo-fi, rain, coffee-shop noise…) to work alongside, and Huddle will gently nudge you when time is up.',
  '👉 點開計時器': '👉 Open the timer',
  '預設每 60 分鐘，Huddle 會跳出來提醒你喝口水。可以選「再過一下」snooze 五分鐘，或在設定裡改成 30/90/120 分鐘，不想要也可以關掉。':
    'Every 60 minutes by default, Huddle will pop up to remind you to drink some water. Choose Snooze for 5 more minutes, change the interval to 30/90/120 minutes in Settings, or turn it off entirely.',
  '螢幕底下那條薄薄的「常用連結」可以拉開，放上你常開的網址（Notion、GitHub、Gmail 之類）。點一下開新分頁，編輯按右上角小鉛筆。':
    'That thin strip at the bottom of the screen pulls open into Quick Links — add the URLs you visit often (Notion, GitHub, Gmail, that sort of thing). Tap one to open it in a new tab; edit via the little pencil in the top right.',
  '點開有你的帳號資訊、深淺色切換與登出。桌面上按 ⌘K 隨時召喚指令面板（搜任務、切視圖、開記事本）；按 ? 看完整快捷鍵。':
    'Open it for your account info, light/dark mode toggle, and sign out. On desktop, press ⌘K anytime to summon the command palette (search tasks, switch views, open Notebook); press ? to see all keyboard shortcuts.',
  '最後一步：你想怎麼開始？': 'Last step: how do you want to start?',

  // onboarding-tour.tsx — tour step bodies (mobile-only variants)
  '整合任務、時間排程、專注計時、日記反思的工作面板。慢慢搖擺，把事情做完。':
    'One workspace for tasks, scheduling, focus time, and journaling. Take it slow and get things done.',
  '工作區 → 分類 → 任務的三層結構。所有任務都在這。工作區標題右邊的「＋」可以新增分類。':
    'Three layers: workspaces → categories → tasks. Everything lives here. The "+" next to a workspace name adds a category.',
  '輕點任務開啟詳細頁；長按 0.3 秒後拖移可以直接排到日曆上的時間。打開後可以把任務標為「會議」，會多參與者 / 地點 / 視訊連結。':
    'Tap a task to open its detail page; long-press for 0.3s then drag to schedule it directly onto the calendar. Once open, you can mark it as a Meeting to add attendees / location / video link.',
  '今日會議 chip 點開可以一鍵加入視訊；已完成抽屜含 KPI（連續天數、平均耗時）。日曆頁右上「⋯」選單裡還有「匯出行程」可以產 PNG 分享。':
    "Tap the today's-meetings chip to join a video call with one tap; the Completed drawer has stats (streak days, average time to finish). The calendar page's top-right ⋯ menu also has Export schedule, for sharing a PNG.",
  '在「任務」分頁向左滑 → 切到日曆。日曆內向左右滑 → 切換昨天 / 明天。':
    'Swipe left on the Tasks tab to switch to the calendar. Inside the calendar, swipe left or right to move between yesterday and tomorrow.',
  "上方是「有日期沒時間」的任務；下方時間軸是「已排時間」的任務。日曆上的任務會自動冠上分類（例：Let's Play｜夏令營）讓你一眼分辨，不想要可在設定關掉。每週循環的任務拖到別的時間時，Huddle 會問「只改這一天 / 之後也改 / 全部改」，像 Google 日曆一樣自由。想跟夥伴互看行事曆？「設定 → 共享」邀請對方就能疊加顯示。":
    "The top shows tasks with a date but no time; the timeline below is for tasks with a scheduled time. Tasks on the calendar automatically get tagged with their category (e.g. Let's Play | Summer Camp) so you can tell them apart at a glance — turn it off in Settings if you don't want it. Drag a recurring task to a new time and Huddle will ask just this day / this day and after / all occurrences — as flexible as Google Calendar. Want to share calendars with a partner? Settings → Sharing — send an invite and their events overlay here.",
  '上方鈴鐺集中放 Huddle 要跟你說的事：已逾期、快到期、放太久沒動的任務。有事情時會出現數字小標，看完可以逐則關掉。':
    "The bell up top gathers everything Huddle wants to tell you: overdue, due-soon, and untouched-for-too-long tasks. A number badge shows up when there's something to see, and you can dismiss each one once you've read it.",
  '任務 / 白板 / 日曆 / 連結。中間「白板」隨時記點子；最右邊「連結」放你常開的網址（Notion、Gmail 等等），點一下開新分頁。想寫長一點的筆記？日曆頁右上角「⋯」選單裡有「**記事本**」（Notion 式排版）。':
    'Tasks / Scratchpad / Calendar / Links. Scratchpad in the middle is for jotting ideas anytime; Links on the far right holds the URLs you open often (Notion, Gmail, etc.) — tap one to open it in a new tab. Want to write something longer? The ⋯ menu in the top right of the calendar page has **Notebook** (Notion-style formatting).',
  '右下角浮動小球是番茄鐘。點開可放大成沉浸模式、配 Lo-fi / 雨聲 / 咖啡店白噪音，結束時 Huddle 輕輕提醒。':
    'The floating ball in the bottom right is a Pomodoro timer. Tap it to expand into immersive mode with Lo-fi / rain / coffee-shop noise, and Huddle will gently nudge you when time is up.',
  '預設每 60 分鐘，Huddle 會跳出來提醒你喝口水。可以「再過一下」snooze 五分鐘，或在設定裡改間隔 / 關掉。':
    'Every 60 minutes by default, Huddle will pop up to remind you to drink some water. Snooze it for 5 more minutes, or change the interval / turn it off in Settings.',
}
