'use client'
import { Suspense } from 'react'
import { WidgetGallery } from '@/components/widgets/widget-gallery'
import { useI18n } from '@/lib/i18n/react'
export default function WidgetsPage() {
  const { t } = useI18n()
  return <Suspense fallback={<main>{t('載入小工具…')}</main>}><WidgetGallery/></Suspense>
}
