import { createClient } from "@/lib/supabase/client";

export interface MeetingTaskDraft {
  title: string;
  owner: string;
  dueDate: string;
  source: string;
  ownerParticipantId?: string;
  ownerEvidence?: string;
  assignmentConfidence?: "explicit" | "uncertain";
  assignmentReason?: string;
  assigneeId?: string;
}
export interface MeetingParticipant {
  id: string;
  name: string;
  organization: string;
  aliases: string[];
  userId: string;
}
export interface MeetingPeer {
  peer_id: string;
  display_name: string | null;
}
export interface MeetingAssignment {
  id: string;
  sender_id: string;
  sender_name: string;
  title: string;
  due_date: string | null;
  source: string;
  meeting_title: string;
  meeting_date: string;
  status: "pending" | "accepted" | "rejected";
  task_id: string | null;
  created_at: string;
}
export interface MeetingImport {
  id: string;
  title: string;
  meeting_date: string;
  status: "pending" | "succeeded" | "failed";
  created_at: string;
  result: {
    summary: string;
    decisions: string[];
    questions: string[];
    tasks: MeetingTaskDraft[];
  } | null;
  imported_tasks: Record<string, string>;
  context?: {
    meetingTime: string;
    participants: MeetingParticipant[];
    categoryId: string;
    autoSelf: boolean;
  };
  checklist?: Record<string, MeetingTaskDraft>;
  assignments?: {
    id: string;
    source_index: number;
    recipient_id: string;
    status: "pending" | "accepted" | "rejected";
  }[];
}
export interface MeetingList {
  meetings: MeetingImport[];
  used: number;
  pending: number;
  limit: number;
  month: string;
  enabled: boolean;
}
const messages: Record<string, string> = {
  INVALID_PARTICIPANTS: "與會者帳號重複或已無共享關係，請重新選擇。",
  ASSIGNMENT_RESPONSE_FAILED: "未能處理指派，請確認共享關係與目標分類後重試。",
  MONTHLY_LIMIT: "本月已使用 20 次，下個月 1 日（台北時間）會重新開放。",
  RATE_LIMIT: "短時間內嘗試較多，請稍後再試。",
  REQUEST_CONFLICT: "這份內容已變更，請開始新的整理。",
  AI_NOT_CONFIGURED: "AI 整理尚未啟用，請稍後再試。",
  UNAUTHORIZED: "登入已過期，請重新登入。",
  INPUT_TOO_LARGE: "文字太長了，請縮短至 40,000 字元以內。",
  INVALID_INPUT: "請確認標題、會議日期和逐字稿格式。",
  GENERATION_FAILED: "這次未能完成整理，沒有扣除次數。請重試。",
  IMPORT_FAILED: "任務未能建立，請確認目標分類仍可使用後重試。",
};
export async function meetingRequest<T>(
  userId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const client = createClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session?.user.id !== userId)
    throw new Error("帳號已切換，請重新開啟會議轉任務。");
  const { data, error } = await client.functions.invoke("meeting-import", {
    body,
  });
  const current = await client.auth.getSession();
  if (current.data.session?.user.id !== userId)
    throw new Error("帳號已切換，請重新開啟會議轉任務。");
  if (error) {
    let code = "";
    try {
      code = (await error.context?.json())?.error ?? "";
    } catch {
      /* offline */
    }
    throw new Error(
      messages[code] ||
        "暫時無法連線。內容仍留在此頁，可稍後重試或重新整理紀錄狀態。",
    );
  }
  return data as T;
}
