'use client'
import Link from 'next/link'
import { AuthGuard } from '@/components/auth/auth-guard'
import { AssignmentInbox } from '@/components/meetings/assignment-inbox'
export default function AssignmentsPage(){return <AuthGuard><main className="h-dvh overflow-y-auto bg-background px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]"><div className="mx-auto max-w-2xl"><Link href="/" className="mb-5 inline-flex min-h-11 items-center text-sm text-muted-foreground">返回工作面板</Link><h1 className="mb-6 text-2xl font-semibold">指派給我的任務</h1><AssignmentInbox/></div></main></AuthGuard>}
