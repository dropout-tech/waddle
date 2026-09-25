// English dictionary fragment — keys are the Traditional Chinese source strings.
// Scope: user-menu nav items, auth-guard suspended-account state, desktop OAuth
// pending state, /auth/callback error states, /widgets and /assignments pages,
// components/operations/shared.tsx (Shell/Loading, shared with membership.tsx).
export const dict: Record<string, string> = {
  // components/user-menu.tsx
  '會員與推薦': 'Membership & referrals',
  '會議轉任務': 'Meetings to tasks',
  '待接受指派': 'Pending assignments',

  // components/auth/auth-guard.tsx
  '帳號已停用': 'Account suspended',
  '如有疑問，請聯絡客服。你的資料未因停用而刪除。': 'If you have questions, please contact support. Your data has not been deleted.',
  '聯絡客服': 'Contact support',

  // components/auth/desktop-login-pending.tsx
  '請在瀏覽器完成登入，再選擇「開啟 Huddle」。': 'Finish signing in in the browser, then choose "Open Huddle".',
  '取消登入並重試': 'Cancel and try again',

  // app/auth/callback/page.tsx
  '登入連線逾時，請返回登入頁重試。': 'The sign-in connection timed out. Please go back to the login page and try again.',
  '無法完成桌面登入，請返回桌面程式重新登入。': 'Could not complete desktop sign-in. Please return to the desktop app and sign in again.',
  '登入已取消，請返回登入頁重新選擇登入方式。': 'Sign-in was cancelled. Please go back to the login page and choose a sign-in method again.',
  '登入連結已失效，或登入驗證未完成。請使用原本的瀏覽器重新登入。': 'The sign-in link has expired, or verification did not complete. Please sign in again in the same browser you started with.',
  '登入未完成': 'Sign-in incomplete',
  '返回登入頁': 'Back to login',
  '登入連結已失效': 'Sign-in link expired',
  '返回 Huddle 完成登入': 'Return to Huddle to finish signing in',
  '請回到桌面程式重新登入。': 'Please return to the desktop app and sign in again.',
  '點擊下方按鈕，並允許瀏覽器開啟 Huddle。': 'Tap the button below and allow the browser to open Huddle.',
  '開啟 Huddle': 'Open Huddle',

  // app/widgets/page.tsx
  '載入小工具…': 'Loading widget…',

  // app/assignments/page.tsx
  '返回工作面板': 'Back to workspace',
  '指派給我的任務': 'Tasks assigned to me',

  // components/operations/shared.tsx (Shell / Loading — used by membership.tsx)
  '回工作空間': 'Back to workspace',
  '正在讀取資料…': 'Loading…',

  // components/operations/membership.tsx
  '已儲存': 'Saved',
  '操作失敗，請再試一次': 'Something went wrong, please try again',
  '已複製，可以分享給朋友了': 'Copied — ready to share with a friend',
  '無法自動複製，請選取下方文字手動複製。': 'Could not copy automatically. Please select the text below and copy it manually.',
  '重新載入': 'Reload',
  '你的 Pro 使用時間': 'Your Pro time',
  '目前使用基本版': 'Currently on the free plan',
  '可使用至 {date}（台北時間）': 'Usable until {date} (Taipei time)',
  '優惠與推薦取得的時間會列在這裡，原有資料會保留。': 'Time earned from promotions and referrals will be listed here; your existing data is kept.',
  '付費權益至 {date}。贈送時間接在付費權益之後；商店自動續訂與扣款仍依原訂閱設定，請在購買商店管理。': 'Paid access until {date}. Gifted time is applied after paid access ends; auto-renewal and billing still follow your original subscription — manage them in the store you purchased from.',
  '你的推薦碼': 'Your referral code',
  '新朋友在註冊後 7 天內使用並完成帳號驗證，你就能獲得 {days} 天。每年最多 {cap} 天。': "When a new friend uses it within 7 days of signing up and verifies their account, you'll get {days} days. Up to {cap} days per year.",
  '推薦獎勵目前暫停。你仍可準備自己的推薦碼；活動開啟後才會發放獎勵。': 'Referral rewards are currently paused. You can still set up your referral code — rewards will be granted once the program reopens.',
  '專屬推薦連結': 'Your referral link',
  '複製連結': 'Copy link',
  '複製推薦碼': 'Copy referral code',
  '產生我的推薦碼': 'Generate my referral code',
  '已成功推薦 {count} 人 · 累積獲得 {days} 天': 'Successfully referred {count} people · earned {days} days total',
  '化名與排行榜': 'Alias & leaderboard',
  '公開時只顯示化名與有效推薦人數，不會顯示 Email、頭像或真實姓名。你可以隨時退出排行榜。': 'When public, only your alias and valid referral count are shown — never your email, avatar, or real name. You can opt out of the leaderboard anytime.',
  '公開化名': 'Public alias',
  '2–24 個字，請勿使用個人聯絡資訊。': '2–24 characters. Do not use personal contact info.',
  '讓我的化名出現在推薦排行榜': 'Show my alias on the referral leaderboard',
  '儲存化名與公開設定': 'Save alias & visibility',
  '兌換優惠碼': 'Redeem a coupon code',
  '兌換前會檢查活動期限、名額與適用對象。同一個碼每人限用一次。': 'Redeeming checks the promotion window, remaining slots, and eligibility. Each code can be used once per person.',
  '活動優惠碼': 'Coupon code',
  '兌換使用時間': 'Redeem time',
  '優惠活動暫停中': 'Promotion paused',
  '朋友的推薦碼': "A friend's referral code",
  '已綁定推薦人，推薦獎勵不會重複發放。': 'A referrer is already linked; referral rewards are not granted twice.',
  '註冊後 7 天內可補填一次。新戶推薦體驗總共 {days} 天，包含已領取的新戶體驗；活動優惠擇優，不重複贈送。': 'Can be filled in once within 7 days of signing up. The new-user referral trial totals {days} days, including any new-user trial already claimed; promotions apply the best offer, not both.',
  '推薦碼': 'Referral code',
  '套用推薦碼': 'Apply referral code',
  '推薦排行榜': 'Referral leaderboard',
  '依累積有效推薦人數排序，相同人數並列。只列出願意公開的會員，最多顯示 100 位。': 'Ranked by total valid referrals; ties are shown together. Only members who opted in are listed, up to 100.',
  '排行榜目前暫停公開。': 'The leaderboard is currently not public.',
  '（你）': ' (you)',
  '{count} 人': '{count} referrals',
  '目前還沒有公開的推薦紀錄。邀請第一位朋友，一起開始。': 'No public referrals yet. Invite your first friend to get started.',
  '使用時間紀錄': 'Time grant history',
  '來源': 'Source',
  '天數': 'Days',
  '領取時間': 'Granted at',
  '狀態': 'Status',
  '+{days} 天': '+{days} days',
  '已撤銷': 'Revoked',
  '可使用至 {date}': 'Usable until {date}',
  '尚未領取贈送時間。': 'No gifted time received yet.',
  '會員服務尚未啟用，請稍後再試。管理員需先完成資料庫更新。': 'Membership service is not enabled yet, please try again later. An admin needs to finish the database update first.',

  // components/meetings/participants-editor.tsx
  '與會者與帳號': 'Participants & accounts',
  '填寫姓名、團隊及逐字稿中的別名。只有連結到「我」且有明確原文依據的任務，才會自動加入自己的清單。未連結帳號的人保留為未指派。': "Fill in each person's name, team, and aliases used in the transcript. Only tasks linked to \"me\" with clear evidence in the transcript are added to your own list automatically. People without a linked account stay unassigned.",
  '姓名': 'Name',
  '與會者 {n} 姓名': 'Participant {n} name',
  '團隊': 'Team',
  '與會者 {n} 團隊': 'Participant {n} team',
  '逐字稿別名（逗號分隔）': 'Transcript aliases (comma-separated)',
  '與會者 {n} 別名': 'Participant {n} aliases',
  '對應 Huddle 帳號': 'Linked Huddle account',
  '與會者 {n} 帳號': 'Participant {n} account',
  '未連結帳號': 'No linked account',
  '我': 'Me',
  '共享夥伴': 'Shared peer',
  '移除此人': 'Remove this person',
  '新增與會者': 'Add participant',
}
