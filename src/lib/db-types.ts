// Lightweight types for the tables we read/write. Not a full generated set.

export type Profile = {
  id: string;
  user_id: string;
  profile_name: string;
  target_role: string | null;
  location_preference: string | null;
  remote_preference: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_age_filter_days: number | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Resume = {
  id: string;
  profile_id: string;
  user_id: string;
  storage_path: string | null;
  file_name: string | null;
  resume_text: string | null;
  version: number;
  is_current: boolean;
  created_at: string;
};

export type KeywordType =
  | "title" | "skill" | "tool" | "industry" | "seniority" | "location" | "negative";

export type ProfileKeyword = {
  id: string;
  profile_id: string;
  user_id: string;
  resume_id: string | null;
  keyword: string;
  keyword_type: KeywordType;
  source: "ai_generated" | "user_added";
  is_active: boolean;
  priority: number | null;
  created_at: string;
};

export type SearchRun = {
  id: string;
  profile_id: string;
  user_id: string;
  status: "pending" | "running" | "completed" | "failed";
  filters: Record<string, unknown> | null;
  jobs_fetched: number | null;
  jobs_inserted: number | null;
  jobs_matched: number | null;
  errors: unknown;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Job = {
  id: string;
  source: string;
  external_id: string | null;
  title: string;
  company: string | null;
  location: string | null;
  remote_type: string | null;
  currency: string | null;
  url: string | null;
  apply_url: string | null;
  description: string | null;
  posted_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  tags: string[] | null;
  discovered_at: string;
  is_archived: boolean;
};

export type UserJobStatus = {
  id: string;
  user_id: string;
  job_id: string;
  profile_id: string | null;
  status: "not_reviewed" | "interested" | "applied" | "rejected" | "saved" | "hidden";
  status_changed_at: string;
  notes: string | null;
};

export type MatchTier = "perfect" | "somewhat" | "no";
export const matchTier = (score: number | null | undefined): MatchTier => {
  const s = score ?? 0;
  if (s >= 75) return "perfect";
  if (s >= 40) return "somewhat";
  return "no";
};
