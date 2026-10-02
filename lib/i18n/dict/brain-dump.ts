// English dictionary fragment — keys are the Traditional Chinese source strings.
// 丟給企鵝 (brain dump → today's plan): components/brain-dump/*.
// Shared words that already exist elsewhere (今天, 明天, 關閉, 完成, 日期,
// 任務名稱, {n} 分鐘, {h} 小時…) are intentionally NOT repeated here.
export const dict: Record<string, string> = {
  // entry points
  '丟給企鵝': 'Toss it to the penguin',
  '丟給企鵝 (P)': 'Toss it to the penguin (P)',
  '丟給企鵝：把一串待辦排進今天': 'Toss it to the penguin: turn a messy list into today\'s plan',

  // input
  '亂丟一串待辦，企鵝幫你排進今天的空檔。': 'Jot down everything on your mind — the penguin fits it into today\'s free time.',
  '想做的事': 'Things to do',
  '例如：明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動':
    'e.g. Reply to Kang Ting tomorrow, go to the bank this afternoon, finish the quote by Friday 1 hour, and also work out',
  '明天要回康庭的信、下午去銀行、週五前把報價改完 一小時、還有記得運動':
    'Reply to Kang Ting tomorrow, go to the bank this afternoon, finish the quote by Friday 1 hour, and also work out',
  '填入範例': 'Use an example',
  '用說的': 'Speak',
  '正在聽…再按一下停止': 'Listening… tap again to stop',
  '也可以用鍵盤的麥克風說': 'You can also use your keyboard\'s mic',
  '麥克風沒有開啟權限，可以改用鍵盤的麥克風說。': 'The microphone isn\'t allowed — try your keyboard\'s mic instead.',
  '沒聽清楚，再試一次？': 'Didn\'t catch that — try again?',
  '先寫下幾件事，企鵝才有東西可以排。': 'Write down a few things first so the penguin has something to arrange.',
  '企鵝讀不太懂這段，換個說法試試？例如「下午去銀行」。': 'The penguin couldn\'t quite read that. Try saying it another way, like "go to the bank this afternoon".',
  '排在 {start}–{end} 之間': 'Plan between {start}–{end}',
  '從幾點': 'From',
  '到幾點': 'Until',
  '⌘ Enter 也可以送出': '⌘ Enter works too',
  '交給企鵝': 'Hand it over',
  '企鵝在整理…': 'The penguin is sorting…',

  // preview
  '夜深了，今天就到這裡吧。企鵝先把它們放進明天的待排區。': 'It\'s late — let\'s call it a day. The penguin put these in tomorrow\'s to-schedule list.',
  '今天已經滿滿的了，企鵝先把它們放進待排區，有空再拖進行事曆。': 'Today is already full, so the penguin put these in the to-schedule list. Drag them onto the calendar whenever you have room.',
  '排好了，{n} 件都放進今天的空檔。': 'All set — {n} fit into today\'s free time.',
  '這些都是之後的事，企鵝先放進待排區。': 'These are all for later, so the penguin put them in the to-schedule list.',
  '{n} 件放進今天的空檔，{m} 件先放待排。': '{n} fit into today; {m} to schedule later.',
  '點便條可以改標題、時長和時間；不想要的取消勾選就好。': 'Tap a note to change its name, length or time. Untick anything you don\'t want.',
  '今天的時間軸': 'Today\'s timeline',
  '已有安排': 'Already planned',
  '待排': 'To schedule',
  '企鵝先放這裡': 'Kept here for now',
  '之後再拖進行事曆': 'drag onto the calendar later',
  '今天塞不下，先放{day}的待排 · {dur}': 'No room today — to schedule {day} · {dur}',
  '明天再排 · {dur}': 'For tomorrow · {dur}',
  '想排的時段過了，先放待排 · {dur}': 'That part of the day has passed — to schedule · {dur}',
  '{time} 已經過了，先放待排 · {dur}': '{time} has passed — to schedule · {dur}',
  '{day}・待排 · {dur}': '{day} · to schedule · {dur}',
  '{date} 前': 'by {date}',
  '跟已有的行程重疊': 'Overlaps something already planned',
  '要這件：{title}': 'Keep: {title}',
  '不要這件：{title}': 'Skip: {title}',
  '調整「{title}」': 'Adjust "{title}"',
  '時長': 'Length',
  '時間（留空＝待排）': 'Time (blank = to schedule)',
  '重來': 'Start over',
  '放進行事曆（{n}）': 'Add to calendar ({n})',
  '放進去中…': 'Adding…',

  // result
  '企鵝排好了 {n} 件事': 'The penguin planned {n} things',
  '企鵝排好了 {n} 件，{m} 件放進待排': 'The penguin planned {n}; {m} wait to be scheduled',
  '企鵝把 {m} 件放進待排': 'The penguin put {m} in the to-schedule list',
  '還有 {n} 件沒放成功，可以再試一次。': '{n} couldn\'t be added — you can try again.',
  '已經在行事曆上了。': 'They\'re on your calendar now.',
  '放進分類': 'Category',
  '找不到可以放任務的分類，先建立一個分類再試試。': 'There\'s no category to put tasks in yet. Create one and try again.',
}
