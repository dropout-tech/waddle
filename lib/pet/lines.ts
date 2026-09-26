/**
 * The penguin's line library (繁中 + English, paired by id).
 *
 * Tone: cute, absurd, harmless. Never: discrimination, adult content,
 * politics, or anything that mocks the user's ability. No quotes from
 * copyrighted works. Useful reminders are wrapped in absurd phrasing but the
 * facts they carry ({count}, {time}, {title}) are always real values.
 *
 * Ids are `<category>-<n>` and must stay stable (they key the 24h
 * no-repeat memory in localStorage) — append new lines at the end of a
 * category, never reorder.
 *
 * Placeholders: {name} = the pet's name, {count} = a number,
 * {time} = minutes or a clock time, {title} = a meeting title.
 */

import { JOKES_EN, JOKES_ZH } from './jokes'

export type PetLineCategory =
  | 'absurd' // 荒謬獨白
  | 'joke' // 企鵝冷笑話
  | 'work' // 工作梗
  | 'tip' // 荒謬但真的有點用的小提示
  | 'celebrate' // 慶祝（完成任務）
  | 'night' // 深夜
  | 'overdue' // 提醒模板：逾期任務 {count}
  | 'meeting' // 提醒模板：會議 {title} {time}
  | 'focusEnd' // 提醒模板：專注結束
  | 'checkIn' // 提醒模板：今天還沒簽到
  | 'poke' // 連點反應
  | 'hello' // 剛領養

export interface PetLine {
  id: string
  cat: PetLineCategory
  /** Omitted = this line only exists in the other language (jokes). */
  zh?: string
  en?: string
}

const group = (cat: PetLineCategory, rows: Array<[string, string]>): PetLine[] =>
  rows.map(([zh, en], i) => ({ id: `${cat}-${i + 1}`, cat, zh, en }))

export const PET_LINES: PetLine[] = [
  ...group('absurd', [
    ['我剛剛試著用意志力讓冰塊融化，失敗了，但我很有氣勢。', 'I just tried to melt an ice cube with willpower. It failed, but I looked very confident.'],
    ['我把一條魚取名叫「明天」，這樣我就能說「明天再吃」。', 'I named a fish "Tomorrow" so I can say "I\'ll eat Tomorrow later."'],
    ['今天的目標：比昨天再圓一點點。', 'Today\'s goal: be slightly rounder than yesterday.'],
    ['我剛跟一朵雲開會，它一直飄走，完全不專心。', 'I had a meeting with a cloud. It kept drifting off. Zero focus.'],
    ['如果你聽到呱呱聲，那是我在思考。思考很吵。', 'If you hear honking, that\'s me thinking. Thinking is loud.'],
    ['我決定當一隻有企圖心的企鵝，所以先去睡個午覺儲備企圖心。', 'I\'ve decided to be an ambitious penguin. First, a nap to store up ambition.'],
    ['我在練習倒立，目前的進度是：躺著。', 'I\'m practicing handstands. Current progress: lying down.'],
    ['冰箱跟我說它很冷，我說我知道，我們就這樣聊了一下午。', 'The fridge said it was cold. I said "same." We talked all afternoon.'],
    ['我把我的影子留在另一個分頁了，等等要去拿。', 'I left my shadow in another tab. I\'ll pick it up later.'],
    ['我數了一下，今天空氣裡大概有一百萬個好點子，我抓到兩個。', 'By my count there are a million good ideas in the air today. I caught two.'],
    ['我剛學會吹口哨，但吹出來是「呱」。', 'I just learned to whistle. It comes out as "honk."'],
    ['企鵝不會飛，但我會很用力地想像。', 'Penguins can\'t fly, but I imagine really, really hard.'],
    ['我偷偷把你的游標當成溜冰場。放心，我有戴安全帽。', 'I\'ve been using your cursor as an ice rink. Don\'t worry, I wore a helmet.'],
    ['今天我學到一件事：鞋子不是企鵝的必需品。', 'Today I learned: shoes are optional for penguins.'],
    ['我在寫一本書，書名叫《我在這裡》，目前寫了一個字：呱。', 'I\'m writing a book called "I Am Here." So far it has one word: honk.'],
    ['我把一顆冰塊放進口袋當傳家寶，它正在慢慢變小。', 'I put an ice cube in my pocket as a family heirloom. It\'s shrinking.'],
    ['根據我的研究，按鈕被按下去的時候會有一點點開心。', 'According to my research, buttons feel a tiny bit happy when pressed.'],
    ['我剛剛對牆壁說早安，牆壁很有禮貌地沒有回我。', 'I said good morning to the wall. It politely kept to itself.'],
    ['我在跟自己玩捉迷藏，目前還沒找到我。', 'I\'m playing hide-and-seek with myself. I haven\'t found me yet.'],
    ['我的專長是站著。進階技能是站得很圓。', 'My specialty is standing. Advanced skill: standing roundly.'],
    ['剛剛有一隻蒼蠅飛過，我點頭致意，它沒理我。', 'A fly just passed by. I nodded respectfully. It did not nod back.'],
    ['我在想，如果把「週一」改名叫「魚一」，大家會不會比較開心。', 'What if we renamed Monday "Fishday"? Morale would soar.'],
    ['我今天的心情是：一顆在冰上滑行的湯圓。', 'Today\'s mood: a dumpling sliding across the ice.'],
    ['我練習了三小時的帥氣轉身，最後轉到頭暈。', 'I practiced a cool spin for three hours. Now I\'m just dizzy.'],
    ['聽說地球是圓的，我覺得它在模仿我。', 'They say the Earth is round. I think it\'s copying me.'],
    ['我想買一台冰箱，後來發現我自己就很冰。', 'I wanted to buy a fridge, then realized I\'m already chilled.'],
    ['我剛把一片雪花收進我的收藏，編號第 8,302 號。', 'I just added a snowflake to my collection. It\'s number 8,302.'],
    ['我在練習講話很有深度：……呱。', 'I\'m practicing sounding profound: ...honk.'],
    ['如果我突然不見，應該只是去冰箱巡邏了。', 'If I suddenly vanish, I\'m just on fridge patrol.'],
    ['我今天走了 27 步，其中 20 步是在原地。', 'I walked 27 steps today. Twenty of them were in place.'],
    ['我剛拜託時鐘走慢一點，它假裝沒聽到。', 'I asked the clock to slow down. It pretended not to hear.'],
    ['跟你說個秘密：我的肚子其實是一小片雪原。', 'Secret: my tummy is actually a tiny snowfield.'],
    ['我把今天的煩惱摺成紙飛機，它飛了三公分就降落了。', 'I folded today\'s worries into a paper plane. It flew three centimeters.'],
    ['我在訓練一隻想像中的海豹當助理，它目前只會拍手。', 'I\'m training an imaginary seal as my assistant. So far it only claps.'],
    ['我不是在發呆，我是在開啟省電模式。', 'I\'m not zoning out. I\'m in power-saving mode.'],
    ['我剛剛打了一個噴嚏，把自己嚇了一跳。', 'I just sneezed and startled myself.'],
    ['我今天試著用鰭打字，打出來全部都是「ㄍ」。', 'I tried typing with my flippers. Every key came out as "g."'],
    ['今天的天氣預報：局部地區有企鵝。', 'Today\'s forecast: scattered penguins.'],
    ['我哼一首歌哼成了三首，因為我忘記原本的旋律。', 'I hummed one song and it became three because I forgot the tune.'],
    ['我請月亮幫我看家，它說它只有晚上有空。', 'I asked the moon to housesit. It\'s only free at night.'],
    ['我在排隊，但不確定在排什麼，前面好像是另一隻企鵝。', 'I\'m in a queue. Not sure what for. I think it\'s just another penguin.'],
    ['我決定今天要很酷。企鵝本來就很酷，所以任務完成。', 'I decided to be cool today. Penguins are already cool. Mission complete.'],
    ['我偷偷把一個小驚喜藏在明天，到時候你就知道了。', 'I hid a tiny surprise inside tomorrow. You\'ll see.'],
    ['有人說我走路搖搖擺擺，我說那叫風格。', 'Someone said I waddle. I call it style.'],
    ['我剛整理好我的羽毛，現在我是一隻很有條理的企鵝。', 'I just organized my feathers. I\'m a very organized penguin now.'],
  ]),
  // Jokes are puns written natively per language — see lib/pet/jokes.ts.
  ...JOKES_ZH.map((zh, i): PetLine => ({ id: `joke-zh-${i + 1}`, cat: 'joke', zh })),
  ...JOKES_EN.map((en, i): PetLine => ({ id: `joke-en-${i + 1}`, cat: 'joke', en })),
  ...group('work', [
    ['我幫你把待辦清單看過一遍了，它們看起來都很想被完成。', 'I looked over your to-do list. They all seem eager to be done.'],
    ['開會小技巧：如果大家都不說話，就說「呱」。效果我還在研究。', 'Meeting tip: if everyone\'s silent, say "honk." Results pending.'],
    ['我剛把你的日曆當溜冰場滑了一圈，沒有撞到任何會議。', 'I skated around your calendar. Didn\'t bump into a single meeting.'],
    ['聽說寄信前多看一眼收件人，可以避免很多尷尬。我是聽海豹說的。', 'Word is, checking the recipient before sending saves a lot of awkwardness. A seal told me.'],
    ['「我晚點回你」是企鵝界最長的時間單位。', '"I\'ll get back to you" is the longest unit of time in penguin culture.'],
    ['我在幫你的任務排隊，有幾個一直插隊。', 'I\'m queuing your tasks. A few keep cutting in line.'],
    ['我做了一份簡報，只有一頁，上面寫著：魚。', 'I made a slide deck. One slide. It says: fish.'],
    ['剛剛有個任務偷偷對我眨眼，我懷疑它想被勾掉。', 'A task just winked at me. I think it wants to be checked off.'],
    ['我在白板上畫了一張策略圖，結果是一條魚。', 'I drew a strategy map on the whiteboard. It\'s a fish.'],
    ['專案進度報告：企鵝已就位，魚尚未到貨。', 'Status update: penguin in position, fish not yet delivered.'],
    ['我幫你把「很忙」翻譯成企鵝語：呱呱呱呱。', 'I translated "very busy" into Penguin: honk honk honk honk.'],
    ['我有看到你今天很努力，我用鰭幫你鼓掌了。', 'I saw you working hard today. I\'m clapping with my flippers.'],
    ['每個大專案都是從一個小小的開始起跳的。我是從冰上滑倒起跳的。', 'Every big project starts with one small step. Mine started with a slip on the ice.'],
    ['會議如果沒有結論，至少要有點心。這是企鵝的原則。', 'If a meeting has no conclusion, it should at least have snacks. Penguin policy.'],
    ['你的日曆看起來像一塊很好吃的千層蛋糕。', 'Your calendar looks like a delicious layer cake.'],
    ['我把「待會再做」收進冰箱了，保鮮期到今天晚上。', 'I put "do it later" in the fridge. Best before tonight.'],
    ['根據企鵝統計，最難的永遠是打開檔案的那一下。', 'Penguin statistics: the hardest part is always opening the file.'],
    ['我幫你跟截止日說了好話，它說它會考慮。', 'I put in a good word with the deadline. It said it\'ll think about it.'],
    ['我試著幫你回信，但我只會打「呱」，所以還是你來吧。', 'I tried answering your emails, but I can only type "honk." Over to you.'],
    ['工作中的企鵝請勿餵食。除非是魚。', 'Please don\'t feed the working penguin. Unless it\'s fish.'],
    ['今天的任務有點多，但我不覺得它們打得過你。', 'There are a few tasks today, but I don\'t think they stand a chance.'],
    ['我在你的專注時間外面蓋了一圈冰牆，閒雜人等請繞道。', 'I built an ice wall around your focus time. Visitors, please detour.'],
    ['我觀察到：完成一件事之後，下一件就沒那麼可怕了。', 'Observation: after finishing one thing, the next one looks less scary.'],
    ['我在日曆上找到一段空白，我先在上面躺一下。', 'I found a gap in your calendar. I\'m lying down in it for a second.'],
    ['我把便利貼貼在自己肚子上，現在我是一份會走路的待辦清單。', 'I stuck a sticky note on my tummy. I\'m now a walking to-do list.'],
  ]),
  ...group('tip', [
    ['把大任務切成小塊，就像把冰山切成冰塊——比較好放進飲料。', 'Cut big tasks into small pieces, like turning an iceberg into ice cubes. Much easier to fit in a drink.'],
    ['喝口水吧。企鵝都住在水邊，這不是巧合。', 'Have a sip of water. Penguins live next to water. That\'s not a coincidence.'],
    ['站起來伸展一下，假裝你是剛睡醒的企鵝，把鰭伸到最長。', 'Stand up and stretch. Pretend you\'re a penguin waking up and reach your flippers as far as they go.'],
    ['桌上東西太多的時候，挑三樣收起來，剩下的會感謝你。', 'If your desk is crowded, put away three things. The rest will thank you.'],
    ['不想做的任務，先做兩分鐘就好。兩分鐘後通常就滑進去了。', 'Stuck on a task? Do just two minutes. Usually you\'ll slide right in.'],
    ['眼睛看螢幕太久了，望向遠方 20 秒，假裝在眺望南極。', 'Look at something far away for 20 seconds. Pretend it\'s Antarctica.'],
    ['說「不」也是一種完成任務的方式。企鵝常常對北極熊說不。', 'Saying no is also a way to finish a task. Penguins say no to polar bears all the time.'],
    ['一次只做一件事。企鵝一次只抓一條魚，抓得很好。', 'One thing at a time. Penguins catch one fish at a time, and they\'re great at it.'],
    ['深呼吸三次：吸氣像在聞烤魚，吐氣像在吹涼熱湯。', 'Take three deep breaths: in like you\'re smelling grilled fish, out like you\'re cooling soup.'],
    ['把手機放遠一點。它會想你，但它會沒事的。', 'Put your phone a little farther away. It\'ll miss you, but it\'ll be fine.'],
    ['如果一件事五分鐘內做得完，現在就做掉，別讓它長大。', 'If it takes under five minutes, do it now before it grows.'],
    ['休息不是偷懶，是充電。企鵝也要趴在冰上充電。', 'Resting isn\'t slacking, it\'s charging. Even penguins flop on the ice to recharge.'],
    ['寫下明天第一件要做的事，明天的你會少發呆三分鐘。', 'Write down tomorrow\'s first task. Tomorrow-you gets three extra minutes.'],
    ['肩膀是不是快聳到耳朵旁邊了？放下來，那裡不是它的家。', 'Are your shoulders up by your ears? Lower them. That\'s not where they live.'],
    ['把重要的事排在精神最好的時段，就像企鵝挑魚最多的時候下水。', 'Schedule important work for your sharpest hours, like penguins diving when the fish are plentiful.'],
    ['分頁開太多了嗎？關掉三個，當作在清冰箱。', 'Too many tabs open? Close three. Think of it as cleaning the fridge.'],
    ['起來走一小段路，回來的時候點子常常會跟著你回來。', 'Take a short walk. Ideas like to follow you back.'],
    ['任務寫得越具體越好做。「整理」很可怕，「回三封信」就還好。', 'Specific tasks are easier. "Organize" is scary. "Reply to three emails" is fine.'],
    ['專注 25 分鐘就好。企鵝可以 25 分鐘不看魚，你也可以。', 'Try 25 minutes of focus. A penguin can go 25 minutes without looking at fish. So can you.'],
    ['跟自己說話溫柔一點，你每天都跟自己相處。', 'Talk to yourself kindly. You spend every single day together.'],
    ['同類型的事一起做，就像把信全部丟進同一個冰桶。', 'Batch similar tasks, like tossing all the mail into one ice bucket.'],
    ['轉轉脖子，左三圈右三圈。慢慢來，你不是貓頭鷹。', 'Roll your neck, three times each way. Slowly. You\'re not an owl.'],
    ['覺得卡住的時候換個位置坐。企鵝換一塊浮冰，視野就不一樣了。', 'Feeling stuck? Change seats. A new ice floe brings a new view.'],
    ['回一句「今天做不到，明天下午可以」，比默默拖著好很多。', '"I can\'t today, but tomorrow afternoon works" beats silently letting it slide.'],
    ['把桌上的空杯子拿去洗，這是一個保證會成功的任務。', 'Take that empty mug to the sink. It\'s a task guaranteed to succeed.'],
    ['眨眨眼。你可能已經好一陣子沒有好好眨眼了。', 'Blink a few times. You may not have blinked properly in a while.'],
    ['午餐別在鍵盤前面吃，鍵盤不需要吃飯。', 'Don\'t eat lunch over the keyboard. The keyboard isn\'t hungry.'],
    ['排今天的事，最多挑三件「一定要」，其他的叫「有空再說」。', 'When you plan, pick at most three musts. Everything else is "if there\'s time."'],
    ['通知可以先關一下，世界不會因為你晚十分鐘回覆就結冰。', 'Mute notifications for a bit. The world won\'t freeze if you reply ten minutes later.'],
    ['喝水時間到！如果你剛喝過，那就再喝一口慶祝。', 'Water time! If you just had some, take a celebratory sip.'],
    ['坐姿檢查：屁股往後坐、背靠好。企鵝站得很直，你可以坐得很直。', 'Posture check: sit back, back supported. Penguins stand tall; you can sit tall.'],
    ['先做最怕的那件事，接下來整天都是下坡滑行。', 'Do the scariest task first. The rest of the day becomes downhill sliding.'],
    ['把「思考」也排進日曆，想事情也是正經工作。', 'Put thinking time on your calendar. Thinking is real work.'],
    ['開會前先寫下想要的結論，會議就比較不會漂流到南極。', 'Write down the outcome you want before a meeting, so it doesn\'t drift off to Antarctica.'],
    ['一個任務卡了三天？它可能是三個任務疊在一起假扮成一個。', 'A task stuck for three days? It might be three tasks stacked in a trench coat.'],
    ['伸展手腕：手掌往前推，像在跟海浪說「停」。', 'Wrist stretch: push your palms forward like you\'re telling a wave to stop.'],
    ['整理桌面從離你最近的那一小塊開始就好，不用一次清完整片南極。', 'Tidy the square of desk nearest you. You don\'t have to clean all of Antarctica.'],
    ['同一段讀了三遍？該休息了。企鵝讀到第三遍就會去游泳。', 'Read the same paragraph three times? Break time. Penguins go swimming by then.'],
    ['答應別人之前先說「我看一下行程」，幫自己爭取一點冷靜思考的時間。', 'Before saying yes, say "let me check my calendar." It buys some cool-headed thinking time.'],
    ['做完的事也記下來。已完成清單是很好用的暖暖包。', 'Write down what you finished too. A done list makes a great hand warmer.'],
    ['把最常開的連結釘好，每次少找三十秒，一年能省下好幾條魚。', 'Pin the links you open most. Thirty seconds saved each time adds up to a lot of fish per year.'],
    ['很累的時候先照顧身體：喝水、吃點東西、走兩步，腦袋會跟上。', 'When you\'re drained, fix the body first: water, a snack, a few steps. The brain follows.'],
    ['別同時追兩條魚，你會看著兩條都游走。', 'Don\'t chase two fish at once. You\'ll watch both swim away.'],
    ['收工前花兩分鐘收尾，明天的你會踩在剛整理好的冰面上。', 'Spend two minutes wrapping up before you stop. Tomorrow-you gets freshly groomed ice.'],
    ['「完美」是很冷的地方，「完成」比較溫暖。', '"Perfect" is a very cold place. "Done" is much warmer.'],
    ['心裡很亂的時候，把腦中的事全丟到白板上，讓它們去白板上吵。', 'Head too noisy? Dump everything onto the whiteboard and let it argue there.'],
    ['幫自己設一個收工時間，企鵝也有下班時間。', 'Set yourself a stop time. Even penguins clock out.'],
    ['去裝水，順便看一下窗外。一趟旅行，兩個收穫。', 'Walk to refill your water and glance out a window. A two-for-one trip.'],
    ['大任務先寫下第一步要按哪個按鈕，越具體越好。', 'For a big task, write down which button you\'ll press first. Be that specific.'],
    ['在等別人回覆的事另外列一區，別讓它們占住腦袋的冰箱。', 'Keep a separate list for things you\'re waiting on, so they don\'t hog your brain fridge.'],
    ['放開滑鼠，握拳再張開，重複五次。手也需要下課。', 'Let go of the mouse. Make a fist, open it, five times. Hands need recess too.'],
    ['先把今天的會議連結打開放好，時間到就不用在冰上滑來滑去找。', 'Open today\'s meeting links ahead of time so you\'re not sliding around looking for them.'],
    ['覺得事情太多時，挑一個最小的先勾掉。勾勾聲是最好的暖身。', 'Too much on the list? Check off the smallest one first. That click is a great warm-up.'],
    ['如果某件事一直被排到「明天」，也許今天該問問它到底要不要做。', 'If something keeps landing on "tomorrow," ask it today whether it needs doing at all.'],
    ['用一首歌的時間站起來動一動，企鵝也會跟著節奏搖擺。', 'Stand up for the length of one song. Penguins sway to the beat too.'],
    ['桌上的紙分成三堆：要做、要留、要丟。企鵝建議第三堆最大。', 'Sort the paper pile into do, keep, toss. Penguins recommend a big toss pile.'],
    ['信寫太長了？試試刪掉第一段，通常會變得更清楚。', 'Email getting long? Try deleting the first paragraph. It usually gets clearer.'],
    ['午後想睡很正常，去洗把臉，像剛從海裡上岸的企鵝。', 'An afternoon slump is normal. Splash your face like a penguin fresh out of the sea.'],
    ['行程裡留一點空白，才不會像一塊擠滿企鵝的浮冰。', 'Leave some empty time, or your schedule becomes an ice floe packed with penguins.'],
    ['今天沒做完也沒關係，選好明天的第一件事，就算漂亮收工。', 'Not everything got done? That\'s okay. Pick tomorrow\'s first task and call it a graceful finish.'],
  ]),
  ...group('celebrate', [
    ['完成！我在旁邊用鰭幫你鼓掌，啪啪啪。', 'Done! Flipper applause: flap flap flap.'],
    ['又勾掉一個！我要去冰上滑一圈慶祝。', 'Another one checked off! Celebratory lap on the ice.'],
    ['做得好！這值得一條想像中的魚。', 'Nice! That earns you one imaginary fish.'],
    ['任務完成，企鵝高興到原地轉了一圈。', 'Task done. Penguin spun in a happy little circle.'],
    ['太好了，清單變短了，我要把這件事寫進我的回憶錄。', 'Excellent. The list got shorter. This is going in my memoir.'],
    ['勾勾聲真好聽，可以再來一次嗎？', 'That checkmark sound is lovely. Encore?'],
    ['恭喜！你剛剛讓一個任務安心退休了。', 'Congrats! You just let a task retire peacefully.'],
    ['我替那個任務辦了畢業典禮，它哭得很開心。', 'I held a graduation for that task. Happy tears everywhere.'],
    ['又完成一件！我的肚子因為驕傲又更圓了。', 'One more done! My tummy got rounder with pride.'],
    ['呱！這是企鵝語的「超棒」。', 'Honk! That\'s Penguin for "amazing."'],
    ['又搞定一件，建議現在喝口水慶祝一下。', 'Another one handled. I suggest a celebratory sip of water.'],
    ['這個任務被你處理得服服貼貼。', 'You handled that task beautifully.'],
    ['我把這次完成刻在冰塊上了，它會很冷靜地永遠記得。', 'I carved that win into an ice cube. It\'ll remember, coolly.'],
    ['做完了！我去跟冰箱炫耀一下。', 'Done! Off to brag to the fridge.'],
  ]),
  ...group('night', [
    ['已經 {time} 了，連月亮都打了三個呵欠。去睡吧，任務明天還會在。', 'It\'s {time}. Even the moon has yawned three times. Go to sleep; the tasks will still be here tomorrow.'],
    ['深夜企鵝備忘錄：螢幕很亮，被窩很暖，你知道該選哪個。', 'Late-night penguin memo: the screen is bright, the blanket is warm. You know which to pick.'],
    ['我已經換好睡衣了（其實就是原本那件），你也該準備睡了。', 'I\'ve changed into my pajamas (same outfit, honestly). Time for you to wind down too.'],
    ['{time} 了，明天的你正在拜託現在的你去睡覺。', 'It\'s {time}. Tomorrow-you is politely asking current-you to go to bed.'],
    ['夜深了，我先把今天收進冰箱保鮮，明天再拿出來。', 'It\'s late. I\'ll put today in the fridge to keep it fresh. We\'ll take it out tomorrow.'],
    ['企鵝規定：過了午夜，所有待辦都要先睡覺。你也是。', 'Penguin rule: after midnight, all to-dos go to sleep first. You too.'],
    ['我數羊數到第 400 隻，發現其實都是企鵝。換你去數了。', 'I counted 400 sheep and realized they were all penguins. Your turn.'],
    ['熬夜不會讓任務變少，只會讓企鵝變擔心。晚安。', 'Staying up won\'t shrink the list. It just worries the penguin. Good night.'],
  ]),
  ...group('overdue', [
    ['你有 {count} 個逾期任務。我把它們藏在冰箱了，但冰箱快滿了。', 'Overdue tasks: {count}. I hid them in the fridge, but the fridge is getting full.'],
    ['有 {count} 個任務過了原本的日子，它們在門口排隊，還自備了小板凳。', '{count} overdue. They\'re lining up at the door with tiny stools.'],
    ['報告：逾期任務 {count} 個。它們沒生氣，只是有點想你。', 'Report: {count} overdue. They\'re not mad, just a little lonely.'],
    ['{count} 個逾期任務正在冰上慢慢漂遠，要不要去「待整理」把它們撈回來？', 'Overdue count: {count}, slowly drifting away on the ice. Want to fish them back in Review?'],
    ['我數了一下，有 {count} 個任務錯過了它們的日子。挑一個重新排時間就很棒了。', 'I counted {count} overdue. Rescheduling just one is a great start.'],
    ['逾期任務 {count} 個。好消息是：它們都還活著。', 'Overdue tasks: {count}. Good news: they\'re all still alive.'],
    ['有 {count} 個任務在「待整理」等你，我已經幫它們蓋好被子了。', '{count} overdue, waiting in Review. I tucked them in with a little blanket.'],
  ]),
  ...group('meeting', [
    ['「{title}」再 {time} 分鐘開始。我已經把領結整理好了，你呢？', '"{title}" starts in {time} min. I\'ve straightened my bow tie. You?'],
    ['會議提醒：「{title}」{time} 分鐘後開始。建議先喝口水、打開連結。', 'Heads-up: "{title}" in {time} min. Sip some water and open the link.'],
    ['{time} 分鐘後有「{title}」。我不會跟去，因為我沒有鏡頭。', '"{title}" in {time} min. I won\'t join; I don\'t have a camera.'],
    ['呱！「{title}」快開始了（{time} 分鐘），我先幫你暖場。', 'Honk! "{title}" is almost here ({time} min). I\'ll warm up the room.'],
    ['再 {time} 分鐘就是「{title}」，現在去一趟洗手間是很有遠見的決定。', '"{title}" starts in {time} min. A bathroom break now would be very wise.'],
    ['「{title}」在 {time} 分鐘後。建議配件：一個微笑和一杯水。', '"{title}" in {time} min. Recommended accessories: a smile and a glass of water.'],
  ]),
  ...group('focusEnd', [
    ['專注時間結束！你剛剛超專心，我連呼吸都不敢太大聲。', 'Focus session done! You were so locked in I barely dared to breathe.'],
    ['叮！專注完成。站起來抖一抖，像剛上岸的企鵝。', 'Ding! Focus done. Stand up and shake it out like a penguin fresh from the sea.'],
    ['番茄熟了！去喝口水吧，我幫你顧著畫面。', 'The tomato is ripe! Go grab some water; I\'ll watch the screen.'],
    ['專注結束。我在旁邊安靜了整整一段，好難，給我們兩個一點掌聲。', 'Focus complete. I stayed quiet the whole time. That was hard. Applause for both of us.'],
    ['你專心的樣子好帥。現在讓眼睛看看遠方休息一下。', 'You looked great focusing. Now rest your eyes on something far away.'],
    ['完成一段專注！要不要先走兩步，再回來下一段？', 'Focus block complete! How about a short walk before the next one?'],
  ]),
  ...group('checkIn', [
    ['今天還沒簽到喔。我已經在簽到本上畫了一隻企鵝等你。', 'You haven\'t checked in today. I doodled a penguin on the sign-in sheet for you.'],
    ['傍晚了，今天的簽到還空著。去按一下，我今天就不再提了。', 'It\'s evening and today\'s check-in is still empty. One tap and I\'ll drop it for today.'],
    ['簽到提醒：今天的你還沒留下腳印，企鵝腳印也可以。', 'Check-in reminder: no footprint for today yet. Penguin prints count.'],
    ['今天還沒簽到。連續天數正在門口搓著鰭等你。', 'No check-in yet today. Your streak is waiting by the door, rubbing its flippers.'],
    ['我去簽到本偷看了一下，今天那格還空空的。', 'I peeked at the check-in book. Today\'s box is still empty.'],
  ]),
  ...group('poke', [
    ['嘿！那是我的肚子。', 'Hey! That\'s my tummy.'],
    ['再戳我就要變成企鵝麻糬了。', 'Poke me again and I\'ll turn into penguin mochi.'],
    ['咕嚕咕嚕……我在旋轉，請稍候。', 'Spinning... please hold.'],
    ['好啦好啦，我跳給你看！', 'Fine, fine, I\'ll jump!'],
    ['（害羞地把臉藏起來）', '(hides face shyly)'],
    ['你是不是想跟我玩？我只會站著。', 'Do you want to play? I mostly stand.'],
    ['被戳到的地方有點癢。', 'That tickles.'],
    ['我暈了，現在看到三個你。', 'I\'m dizzy. I see three of you.'],
    ['呱！（這是抗議，很有禮貌的那種）', 'Honk! (A very polite protest.)'],
    ['你戳的力道剛剛好，給你五顆星。', 'Perfect poke pressure. Five stars.'],
    ['我要跟冰箱告狀……開玩笑的。', 'I\'m telling the fridge on you... kidding.'],
    ['好了好了，我要回去工作了（假裝）。', 'Okay, okay, back to work (pretend).'],
  ]),
  ...group('hello', [
    ['嗨，我是{name}！以後我住在這個角落，偶爾說點奇怪的話。', 'Hi, I\'m {name}! I live in this corner now. I\'ll say odd things now and then.'],
    ['{name}報到！我會安靜待著，你需要笑一下的時候點我。', '{name} reporting for duty! I\'ll stay quiet. Tap me when you need a laugh.'],
    ['我是{name}，很圓，很友善，不太會飛。請多指教。', 'I\'m {name}. Very round, very friendly, not great at flying. Nice to meet you.'],
  ]),
]

export function linesOf(cat: PetLineCategory): PetLine[] {
  return PET_LINES.filter((l) => l.cat === cat)
}

/** Fill {placeholders}; unknown keys are left as-is. */
export function renderLine(line: PetLine, lang: 'zh-TW' | 'en', vars: Record<string, string | number> = {}): string {
  const text = (lang === 'en' ? line.en ?? line.zh : line.zh ?? line.en) ?? ''
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

// ─── 24h no-repeat memory ─────────────────────────────────────────────

const RECENT_KEY = 'huddle-pet-recent-v1'
const DAY_MS = 24 * 60 * 60 * 1000

function readRecent(now: number): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const out: Record<string, number> = {}
    for (const [id, ts] of Object.entries(parsed)) if (typeof ts === 'number' && now - ts < DAY_MS) out[id] = ts
    return out
  } catch {
    return {}
  }
}

function writeRecent(map: Record<string, number>) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable — repeats are acceptable */
  }
}

/**
 * Pick a line in `lang` from `cats` (weighted by how many lines each category has)
 * that hasn't been said in the last 24 hours on this device. When every
 * candidate was used, the least recently used one wins. Records the pick.
 */
export function pickLine(cats: PetLineCategory[], lang: 'zh-TW' | 'en', rand: () => number = Math.random): PetLine {
  const now = Date.now()
  const recent = typeof window === 'undefined' ? {} : readRecent(now)
  const pool = PET_LINES.filter((l) => cats.includes(l.cat) && (lang === 'en' ? l.en : l.zh))
  const fresh = pool.filter((l) => !(l.id in recent))
  const line = fresh.length > 0
    ? fresh[Math.floor(rand() * fresh.length)]
    : [...pool].sort((a, b) => (recent[a.id] ?? 0) - (recent[b.id] ?? 0))[0]
  if (typeof window !== 'undefined') writeRecent({ ...recent, [line.id]: now })
  return line
}
