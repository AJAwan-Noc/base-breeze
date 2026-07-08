import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Send, Loader2, DollarSign, MapPin, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { authedFetch } from "@/lib/authed-fetch";
import type { Job, UserJobStatus } from "@/lib/db-types";

export const Route = createFileRoute("/_authenticated/jobs/$id")({
  component: JobDetailPage,
});

const STATUS_OPTIONS: UserJobStatus["status"][] = ["not_reviewed", "interested", "applied", "rejected", "saved", "hidden"];

type Match = {
  id: string;
  profile_id: string;
  match_score: number;
  fit_level: string | null;
  match_reason: string | null;
  matching_keywords: string[] | null;
  missing_requirements: string[] | null;
  concerns: string[] | null;
  suggested_application_angle: string | null;
  scored_at: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function JobDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const jobQ = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Job;
    },
  });

  const matchQ = useQuery({
    queryKey: ["match", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_job_matches")
        .select("id, profile_id, match_score, fit_level, match_reason, matching_keywords, missing_requirements, concerns, suggested_application_angle, scored_at")
        .eq("job_id", id)
        .order("match_score", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Match | null;
    },
  });

  const statusQ = useQuery({
    queryKey: ["job-status", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_job_statuses")
        .select("status")
        .eq("job_id", id)
        .maybeSingle();
      if (error) throw error;
      return (data?.status ?? "not_reviewed") as UserJobStatus["status"];
    },
  });

  const setStatusM = useMutation({
    mutationFn: async (status: UserJobStatus["status"]) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("no user");
      const { error } = await supabase.from("user_job_statuses").upsert({
        user_id: userRes.user.id,
        job_id: id,
        profile_id: matchQ.data?.profile_id ?? null,
        status,
        status_changed_at: new Date().toISOString(),
      }, { onConflict: "user_id,job_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["job-status", id] }); },
    onError: () => toast.error("Couldn't update the status."),
  });

  if (jobQ.isLoading) return <div className="max-w-5xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  if (jobQ.error || !jobQ.data) return <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-4">Couldn't load this job.</CardContent></Card>;
  const job = jobQ.data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link
          to={matchQ.data ? "/profiles/$id/jobs" : "/"}
          params={matchQ.data ? { id: matchQ.data.profile_id } : {}}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-1">
              {job.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {job.company}</span>}
              {(job.location || job.remote_type) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {job.location ?? job.remote_type}</span>}
              {(job.salary_min || job.salary_max) && <span className="inline-flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> {formatSalary(job)}</span>}
              <Badge variant="outline">{job.source}</Badge>
              {job.posted_at && <span>Posted {formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusQ.data ?? "not_reviewed"} onValueChange={(v) => setStatusM.mutate(v as UserJobStatus["status"])}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            {job.apply_url || job.url ? (
              <Button asChild>
                <a href={job.apply_url ?? job.url ?? "#"} target="_blank" rel="noreferrer">
                  Open listing <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {matchQ.data && <MatchCard match={matchQ.data} />}
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                {job.description ?? "No description provided."}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-1">
          {matchQ.data ? (
            <ChatPanel jobId={id} profileId={matchQ.data.profile_id} />
          ) : (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Chat is available once this job is matched to one of your profiles.
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSalary(j: Job) {
  const c = j.currency ?? "USD";
  if (j.salary_min && j.salary_max) return `${c} ${j.salary_min.toLocaleString()}–${j.salary_max.toLocaleString()}`;
  if (j.salary_min) return `${c} ${j.salary_min.toLocaleString()}+`;
  if (j.salary_max) return `up to ${c} ${j.salary_max.toLocaleString()}`;
  return "";
}

function MatchCard({ match }: { match: Match }) {
  const tone =
    match.match_score >= 75 ? "text-emerald-600" :
    match.match_score >= 40 ? "text-amber-600" : "text-slate-500";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Match analysis</CardTitle>
            <CardDescription>{match.fit_level ?? "—"}</CardDescription>
          </div>
          <div className={`text-3xl font-semibold ${tone}`}>{match.match_score}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {match.match_reason && (
          <Block label="Why it matches">{match.match_reason}</Block>
        )}
        {match.matching_keywords && match.matching_keywords.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Matching keywords</div>
            <div className="flex flex-wrap gap-1.5">{match.matching_keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}</div>
          </div>
        )}
        {match.missing_requirements && match.missing_requirements.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Missing requirements</div>
            <ul className="list-disc pl-5 space-y-0.5">{match.missing_requirements.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
        )}
        {match.concerns && match.concerns.length > 0 && (
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Concerns</div>
            <ul className="list-disc pl-5 space-y-0.5">{match.concerns.map((k, i) => <li key={i}>{k}</li>)}</ul>
          </div>
        )}
        {match.suggested_application_angle && (
          <>
            <Separator />
            <Block label="Suggested angle">{match.suggested_application_angle}</Block>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function ChatPanel({ jobId, profileId }: { jobId: string; profileId: string }) {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find or create-a-session lazily. We look for the most recent session for this user+job+profile.
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data } = await supabase
        .from("job_chat_sessions")
        .select("id")
        .eq("user_id", userRes.user.id)
        .eq("job_id", jobId)
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id) setSessionId(data.id);
    })();
  }, [jobId, profileId]);

  const msgsQ = useQuery({
    queryKey: ["chat-msgs", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMsg[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgsQ.data, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("no user");
      const res = await authedFetch("/api/job-chat", {
        user_id: userRes.user.id,
        profile_id: profileId,
        job_id: jobId,
        chat_session_id: sessionId,
        message: text,
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "failed");
      if (!sessionId && json.session_id) setSessionId(json.session_id);
      qc.invalidateQueries({ queryKey: ["chat-msgs", json.session_id ?? sessionId] });
    } catch {
      toast.error("Couldn't send that message. Try again.");
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex flex-col h-[600px] sticky top-16">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-base">Ask about this job</CardTitle>
        <CardDescription>The assistant sees your profile and this listing.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-3">
          {!sessionId && !msgsQ.data?.length && (
            <div className="text-sm text-muted-foreground text-center py-10">
              Ask anything — "Would I be a fit?", "What should I highlight?", "Draft a cover letter opener."
            </div>
          )}
          {msgsQ.data?.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <div className="border-t p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex gap-2 items-end"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            rows={2}
            className="resize-none"
            maxLength={4000}
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </Card>
  );
}
