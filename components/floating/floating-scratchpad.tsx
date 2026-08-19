'use client'

/**
 * 便條紙視窗裡的專注白板。
 *
 * 直接重用主視窗的 `<FocusScratchpad>`（同一份卡片 grid、同一套拖曳排序、
 * 同一個貼圖流程），只是換成 `fill` 版面填滿整個視窗、並改吃輕量的
 * `useScratchpad()` 資料層而不是整套 useWaddleData。
 *
 * 「升級為任務」在這裡刻意不接：建立任務要選工作區/分類，那是主視窗的事。
 */
import { useEffect } from 'react'
import { FocusScratchpad } from '@/components/scratchpad/focus-scratchpad'
import { useScratchpad } from '@/hooks/use-scratchpad'
import { useI18n } from '@/lib/i18n/react'

export function FloatingScratchpad() {
  const { t } = useI18n()
  const { scratchpadByDate, loading, addItem, updateItem, deleteItem, reorderItems, clearDate } =
    useScratchpad()

  useEffect(() => { document.title = `📌 ${t('專注白板')}` }, [t])

  if (loading) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">
        {t('載入中…')}
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-background">
      <FocusScratchpad
        isOpen
        onOpenChange={() => {}}
        hideTrigger
        fill
        scratchpadByDate={scratchpadByDate}
        onAddItem={addItem}
        onUpdateItem={updateItem}
        onDeleteItem={deleteItem}
        onReorderItems={reorderItems}
        onClearDate={clearDate}
      />
    </div>
  )
}
