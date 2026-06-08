import { AuthGuard } from '@/components/auth/auth-guard'
import { NotebookPage } from '@/components/notebook/notebook-page'

// Standalone /notebook route — the Notion-style 記事本. AuthGuard gates it the
// same way app/page.tsx gates the main board, so the notebook's Supabase reads
// only run for a signed-in user.
export default function Notebook() {
  return (
    <AuthGuard>
      <NotebookPage />
    </AuthGuard>
  )
}
