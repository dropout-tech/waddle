/**
 * 中日韓輸入法（IME）組字偵測。
 *
 * 用注音／拼音／假名打字時，按 Enter 的第一下是「確定選字」，不該被當成送出。
 * 瀏覽器在組字期間會把 `isComposing` 設為 true（Safari 舊版只給 keyCode 229），
 * 所以兩個都檢查。
 *
 * 用法：任何「按 Enter 送出」的 handler，第一行先擋掉組字中的事件。
 *
 *   onKeyDown={(e) => {
 *     if (e.key === 'Enter' && !isImeComposing(e)) handleSubmit()
 *   }}
 */
export function isImeComposing(
  e: Pick<React.KeyboardEvent, 'nativeEvent'> | KeyboardEvent,
): boolean {
  const native = 'nativeEvent' in e ? e.nativeEvent : e
  return native.isComposing === true || native.keyCode === 229
}

/**
 * 「Enter 送出，但組字中不算」的簡寫。
 * 回傳 true 代表這是一次真正的送出意圖。
 */
export function isSubmitEnter(
  e: React.KeyboardEvent | KeyboardEvent,
  opts: { allowShift?: boolean } = {},
): boolean {
  if (e.key !== 'Enter') return false
  if (isImeComposing(e)) return false
  if (!opts.allowShift && e.shiftKey) return false
  return true
}
