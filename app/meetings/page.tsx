"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/components/auth/auth-provider";
import { MeetingWorkspace } from "@/components/meetings/meeting-workspace";

export default function MeetingsPage() {
  const { user } = useAuth();
  return (
    <AuthGuard>
      {user && <MeetingWorkspace key={user.id} userId={user.id} />}
    </AuthGuard>
  );
}
