# 新手導覽文案：改前／改後對照（2026-10-01）

給老闆審稿用。「新」欄是實際跑起來後從畫面上抓下來的字（不是手抄），中英各一。

## 改寫原則

- 寫給第一次用、沒有技術背景的人看：一步只講一件事，最多三個短句。
- 標題＝被打光的那個東西；引號裡的字＝畫面上真的看得到的字。
- 不說「像某某產品」。拿掉「Notion 式」「像 Google 日曆」。常用連結裡的 Notion、GitHub、Gmail 是「你常開的網址」的例子，保留。
- 行話換白話：chip、KPI、snooze、視圖、PNG 都拿掉。
- 列舉一律用頓號「、」，不用斜線（唯一留下的斜線是記事本那步要使用者按的「/」鍵）。
- 每一句都對照過實際畫面或程式；發現 6 處原文與現在的產品不符，已一併修正（下面標「事實修正」）。

## 步數變化

- 桌機：21 步 → 23 步（Chrome／Edge）或 22 步（其他瀏覽器，沒有懸浮小視窗按鈕）。多出來的兩步是把原本塞在別步裡的「便條紙」「懸浮小視窗」獨立出來，各自打光真正的按鈕。總字數：中文約 1837 字 → 1284 字。
- 手機：15 步不變。總字數：中文約 1145 字 → 825 字。
- 桌機順序重排成「左邊面板 → 日曆 → 上方工具列由左到右 → 下方角落」，聚光燈不再滿場跳。


## 桌機（1280 以上）


### 第 1 / 23 步　打光：`（置中說明卡，不打光）`　← 舊版第 1 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 歡迎來到 Huddle | 歡迎來到 Huddle（未改） |
| 內文（中） | 整合任務、時間排程、專注計時、日記反思的工作面板。90 秒帶你走過。 | 任務、行事曆、專注計時和日記，都放在同一個地方。花一兩分鐘帶你走一圈，隨時可以略過。 |
| 標題（英） | Welcome to Huddle | Welcome to Huddle（未改） |
| 內文（英） | One workspace for tasks, scheduling, focus time, and journaling. Takes about 90 seconds. | Tasks, calendar, focus timer and journal, all in one place. Take a minute or two to look around; you can skip at any time. |

說明：原本寫「90 秒帶你走過」，實際 23 步走不完，改成「一兩分鐘」；補上「隨時可以略過」。

### 第 2 / 23 步　打光：`[data-tour="left-panel"]`　← 舊版第 2 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 左側：三層結構 | 左邊：任務清單 |
| 內文（中） | 工作區（工作 / 個人 / 學習）→ 分類（本週 / 待辦…）→ 任務。所有任務都在這。最上面灰色的「未分類」是預設收件匣——在日曆上隨手建立、還沒想好歸屬的任務都會先掉進這裡，之後再拖到對的地方。工作區標題右邊的「＋」可以新增分類；上方篩選列還能切換「精簡 / 舒適」兩種密度，任務多的時候切精簡一次看更多。 | 所有任務都收在這裡，分成三層：工作區 → 分類 → 任務。最上面的「未分類」是收件匣，還沒決定放哪的任務會先到這裡。 |
| 標題（英） | Left side: three layers | Left side: your task list |
| 內文（英） | Workspaces (Work / Personal / Learning) → categories (This week / To-do…) → tasks. Everything lives here. The grey "Uncategorized" workspace at the top is your default inbox — anything you jot down on the calendar without picking a home lands there first, so you can file it later. The "+" next to a workspace name adds a category; the filter bar above can switch between Compact and Comfortable density — switch to Compact when you have a lot of tasks to see more at once. | Every task lives here, in three layers: workspace → category → task. "Uncategorized" at the top is your inbox: tasks you have not filed yet land there first. |

說明：原本一步塞了五件事（三層結構、未分類、＋新增分類、精簡／舒適密度…）。只留「三層＋收件匣」，其餘功能使用者點得到，不佔導覽。

### 第 3 / 23 步　打光：`[data-tour="task-row"]`　← 舊版第 3 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 勾選 / 點開任務 | 完成任務、打開任務 |
| 內文（中） | 左邊圈圈 = 完成；點任務本身 = 打開詳細編輯。打開後可以把任務標為「會議」，會多三個欄位（參與者 / 地點 / 視訊連結）。 | 點左邊的圓圈，任務就完成了。點任務名稱可以打開編輯：改時間、寫備註，或把它設成「會議」。 |
| 提示（中） | 👉 試試點一下這個任務 | 👉 試試點一下這個任務（未改） |
| 標題（英） | Check off / open a task | Check off or open a task |
| 內文（英） | The circle on the left marks it done; tapping the task itself opens the detail editor. Once open, you can mark it as a Meeting to reveal three more fields (attendees / location / video link). | Click the circle on the left to mark a task done. Click its name to open it and change the time, add notes, or mark it as a meeting. |
| 提示（英） | 👉 Try tapping this task | 👉 Try clicking this task |

說明：「左邊圈圈 = 完成」改成完整句子；會議欄位細節拿掉，只說可以設成「會議」。

### 第 4 / 23 步　打光：`[data-tour="task-shortcut-row"]`　← 舊版第 4 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 今日會議 ＆ 待整理 ＆ 已完成 | 會議、整理、完成 |
| 內文（中） | 左邊 chip 顯示今天還剩幾場會議，點開可一鍵加入視訊。中間「待整理」是過了原本時間的任務，點進去可以一件一件重新決定（完成／排今天／移回任務欄／封存）。右邊「已完成」進到專屬抽屜，內含 KPI 統計（連續天數、平均耗時）。 | 「會議」列出今天的會議，可以直接加入視訊。有任務過了原訂時間，這裡會出現「整理」，讓你逐一重新安排。「完成」可以回顧做完的任務和統計。 |
| 標題（英） | Today's meetings, review & completed | Meeting, Review, Done |
| 內文（英） | The chip on the left shows how many meetings are left today — tap it to join the video call with one tap. Review in the middle collects tasks that passed their original time; open it to decide each one again (complete / do it today / back to the task list / archive). Completed on the right opens a dedicated drawer with stats (streak days, average time to finish). | "Meeting" lists today's meetings so you can join the call directly. When tasks slip past their planned time, "Review" appears here so you can reschedule them one by one. "Done" lets you look back at finished tasks and your stats. |

說明：拿掉「chip」「KPI」。標題改成畫面上真的看得到的三個字（會議、整理、完成）。另：「整理」只有在有過期任務時才會出現，新帳號一開始看不到，文案已改成「有任務過了原訂時間，這裡會出現」。

### 第 5 / 23 步　打光：`（置中說明卡，不打光）`　← 舊版第 5 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🔄 左邊 = 右邊 | 🔄 左邊 = 右邊（未改） |
| 內文（中） | 左側清單和右側日曆是**同一份資料的兩種視圖**。在任一邊改動（完成、編輯、刪除）都會即時同步，不會重複。 | 左邊的清單和右邊的日曆，看的是同一批任務。在任何一邊完成、修改或刪除，另一邊會立刻跟著變。 |
| 標題（英） | 🔄 Left = right | 🔄 Left = right（未改） |
| 內文（英） | The list on the left and the calendar on the right are **two views of the same data**. Changes on either side (complete, edit, delete) sync instantly — nothing gets duplicated. | The list on the left and the calendar on the right show the same tasks. Complete, edit or delete something on one side and the other updates right away. |

說明：拿掉「兩種視圖」「同一份資料」這種工程說法；原文的 ** 粗體記號在畫面上會直接顯示成星號，已移除。

### 第 6 / 23 步　打光：`[data-tour="calendar-panel"]`　← 舊版第 6 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 日曆：上方待排程 / 下方時間軸 | 日曆：上面待排程，下面時間軸 |
| 內文（中） | 每一天上方那條是「待排程」（有日期沒時間）；下方時間軸是「已排時間」的任務。日曆上的任務會自動冠上分類（例：Let's Play｜夏令營），一眼看出屬於哪個分類；不想要可在設定關掉。另外在「設定 → 共享」可以邀請夥伴互看行事曆，對方開放的行程會疊加顯示在這裡。 | 每天最上面那一格，放「有日期、還沒排時間」的任務；下面的時間軸，放排好時間的任務。任務前面會標出所屬分類，方便一眼分辨。想和夥伴互看行事曆，按上方工具列的「共享」。 |
| 標題（英） | Calendar: unscheduled above / timeline below | Calendar: unscheduled on top, timeline below |
| 內文（英） | The strip at the top of each day is Unscheduled (has a date, no time); the timeline below is for Scheduled tasks. Tasks on the calendar automatically get tagged with their category (e.g. Let's Play \| Summer Camp) so you can tell at a glance — turn it off in Settings if you don't want it. You can also invite a partner in Settings → Sharing to see each other's calendars — whatever they share overlays right here. | The strip at the top of each day holds tasks that have a date but no time yet; the timeline below holds tasks with a set time. Each task is labelled with its category so you can tell them apart at a glance. To see each other's calendars with a partner, use "Sharing" in the toolbar above. |

說明：拿掉「像 Google 日曆」；「設定 → 共享」改成畫面上看得到的「共享」按鈕。分類範例（Let's Play｜夏令營）拿掉，一句話講完。

### 第 7 / 23 步　打光：`[data-tour="calendar-panel"]`　← 舊版第 7 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🤚 拖曳就是排程 | 🤚 拖曳就是排程（未改） |
| 內文（中） | 把任務拖到時間軸 = 排時間。從時間軸拖回上方待排程 = 取消時間（日期保留）。在時間軸空白處點兩下，就直接在那個時段建立任務。每週循環的任務拖到別的時間時，Huddle 會問你：只改這一天、改這天與之後、還是改所有循環 — 像 Google 日曆一樣自由。 | 把任務拖到時間軸，就排好時間；拖回最上面那一格，就取消時間。在時間軸空白處點兩下，可以直接新增任務。重複的任務換時間時，Huddle 會問你只改這一天，還是之後也一起改。 |
| 標題（英） | 🤚 Drag to schedule | 🤚 Drag to schedule（未改） |
| 內文（英） | Drag a task onto the timeline to schedule it. Drag it back up to Unscheduled to clear the time (the date stays). Double-click an empty spot on the timeline to create a task right in that slot. Drag a recurring task to a new time and Huddle will ask: just this day, this day and after, or all occurrences — as flexible as Google Calendar. | Drag a task onto the timeline to give it a time; drag it back to the top strip to clear the time. Double-click an empty spot on the timeline to add a task right there. When you move a repeating task, Huddle asks whether to change just that day or the later ones too. |

說明：四句縮成三句；拿掉「像 Google 日曆一樣自由」（同樣是「像某某產品」的說法）。

### 第 8 / 23 步　打光：`[data-tour="view-modes"]`　← 舊版第 8 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 切換 日 / 週 / 月 | 切換日、週、月 |
| 內文（中） | 看細節用日、週計畫用週、看大局用月。試試看。 | 看細節用「日」，排一週用「週」，看整個月用「月」。 |
| 提示（中） | 👉 點看看其他視圖 | 👉 點點看，切換不同檢視 |
| 標題（英） | Switch Day / Week / Month | Switch between Day, Week and Month |
| 內文（英） | Day for the details, Week for planning, Month for the big picture. Give it a try. | Day for the details, Week for planning, Month for the big picture. |
| 提示（英） | 👉 Try switching views | 👉 Click to try another view |

說明：標題的斜線改成頓號；提示語「視圖」改成畫面用詞「檢視」。

### 第 9 / 23 步　打光：`[data-tour="scratchpad"]`　← 舊版第 12 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 專注白板 | 白板 |
| 內文（中） | 工作中冒出靈感？拉開白板丟文字、貼圖、連結，事後還能隨手編輯。每天分開存。右上角的「⇱」可以把白板**彈到永遠置頂的懸浮小視窗**——切去別的軟體也蓋不住它（Chrome / Edge）。 | 工作到一半冒出想法？拉開白板，隨手記下文字、待辦、圖片或連結。每天一張新的，之前的也翻得回去。 |
| 提示（中） | 👉 點開試試 | 👉 點開試試（未改） |
| 標題（英） | Focus board | Whiteboard |
| 內文（英） | Got an idea mid-work? Pull open the scratchpad and drop in text, images, or links — you can tidy it up later. Each day gets its own space. The ⇱ button in the top right pops the board into an **always-on-top floating window** that no other app can cover (Chrome / Edge). | Had an idea mid-task? Pull down the whiteboard and jot text, to-dos, images or links. You get a fresh board each day, and can flip back to earlier ones. |
| 提示（英） | 👉 Give it a try | 👉 Give it a try（未改） |

說明：順序往前移（配合畫面由左到右）。標題改成按鈕上的字「白板」。懸浮小視窗另外獨立成第 19 步；原文的「⇱」符號一般人對不上按鈕，且 ** 會顯示成星號，都拿掉。

### 第 10 / 23 步　打光：`[data-tour="notebook-entry"]`　← 舊版第 11 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 記事本 | 記事本（未改） |
| 內文（中） | Notion 式的長文筆記空間——打字時輸入「/」就能叫出區塊選單（標題／待辦／清單／收合／引言…），選取文字則會跳出格式工具列。跟每天的白板分開存，工具列上有常駐入口，想寫長一點的東西點這裡。 | 想寫長一點的筆記，點這裡。打字時輸入「/」，可以插入標題、待辦清單、圖片等區塊；選取文字，會跳出粗體、連結等格式按鈕。 |
| 標題（英） | Notebook | Notebook（未改） |
| 內文（英） | A Notion-style space for long-form notes — type / to summon the block menu (heading / to-do / list / toggle / quote…), or select text to bring up the formatting toolbar. It's kept separate from the daily scratchpad, with a permanent toolbar entry whenever you want to write something longer. | For longer notes, click here. Type "/" while writing to insert blocks such as headings, to-do lists and images; select text to bring up formatting like bold and links. |

說明：拿掉「Notion 式」。「/」選單的項目已對照程式確認：標題、待辦清單、項目符號／編號清單、收合區塊、引言、程式碼區塊、分隔線、圖片。

### 第 11 / 23 步　打光：`[data-tour="sticky-notes-toggle"]`　← 新增

| | 舊 | 新 |
|---|---|---|
| 標題（中） | — | 便條紙 |
| 內文（中） | — | 按一下，畫面上會多一層便條紙，換頁也不會消失。便條紙可以拖動、換顏色；暫時用不到的，收進旁邊的「收納」。 |
| 標題（英） | — | Sticky notes |
| 內文（英） | — | Click to lay sticky notes over the screen; they stay put when you change pages. Drag them around or change their color, and tuck the ones you do not need right now into the drawer next to this button. |

說明：新增一步：原本便條紙被塞在「使用者選單」那一步的中間，但打光的是頭像，對不上。現在直接打光工具列上的「便條紙」按鈕。

### 第 12 / 23 步　打光：`[data-tour="calendar-export"]`　← 舊版第 9 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 匯出行程圖檔 | 更多工具 |
| 內文（中） | 挑日期範圍，產出乾淨的 PNG，適合分享到 LINE / IG / Slack。隱私模式可以只顯示時段顏色不洩漏內容。 | 這個小箭頭裡收著日記、報告、每日簽到、匯出等功能。「匯出」可以把行程存成圖片分享；開啟隱私模式，就只顯示時段、不顯示任務名稱。 |
| 標題（英） | Export schedule image | More tools |
| 內文（英） | Pick a date range to generate a clean PNG — great for sharing to LINE / IG / Slack. Privacy mode shows only time-block colors without revealing the content. | This little arrow holds Journal, Reports, Daily check-in, Export and more. Export saves your schedule as an image to share; turn on privacy mode to show time blocks without task names. |

說明：原本標題寫「匯出行程圖檔」，但打光的其實是「更多工具」小箭頭（匯出藏在裡面）。標題改成被打光的東西，內文再講匯出。拿掉「PNG」「LINE / IG / Slack」。

### 第 13 / 23 步　打光：`[data-tour="calendar-export"]`　← 舊版第 18 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 📅 每日簽到 ＆ 排行榜 | 📅 每日簽到 |
| 內文（中） | 日曆頁工具列有「每日簽到」，記錄今天的心情與一句話，累積連續天數。想跟朋友比一比？到右上角使用者選單「會員與推薦」設定公開化名，就能上推薦排行榜。 | 同一個選單裡的「每日簽到」：每天簽到一次，累積分數。頁面下方有匿名排行榜，只顯示小企鵝編號，不顯示帳號。 |
| 標題（英） | 📅 Daily check-in & leaderboard | 📅 Daily check-in |
| 內文（英） | The calendar toolbar has Daily check-in — log today's mood and a one-line note to build a streak. Want to compare with friends? Set a public alias under the user menu → Membership & referrals to join the referral leaderboard. | "Daily check-in" is in the same menu: check in once a day to earn points. Further down that page is an anonymous leaderboard that shows penguin numbers, never account names. |

說明：事實修正：原文說簽到會「記錄今天的心情與一句話，累積連續天數」，但現在的簽到是按一下、累積分數，下方是匿名分數排行榜（已對照程式）。原文的「推薦排行榜」是另一個功能（會員與推薦），不再混在這一步。另外這一步現在會打光「更多工具」小箭頭，告訴使用者入口在哪。

### 第 14 / 23 步　打光：`[data-tour="notification-center"]`　← 舊版第 10 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 通知中心 | 通知中心（未改） |
| 內文（中） | 上方鈴鐺集中放 Huddle 要跟你說的事：已逾期、快到期、放太久沒動的任務，偶爾也有小提醒。有事情時會出現數字小標，看完可以逐則關掉。 | 鈴鐺會提醒你快到期、已過期，或放了很久沒動的任務。有新提醒時，鈴鐺上會出現數字。 |
| 標題（英） | Notification Center | Notification Center（未改） |
| 內文（英） | The bell up top gathers everything Huddle wants to tell you: overdue, due-soon, and untouched-for-too-long tasks, plus the occasional gentle nudge. A number badge shows up when there's something to see, and you can dismiss each one once you've read it. | The bell flags tasks that are due soon, overdue, or have sat untouched for a while. A number appears on it when there is something new. |

說明：長句拆短，意思不變。

### 第 15 / 23 步　打光：`[data-tour="user-menu"]`　← 舊版第 16 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 右上角：使用者選單 | 右上角：帳號選單 |
| 內文（中） | 點開有你的帳號資訊、深淺色切換與登出。「📌 便條紙」開關現在也在上方工具列（記事本旁邊）就能直接點——開了會出現一片玻璃便條層，貼在畫面上、換頁也不會不見，可以拖曳、選顏色或刪除；按收起鍵會收進旁邊的「收納」抽屜（可分資料夾），之後再貼回來。桌面上按 ⌘K 隨時召喚指令面板（搜任務、切視圖、開記事本）；按 ? 看完整快捷鍵。 | 點頭像打開選單：帳號資料、會員與推薦、深色模式和登出都在這裡。另外，按 ⌘K 或 Ctrl+K 可以快速搜尋任務，按「?」可以看所有快捷鍵。 |
| 標題（英） | Top right: user menu | Top right: account menu |
| 內文（英） | Opens your account info, light/dark toggle, and sign-out. The "📌 Sticky notes" toggle now also lives right in the toolbar above (next to the notebook) — turning it on drops a glass layer of notes over the screen that stays put as you switch pages; drag them, pick a color, or delete them; "Put away" files a note into the drawer next to it (with folders) so you can pin it back later. On desktop, press ⌘K anytime for the command palette (search tasks, switch views, open the notebook); press ? for the full shortcut list. | Click your avatar to open the menu: account details, Membership & Referrals, dark mode and log out are all here. Also, press ⌘K or Ctrl+K to search your tasks quickly, and "?" to see every shortcut. |

說明：原本一步講了帳號、便條紙、⌘K、快捷鍵四件事，其中便條紙佔了一大半。便條紙獨立成第 11 步；⌘K 與「?」縮成最後一句保留（Windows 是 Ctrl+K，已對照程式補上）。

### 第 16 / 23 步　打光：`[data-tour="user-menu"]`　← 舊版第 19 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🗒️ 會議逐字稿 → 任務 | 🗒️ 會議轉任務 |
| 內文（中） | 使用者選單「會議轉任務」：貼上會議逐字稿，Huddle 會幫你整理成待辦任務，自動抓出負責人與期限。指派給共享夥伴的任務，對方會在「待接受指派」收到通知。 | 同一個選單裡的「會議轉任務」：貼上會議逐字稿或筆記，Huddle 會幫你整理出待辦，並標出負責人和期限。 |
| 標題（英） | 🗒️ Meeting transcript → tasks | 🗒️ Meetings to tasks |
| 內文（英） | User menu → Meetings to tasks: paste a meeting transcript and Huddle organizes it into to-do tasks, automatically picking out the owner and due date. Tasks assigned to a shared peer show up for them under Pending assignments. | "Meetings to tasks" is in the same menu: paste a meeting transcript or notes and Huddle turns them into to-dos, picking out owners and due dates. |

說明：標題改成選單上的字「會議轉任務」，並打光頭像（入口所在）。拿掉「對方會在待接受指派收到通知」這句（屬於指派流程，放在這裡會混淆）。

### 第 17 / 23 步　打光：`（置中說明卡，不打光）`　← 舊版第 20 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🤝 指派任務 ＆ 組織 | 🤝 指派任務 ＆ 組織（未改） |
| 內文（中） | 任務詳情右上角的小人像按鈕可以把任務指派給共享夥伴或同組織成員：同一張任務會出現在對方的清單與日曆，對方完成時你立刻看得到，對方也能附一句理由退回。進度在使用者選單「指派任務」；Pro 會員可在「組織」用邀請連結建立團隊。 | 打開任務，按右上角的小人圖示，就能把任務交給共享夥伴或組織成員。任務會出現在對方的清單和日曆；對方完成或退回，你都看得到。進度在帳號選單的「指派任務」；建立組織需要 Pro 會員。 |
| 標題（英） | 🤝 Assignments & organizations | 🤝 Assignments & organizations（未改） |
| 內文（英） | Use the small person button at the top right of a task to assign it to a sharing partner or organization member: the same task shows up in their list and calendar, you see it the moment they finish, and they can return it with a short reason. Track progress under "Assignments" in the user menu; Pro members can build a team under "Organizations" with an invite link. | Open a task and use the person icon at the top right to hand it to a sharing partner or an organization member. It shows up in their list and calendar, and you can see when they finish it or send it back. Track progress under "Assignments" in the account menu; creating an organization requires Pro. |

說明：長句拆成三句；「小人像按鈕」改「小人圖示」。標題未改。

### 第 18 / 23 步　打光：`[data-tour="focus-timer"]`　← 舊版第 13 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 專注計時器 ＋ 背景音 | 專注計時 |
| 內文（中） | 右下角番茄鐘，設定 25 分鐘專心做一件事。展開後可以挑背景音樂（Lo-fi、雨聲、咖啡店白噪音…）配著做事，結束時 Huddle 會輕輕提醒你。日曆頁右上工具列的「⧉」隨時能打開**永遠置頂的懸浮小視窗**——計時器、記事本、白板三分頁，切去任何軟體都蓋不住（Chrome / Edge）。 | 設定一段時間，專心做一件事；預設是 25 分鐘的番茄鐘。可以搭配背景音樂或環境音，例如雨聲、海浪、咖啡廳。結束後會自動記到今天的日曆。 |
| 提示（中） | 👉 點開計時器 | 👉 點開計時器（未改） |
| 標題（英） | Focus timer + background sound | Focus timer |
| 內文（英） | A Pomodoro timer in the bottom right — set 25 minutes to focus on one thing. Expand it to pick background sound (Lo-fi, rain, coffee-shop noise…) to work alongside, and Huddle will gently nudge you when time is up. The ⧉ button in the calendar toolbar opens an **always-on-top floating window** any time — Timer, Notebook, and Scratchpad tabs — that stays visible over every other app (Chrome / Edge). | Set a stretch of time and focus on one thing; the default is a 25-minute Pomodoro. Add music or ambient sound such as rain, waves or a cafe. When it ends, the session is logged on today's calendar automatically. |
| 提示（英） | 👉 Open the timer | 👉 Open the timer（未改） |

說明：事實修正：原文寫「Lo-fi、雨聲、咖啡店白噪音」，實際音效是放鬆／激昂／大自然（音樂）與雨聲／火焰／海浪／咖啡廳（環境音），沒有 Lo-fi。標題改成按鈕上的字「專注計時」。懸浮小視窗獨立成下一步。

### 第 19 / 23 步　打光：`[data-hub-launcher]`　← 新增

| | 舊 | 新 |
|---|---|---|
| 標題（中） | — | 懸浮小視窗 |
| 內文（中） | — | 按這個按鈕，會跳出一個永遠在最上層的小視窗，切到別的軟體也看得到。裡面有計時器、記事本和白板三個分頁。 |
| 標題（英） | — | Floating window |
| 內文（英） | — | This button opens a small window that always stays on top, even when you switch to another app. Inside are three tabs: Timer, Notebook and Whiteboard. |

說明：新增一步：原本懸浮小視窗被夾在白板與計時器兩步的句尾。這個按鈕只有 Chrome／Edge 才有，其他瀏覽器會自動跳過這一步（總步數變 22）。

### 第 20 / 23 步　打光：`（置中說明卡，不打光）`　← 舊版第 14 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 💧 喝水小提醒 | 💧 喝水小提醒（未改） |
| 內文（中） | 預設每 60 分鐘，Huddle 會跳出來提醒你喝口水。可以選「再過一下」snooze 五分鐘，或在設定裡改成 30/90/120 分鐘，不想要也可以關掉。 | 每 60 分鐘，Huddle 會提醒你喝口水。想晚點再喝，按「再過一下」，五分鐘後再提醒。間隔可以在「設定」調整，也可以整個關掉。 |
| 標題（英） | 💧 Water reminder | 💧 Water reminder（未改） |
| 內文（英） | Every 60 minutes by default, Huddle will pop up to remind you to drink some water. Choose Snooze for 5 more minutes, change the interval to 30/90/120 minutes in Settings, or turn it off entirely. | Every 60 minutes, Huddle reminds you to drink some water. Not now? Press "Snooze" and it comes back in five minutes. Change the interval in Settings, or turn it off entirely. |

說明：拿掉英文「snooze」；「30/90/120」改成「可以在設定調整」。

### 第 21 / 23 步　打光：`[data-tour="quick-links-bar"]`　← 舊版第 15 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 常用連結（最底下） | 常用連結 |
| 內文（中） | 螢幕底下那條薄薄的「常用連結」可以拉開，放上你常開的網址（Notion、GitHub、Gmail 之類）。點一下開新分頁，編輯按右上角小鉛筆。 | 把常開的網址放在這裡，例如 Notion、GitHub、Gmail。點一下，就在新分頁打開。 |
| 標題（英） | Quick links (at the very bottom) | Quick Links |
| 內文（英） | That thin strip at the bottom of the screen pulls open into Quick Links — add the URLs you visit often (Notion, GitHub, Gmail, that sort of thing). Tap one to open it in a new tab; edit via the little pencil in the top right. | Keep the sites you open most here, such as Notion, GitHub or Gmail. One click opens them in a new tab. |

說明：標題拿掉「（最底下）」；保留 Notion、GitHub、Gmail 當作「常開網址」的例子。原文「編輯按右上角小鉛筆」拿掉（鉛筆其實在每張連結卡片上）。

### 第 22 / 23 步　打光：`[data-tour="pet"]`　← 舊版第 17 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🐧 你的企鵝 | 🐧 你的企鵝（未改） |
| 內文（中） | 角落那隻小企鵝是你專屬的。點牠會講笑話，連點有不同反應；長按（手機）或按右鍵（電腦）可以叫牠安靜一下或打開設定。牠偶爾會提醒你會議、逾期任務和簽到，但多半只是在說些荒謬的話。 | 角落這隻企鵝是你專屬的。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。牠偶爾會提醒你會議和過期的任務，但多半只是在說些荒謬的話。 |
| 標題（英） | 🐧 Your penguin | 🐧 Your penguin（未改） |
| 內文（英） | The little penguin in the corner is all yours. Tap it for a joke (keep tapping for more reactions); long-press on a phone or right-click on a computer to hush it or open its settings. It will occasionally remind you about meetings, overdue tasks and check-ins, but mostly it says absurd things. | The penguin in the corner is yours. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu. Now and then it reminds you about meetings and overdue tasks, but mostly it just says absurd things. |
| 內文（中）——還沒有企鵝時 | — | 導覽結束後，你可以領養一隻專屬企鵝，牠會住在畫面角落。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。 |
| 內文（英）——還沒有企鵝時 | — | After the tour you can adopt a penguin of your own, and it will live in the corner of the screen. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu. |

說明：事實修正：新帳號在導覽當下還沒有企鵝（領養是導覽結束後才出現），原文卻說「角落那隻小企鵝」。現在分兩種文案：畫面上有企鵝時打光牠；還沒有時改說「導覽結束後可以領養」。

### 第 23 / 23 步　打光：`（置中說明卡，不打光）`　← 舊版第 21 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | ✨ 你準備好了！ | ✨ 你準備好了！（未改） |
| 內文（中） | 最後一步：你想怎麼開始？ | 最後一步：你想怎麼開始？（未改） |
| 標題（英） | ✨ You're all set! | ✨ You're all set!（未改） |
| 內文（英） | Last step: how do you want to start? | Last step: how do you want to start?（未改） |

說明：未改。（兩個選項卡片上的說明：斜線改頓號。）

## 手機（390）


### 第 1 / 15 步　打光：`（置中說明卡，不打光）`　← 舊版第 1 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 歡迎來到 Huddle | 歡迎來到 Huddle（未改） |
| 內文（中） | 整合任務、時間排程、專注計時、日記反思的工作面板。 | 任務、行事曆、專注計時和日記，都放在同一個地方。花一兩分鐘帶你走一圈，隨時可以略過。 |
| 標題（英） | Welcome to Huddle | Welcome to Huddle（未改） |
| 內文（英） | One workspace for tasks, scheduling, focus time, and journaling. | Tasks, calendar, focus timer and journal, all in one place. Take a minute or two to look around; you can skip at any time. |

說明：同桌機第 1 步。

### 第 2 / 15 步　打光：`[data-tour="left-panel"]`　← 舊版第 2 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 任務分頁 | 「任務」分頁 |
| 內文（中） | 工作區 → 分類 → 任務的三層結構。所有任務都在這。最上面灰色的「未分類」是預設收件匣，沒指定分類的新任務都會先掉進這裡。工作區標題右邊的「＋」可以新增分類。 | 所有任務都收在這裡，分成三層：工作區 → 分類 → 任務。最上面的「未分類」是收件匣，還沒決定放哪的任務會先到這裡。 |
| 標題（英） | Tasks tab | The Tasks tab |
| 內文（英） | Three layers: workspaces → categories → tasks. Everything lives here. The grey "Uncategorized" workspace at the top is your default inbox — new tasks with no category picked land there. The "+" next to a workspace name adds a category. | Every task lives here, in three layers: workspace → category → task. "Uncategorized" at the top is your inbox: tasks you have not filed yet land there first. |

說明：原本手機一開就在「日曆」分頁，這一步要打光的任務清單根本不在畫面上，結果變成一張沒有指向的說明卡。現在導覽會先自動切到「任務」分頁再打光。

### 第 3 / 15 步　打光：`[data-tour="task-row"]`　← 舊版第 3 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 點任務 = 編輯，長按 = 拖到日曆 | 點一下編輯，長按拖到日曆 |
| 內文（中） | 輕點任務開啟詳細頁；長按 0.3 秒後拖移可以直接排到日曆上的時間。打開後可以把任務標為「會議」，會多參與者 / 地點 / 視訊連結。 | 點左邊的圓圈完成任務，點任務名稱打開編輯。長按任務再拖動，可以直接排進日曆。 |
| 標題（英） | Tap a task to edit, long-press to drag to the calendar | Tap to edit, long-press to drag to the calendar |
| 內文（英） | Tap a task to open its detail page; long-press for 0.3s then drag to schedule it directly onto the calendar. Once open, you can mark it as a Meeting to add attendees / location / video link. | Tap the circle on the left to mark a task done, or tap its name to open it. Long-press a task and drag to put it straight onto the calendar. |

說明：同上，現在會真的打光第一個任務。拿掉「0.3 秒」這種數字。

### 第 4 / 15 步　打光：`[data-tour="task-shortcut-row"]`　← 舊版第 4 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 今日會議 ＆ 待整理 ＆ 已完成 | 會議、整理、完成 |
| 內文（中） | 今日會議 chip 點開可以一鍵加入視訊；「待整理」收過期任務，進去後可以滑卡片整理——右滑完成、左滑移回任務欄、上滑排今天、下滑封存。已完成抽屜含 KPI（連續天數、平均耗時）。 | 「會議」列出今天的會議，可以直接加入視訊。有任務過了原訂時間，這裡會出現「整理」，讓你逐一重新安排。「完成」可以回顧做完的任務和統計。 |
| 標題（英） | Today's meetings, review & completed | Meeting, Review, Done |
| 內文（英） | Tap the today's-meetings chip to join a video call with one tap. Review collects tasks that are past due — open it and swipe the cards: right to complete, left to send back to the task list, up to do it today, down to archive. The Completed drawer has stats (streak days, average time to finish). | "Meeting" lists today's meetings so you can join the call directly. When tasks slip past their planned time, "Review" appears here so you can reschedule them one by one. "Done" lets you look back at finished tasks and your stats. |

說明：同桌機第 4 步（拿掉 chip、KPI）。滑卡片的四個方向拿掉——進到整理畫面時，畫面上本來就有寫。

### 第 5 / 15 步　打光：`（置中說明卡，不打光）`　← 舊版第 5 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🤚 左右滑動 | 🤚 左右滑動（未改） |
| 內文（中） | 在「任務」分頁向左滑 → 切到日曆。日曆內向左右滑 → 切換昨天 / 明天。 | 在「任務」分頁往左滑，會切到日曆。在日曆裡左右滑，可以往前、往後翻日期。 |
| 標題（英） | 🤚 Swipe left / right | 🤚 Swipe left and right |
| 內文（英） | Swipe left on the Tasks tab to switch to the calendar. Inside the calendar, swipe left or right to move between yesterday and tomorrow. | Swipe left on the Tasks tab to switch to the calendar. Inside the calendar, swipe left or right to move between dates. |

說明：箭頭改成句子。

### 第 6 / 15 步　打光：`[data-tour="calendar-panel"]`　← 舊版第 6 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 日曆：上方待排程 / 下方時間軸 | 日曆：上面待排程，下面時間軸 |
| 內文（中） | 上方是「有日期沒時間」的任務；下方時間軸是「已排時間」的任務。日曆上的任務會自動冠上分類（例：Let's Play｜夏令營）讓你一眼分辨，不想要可在設定關掉。每週循環的任務拖到別的時間時，Huddle 會問「只改這一天 / 之後也改 / 全部改」，像 Google 日曆一樣自由。想跟夥伴互看行事曆？「設定 → 共享」邀請對方就能疊加顯示。 | 每天最上面那一格，放「有日期、還沒排時間」的任務；下面的時間軸，放排好時間的任務。任務前面會標出所屬分類，方便一眼分辨。想和夥伴互看行事曆，到右上角「⋯」裡的「共享」。 |
| 標題（英） | Calendar: unscheduled above / timeline below | Calendar: unscheduled on top, timeline below |
| 內文（英） | The top shows tasks with a date but no time; the timeline below is for tasks with a scheduled time. Tasks on the calendar automatically get tagged with their category (e.g. Let's Play \| Summer Camp) so you can tell them apart at a glance — turn it off in Settings if you don't want it. Drag a recurring task to a new time and Huddle will ask just this day / this day and after / all occurrences — as flexible as Google Calendar. Want to share calendars with a partner? Settings → Sharing — send an invite and their events overlay here. | The strip at the top of each day holds tasks that have a date but no time yet; the timeline below holds tasks with a set time. Each task is labelled with its category so you can tell them apart at a glance. To see each other's calendars with a partner, open "Sharing" under "⋯" at the top right. |

說明：原本五句，縮成三句。拿掉「像 Google 日曆」與重複任務的說明（真的遇到時畫面會自己問）。

### 第 7 / 15 步　打光：`[data-tour="mobile-more"]`　← 舊版第 7 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 通知、帳號都在「⋯」 | 更多工具都在「⋯」 |
| 內文（中） | 右上角「⋯」收著通知中心、帳號、共享對象與記事本等工具。有新通知時「⋯」會出現數字小標，點開選「通知」查看。 | 通知、帳號、記事本、便條紙和設定，都收在右上角的「⋯」。有新通知時，「⋯」上會出現數字。 |
| 標題（英） | Notifications & account live in “⋯” | More tools live in "⋯" |
| 內文（英） | The “⋯” in the top right holds the notification center, your account, shared calendars, the notebook and more. When something new arrives, “⋯” shows a number badge — open it and pick Notifications. | Notifications, Account, Notebook, Sticky notes and Settings are all tucked into "⋯" at the top right. A number appears on "⋯" when there is something new. |

說明：把原本散在別步的記事本、便條紙入口一起列進來。

### 第 8 / 15 步　打光：`[data-tour="mobile-add-task"]`　← 舊版第 8 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | ＋ 新增任務 | 新增任務 |
| 內文（中） | 日曆右下角的「＋」隨時新增任務；在時間軸空白處點兩下，也能直接在那個時段建立任務。 | 按這顆「＋」新增任務。也可以在時間軸的空白處點兩下，直接在那個時段建立。 |
| 標題（英） | ＋ Add a task | Add task |
| 內文（英） | Tap the “＋” at the bottom right of the calendar to add a task anytime — or double-tap an empty spot on the timeline to create one right in that slot. | Tap "+" to add a task. Or double-tap an empty spot on the timeline to create one right in that slot. |

說明：標題拿掉全形「＋」（英文版會殘留全形符號）。

### 第 9 / 15 步　打光：`[data-tour="mobile-tabs"]`　← 舊版第 9 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | ✨ 底部四分頁 | 底部五個分頁 |
| 內文（中） | 任務 / 白板 / 日曆 / 連結。中間「白板」隨時記點子；最右邊「連結」放你常開的網址（Notion、Gmail 等等），點一下開新分頁。想寫長一點的筆記？日曆頁右上角「⋯」選單裡有「**記事本**」（Notion 式排版）。 | 「重點」看各分類的進度，「任務」是完整清單，「白板」隨手記想法，「日曆」排時間，「連結」放常開的網址。 |
| 標題（英） | ✨ Four tabs at the bottom | Five tabs at the bottom |
| 內文（英） | Tasks / Scratchpad / Calendar / Links. Scratchpad in the middle is for jotting ideas anytime; Links on the far right holds the URLs you open often (Notion, Gmail, etc.) — tap one to open it in a new tab. Want to write something longer? The ⋯ menu in the top right of the calendar page has **Notebook** (Notion-style formatting). | Focus shows progress by category, Tasks is the full list, Whiteboard is for quick notes, Calendar is for scheduling, and Links holds the sites you open most. |

說明：事實修正：底部現在是五個分頁（多了「重點」），原文還寫四個。這一步現在會打光整條分頁列。拿掉「Notion 式排版」。

### 第 10 / 15 步　打光：`[data-tour="focus-timer"]`　← 舊版第 10 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 專注計時器 ＋ 背景音 | 專注計時 |
| 內文（中） | 右下角浮動小球是番茄鐘。點開可放大成沉浸模式、配 Lo-fi / 雨聲 / 咖啡店白噪音，結束時 Huddle 輕輕提醒。 | 設定一段時間，專心做一件事；預設是 25 分鐘的番茄鐘。可以搭配背景音樂或環境音，例如雨聲、海浪、咖啡廳。結束後會自動記到今天的日曆。 |
| 提示（中） | 👉 點開試試 | 👉 點開試試（未改） |
| 標題（英） | Focus timer + background sound | Focus timer |
| 內文（英） | The floating ball in the bottom right is a Pomodoro timer. Tap it to expand into immersive mode with Lo-fi / rain / coffee-shop noise, and Huddle will gently nudge you when time is up. | Set a stretch of time and focus on one thing; the default is a 25-minute Pomodoro. Add music or ambient sound such as rain, waves or a cafe. When it ends, the session is logged on today's calendar automatically. |
| 提示（英） | 👉 Give it a try | 👉 Give it a try（未改） |

說明：事實修正：原文寫「右下角浮動小球」，實際是一顆寫著「專注計時」的膠囊按鈕；音效清單同桌機修正。

### 第 11 / 15 步　打光：`（置中說明卡，不打光）`　← 舊版第 11 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 💧 喝水小提醒 | 💧 喝水小提醒（未改） |
| 內文（中） | 預設每 60 分鐘，Huddle 會跳出來提醒你喝口水。可以「再過一下」snooze 五分鐘，或在設定裡改間隔 / 關掉。 | 每 60 分鐘，Huddle 會提醒你喝口水。想晚點再喝，按「再過一下」，五分鐘後再提醒。間隔可以在「設定」調整，也可以整個關掉。 |
| 標題（英） | 💧 Water reminder | 💧 Water reminder（未改） |
| 內文（英） | Every 60 minutes by default, Huddle will pop up to remind you to drink some water. Snooze it for 5 more minutes, or change the interval / turn it off in Settings. | Every 60 minutes, Huddle reminds you to drink some water. Not now? Press "Snooze" and it comes back in five minutes. Change the interval in Settings, or turn it off entirely. |

說明：同桌機第 20 步。

### 第 12 / 15 步　打光：`[data-tour="pet"]`　← 舊版第 12 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🐧 你的企鵝 | 🐧 你的企鵝（未改） |
| 內文（中） | 底部分頁列上方那隻小企鵝是你專屬的。點牠會講笑話，連點有不同反應；長按可以叫牠安靜一下或打開設定。牠偶爾會提醒你會議、逾期任務和簽到，但多半只是在說些荒謬的話。 | 角落這隻企鵝是你專屬的。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。牠偶爾會提醒你會議和過期的任務，但多半只是在說些荒謬的話。 |
| 標題（英） | 🐧 Your penguin | 🐧 Your penguin（未改） |
| 內文（英） | The little penguin above the tab bar is all yours. Tap it for a joke (keep tapping for more reactions); long-press to hush it or open its settings. It will occasionally remind you about meetings, overdue tasks and check-ins, but mostly it says absurd things. | The penguin in the corner is yours. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu. Now and then it reminds you about meetings and overdue tasks, but mostly it just says absurd things. |
| 內文（中）——還沒有企鵝時 | — | 導覽結束後，你可以領養一隻專屬企鵝，牠會住在畫面角落。點牠會講笑話；想讓牠安靜一下，長按（電腦按右鍵）打開選單。 |
| 內文（英）——還沒有企鵝時 | — | After the tour you can adopt a penguin of your own, and it will live in the corner of the screen. Tap it for a joke; to quiet it down, long-press (right-click on a computer) to open its menu. |

說明：同桌機第 22 步。

### 第 13 / 15 步　打光：`[data-tour="mobile-more"]`　← 舊版第 13 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 📅 每日簽到 ＆ 會議轉任務 | 📅 每日簽到 ＆ 會議轉任務（未改） |
| 內文（中） | 日曆頁「⋯」選單裡有「每日簽到」，記錄心情累積連續天數；使用者選單裡有「會議轉任務」，貼上逐字稿自動整理成待辦任務。「📌 便條紙」開關也在日曆工具列（記事本旁邊）或「⋯」選單裡就能直接點開，開了會出現一片玻璃便條層貼在畫面上，換頁也不會不見；用不到的可以收進「收納」抽屜分資料夾放。 | 「⋯」裡的「每日簽到」：每天簽到一次，累積分數。「⋯」→「帳號」→「會議轉任務」：貼上會議逐字稿，Huddle 會幫你整理出待辦。 |
| 標題（英） | 📅 Daily check-in & meetings-to-tasks | 📅 Daily check-in & Meetings to tasks |
| 內文（英） | The calendar page's "⋯" menu has "Daily check-in" to log your mood and build a streak; the user menu has "Meeting to tasks" to turn a pasted transcript into to-dos automatically. The "📌 Sticky notes" toggle is also right there in the calendar toolbar (next to the notebook) or in the "⋯" menu — turning it on drops a glass layer of notes over the screen that stays put as you switch pages; notes you are done with can be put away into folders in the drawer. | Daily check-in, under "⋯": check in once a day to earn points. Meetings to tasks, under "⋯" then Account: paste a meeting transcript and Huddle turns it into to-dos. |

說明：事實修正同桌機第 13 步（簽到是累積分數）。便條紙那一大段移到第 7 步用一個詞帶過。這一步現在會打光「⋯」。

### 第 14 / 15 步　打光：`（置中說明卡，不打光）`　← 舊版第 14 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | 🤝 指派任務 ＆ 組織 | 🤝 指派任務 ＆ 組織（未改） |
| 內文（中） | 任務詳情右上角的小人像按鈕可以把任務指派給共享夥伴或同組織成員：同一張任務會出現在對方的清單與日曆，對方完成時你立刻看得到，對方也能附一句理由退回。進度在使用者選單「指派任務」；Pro 會員可在「組織」用邀請連結建立團隊。 | 打開任務，按右上角的小人圖示，就能把任務交給共享夥伴或組織成員。任務會出現在對方的清單和日曆；對方完成或退回，你都看得到。進度在帳號選單的「指派任務」；建立組織需要 Pro 會員。 |
| 標題（英） | 🤝 Assignments & organizations | 🤝 Assignments & organizations（未改） |
| 內文（英） | Use the small person button at the top right of a task to assign it to a sharing partner or organization member: the same task shows up in their list and calendar, you see it the moment they finish, and they can return it with a short reason. Track progress under "Assignments" in the user menu; Pro members can build a team under "Organizations" with an invite link. | Open a task and use the person icon at the top right to hand it to a sharing partner or an organization member. It shows up in their list and calendar, and you can see when they finish it or send it back. Track progress under "Assignments" in the account menu; creating an organization requires Pro. |

說明：同桌機第 17 步。

### 第 15 / 15 步　打光：`（置中說明卡，不打光）`　← 舊版第 15 步

| | 舊 | 新 |
|---|---|---|
| 標題（中） | ✨ 你準備好了！ | ✨ 你準備好了！（未改） |
| 內文（中） | 最後一步：你想怎麼開始？ | 最後一步：你想怎麼開始？（未改） |
| 標題（英） | ✨ You're all set! | ✨ You're all set!（未改） |
| 內文（英） | Last step: how do you want to start? | Last step: how do you want to start?（未改） |

說明：未改。

## 導覽外框的字

| 位置 | 舊 | 新 |
|---|---|---|
| 進度 | 21 顆圓點 | 「4 / 23」數字＋一條細進度條 |
| 最後一步「套用模板」說明（中） | 工作 / 個人 / 學習 三個工作區，分類已排好，任務你來填 | 工作、個人、學習三個工作區，分類已排好，任務你來填 |
| 最後一步「套用模板」說明（英） | Three workspaces — Work / Personal / Learning — with categories ready to go; you fill in the tasks | Three workspaces (Work, Personal, Learning) with categories ready to go; you fill in the tasks |
| 上一步、下一步、略過導覽、關閉導覽 | — | 未改 |

## 舊版沒寫進新版的內容（請確認可以拿掉）

- 任務面板的「精簡／舒適」密度切換、工作區標題旁的「＋」新增分類。
- 會議任務的三個欄位名稱（參與者、地點、視訊連結）。
- 日曆任務的分類前綴「可在設定關掉」、範例「Let's Play｜夏令營」。
- 匯出「適合分享到 LINE / IG / Slack」。
- 企鵝「連點有不同反應」「提醒簽到」「可打開設定」。
- 手機：整理畫面的四個滑動方向、重複任務改時間的三個選項、長按「0.3 秒」。
- 推薦排行榜與公開化名（在「會員與推薦」頁裡，導覽只提到選單裡有「會員與推薦」）。

