// English dictionary fragment — keys are the Traditional Chinese source strings.
export const dict: Record<string, string> = {
  // app/(auth)/layout.tsx
  '切換語言': 'Switch language',

  // app/(auth)/login/page.tsx
  '登入失敗，請再試一次': 'Login failed, please try again',
  '使用 Google 登入': 'Continue with Google',
  '使用 Apple 登入': 'Continue with Apple',
  '或使用 Email': 'Or continue with email',
  '用 Email 登入': 'Sign in with email',
  '密碼': 'Password',
  '忘記密碼？': 'Forgot password?',
  '隱藏密碼': 'Hide password',
  '顯示密碼': 'Show password',
  '登入': 'Log in',
  '還沒有帳號？': "Don't have an account?",
  '建立帳號': 'Create account',
  'Email 或密碼不正確': 'Incorrect email or password',
  '請先到信箱點擊驗證連結': 'Please verify your email first',
  '此 Email 已註冊，請直接登入': 'This email is already registered — please log in instead',
  '密碼至少需要 6 個字元': 'Password must be at least 6 characters',
  '歡迎回來': 'Welcome back',
  '登入以繼續使用 Huddle': 'Log in to continue to Huddle',

  // app/(auth)/signup/page.tsx
  '使用 Google 註冊': 'Sign up with Google',
  '使用 Apple 註冊': 'Sign up with Apple',
  '檢查你的信箱': 'Check your inbox',
  '我們已寄出驗證連結到': "We've sent a verification link to",
  '點擊連結後即可登入。': 'Click the link to log in.',
  '返回登入': 'Back to login',
  'Huddle 現在只用 Google 或 Apple 登入。': 'Huddle now signs in with Google or Apple only.',
  '幾秒鐘就能開始使用 Huddle': 'Get started with Huddle in seconds',
  '至少 6 個字元': 'At least 6 characters',
  'Email 格式不正確': 'Invalid email format',
  '已經有帳號了？': 'Already have an account?',

  // app/page.tsx
  '新增任務到「{name}」': 'Add a task to "{name}"',
  '時間區塊': 'Time block',
  '各類時間安排': 'Scheduled blocks',
  '午休': 'Lunch break',
  '休息時間': 'Break time',
  '緩衝': 'Buffer',
  '彈性緩衝時間': 'Flexible buffer time',
  '專注': 'Focus',
  '專注工作時段': "Focused work session",
  '新任務': 'New task',
  '載入中...': 'Loading...',

  // components/auth/delete-account-button.tsx
  '刪除帳號失敗，請稍後再試': 'Failed to delete account, please try again later',
  '刪除帳號': 'Delete account',
  '確定要刪除帳號嗎？': 'Delete your account?',
  '這會永久刪除你的帳號與所有資料（任務、行程、日記、設定），無法復原。':
    'This permanently deletes your account and all your data (tasks, schedule, notes, settings) — this cannot be undone.',
  '取消': 'Cancel',
  '永久刪除': 'Delete permanently',
  '你若透過 iPhone 訂閱 Huddle Pro，扣款由 Apple 處理，刪除帳號不會停止扣款，請先取消訂閱。':
    'If you subscribed to Huddle Pro on iPhone, Apple handles the billing — deleting your account does not stop the charges, so cancel the subscription first.',
  '管理 Apple 訂閱': 'Manage Apple subscription',

  // components/user-menu.tsx
  '使用者選單': 'User menu',
  '切換淺色': 'Switch to light mode',
  '切換深色': 'Switch to dark mode',
  '登出': 'Log out',
  // use-safe-sign-out.tsx — notes / sticky notes that only exist on this device
  '還有內容沒有同步': 'Some changes haven\'t synced',
  '有 {count} 則筆記或便條紙還沒存到雲端。請連上網路、稍等幾秒再按一次登出（若筆記數量已達方案上限，請先刪掉一些筆記）；現在登出，這些內容會遺失。':
    '{count} {count|note or sticky note hasn\'t|notes or sticky notes haven\'t} been saved to the cloud yet. Get online, wait a few seconds and log out again (if you\'ve reached your plan\'s note limit, delete a few notes first) — if you log out now, that text will be lost.',
  '登出失敗，請檢查網路後再試一次': 'Couldn\'t log out. Check your connection and try again.',
  '先不要登出': 'Don\'t log out yet',
  '仍要登出': 'Log out anyway',

  // components/error-boundary.tsx
  '這個區塊發生錯誤': 'Something went wrong here',
  '請嘗試重新整理或回報此問題。': 'Please try refreshing, or report this issue.',
  '重試': 'Retry',

  // lib/auth/oauth.ts
  'Apple 登入未取得憑證': 'Apple sign-in did not return a credential',

  // app/(auth)/forgot-password/page.tsx
  '重設密碼': 'Reset password',
  '輸入註冊時的 Email，我們會寄一封重設連結給你。': "Enter the email you signed up with and we'll send you a reset link.",
  '寄送重設連結': 'Send reset link',
  '想起密碼了？': 'Remembered your password?',
  '重設連結已寄出': 'Reset link sent',
  '如果 {email} 有 Huddle 帳號，你會收到一封重設密碼的信。請點擊信中連結設定新密碼。': 'If {email} has a Huddle account, a password reset email is on its way. Click the link inside to set a new password.',
  '沒收到？檢查垃圾信件匣，或稍後再試一次。': 'Nothing yet? Check your spam folder, or try again in a bit.',
  '嘗試次數太多，請稍後再試': 'Too many attempts — please try again later',
  '寄送失敗，請稍後再試': "Couldn't send the email — please try again later",

  // app/reset-password/page.tsx
  '設定新密碼': 'Set a new password',
  '為你的帳號設定一組新密碼。': 'Choose a new password for your account.',
  '新密碼': 'New password',
  '再輸入一次新密碼': 'Re-enter new password',
  // '至少 6 個字元' and '兩次輸入的密碼不一致' already defined above (signup page)
  '新密碼不能與舊密碼相同': 'New password must be different from the old one',
  '更新失敗，請再試一次': "Couldn't update the password — please try again",
  '更新密碼': 'Update password',
  '連結已失效': 'This link has expired',
  '重設連結可能已過期或已被使用。請重新申請一封。': 'The reset link may have expired or already been used. Request a new one below.',
  '重新申請重設連結': 'Request a new reset link',
  '密碼登入已停用。請改用 Google 或 Apple 登入，或聯絡客服。':
    'Password sign-in is no longer available. Please sign in with Google or Apple, or contact support.',
  '密碼已更新': 'Password updated',
  '正在帶你回到 Huddle⋯': 'Taking you back to Huddle…',

  // error / not-found pages (2026-10 i18n sweep)
  '出了點小狀況': 'Something went wrong',
  '這一頁暫時打不開。請再試一次；如果還是不行，先回首頁看看。': 'This page couldn\'t load. Please try again. If it still doesn\'t work, head back home.',
  '回首頁': 'Back to home',
  '錯誤代碼：{code}': 'Error code: {code}',
  '找不到這一頁': 'We couldn\'t find that page',
  '網址可能打錯了，或這一頁已經搬家。': 'The link may be mistyped, or the page may have moved.',
}
