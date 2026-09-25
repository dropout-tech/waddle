import { Suspense } from 'react'
import { WidgetGallery } from '@/components/widgets/widget-gallery'
export default function WidgetsPage() { return <Suspense fallback={<main>載入小工具…</main>}><WidgetGallery/></Suspense> }
