// English dictionary fragment — keys are the Traditional Chinese source strings.
export const dict: Record<string, string> = {
  // app/(auth)/layout.tsx
  '慢慢搖擺，把事情做完': "Waddle along, get it done.",
  '切換語言': 'Switch language',

  // app/(auth)/login/page.tsx
  '登入失敗，請再試一次': 'Login failed, please try again',
  '使用 Google 登入': 'Continue with Google',
  '使用 Apple 登入': 'Continue with Apple',
  '或使用 Email': 'Or continue with email',
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

  // components/user-menu.tsx
  '使用者選單': 'User menu',
  '切換淺色': 'Switch to light mode',
  '切換深色': 'Switch to dark mode',
  '登出': 'Log out',

  // components/error-boundary.tsx
  '這個區塊發生錯誤': 'Something went wrong here',
  '請嘗試重新整理或回報此問題。': 'Please try refreshing, or report this issue.',
  '重試': 'Retry',

  // lib/auth/oauth.ts
  'Apple 登入未取得憑證': 'Apple sign-in did not return a credential',
}
