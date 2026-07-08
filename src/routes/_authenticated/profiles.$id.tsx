import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Upload, Plus, Trash2, Search, ArrowLeft, Loader2 } from "lucide-react";
import type { Profile, Resume, ProfileKeyword, SearchRun, KeywordType } from "@/lib/db-types";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/profiles/$id")({
  component: ProfileDetail,
});

const KEYWORD_TYPES: KeywordType[] = ["title", "skill", "tool", "industry", "seniority", "location", "negative"];

function ProfileDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const resumesQ = useQuery({
    queryKey: ["resumes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumes").select("*").eq("profile_id", id)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Resume[];
    },
  });

  const keywordsQ = useQuery({
    queryKey: ["keywords", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_keywords").select("*").eq("profile_id", id)
        .order("keyword_type").order("keyword");
      if (error) throw error;
      return (data ?? []) as ProfileKeyword[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["runs", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_runs").select("*").eq("profile_id", id)
        .order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as SearchRun[];
    },
  });

  if (profileQ.isLoading) {
    return <div className="max-w-4xl space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  }
  if (profileQ.error || !profileQ.data) {
    return <div className="max-w-2xl"><Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-4 text-sm">Couldn't load this profile.</CardContent></Card></div>;
  }

  const profile = profileQ.data;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <Link to="/profiles" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" /> All profiles
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{profile.profile_name}</h1>
            <p className="text-sm text-muted-foreground">{profile.target_role ?? "No target role"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/profiles/$id" params={{ id }}>Jobs</Link>
            </Button>
            <Button asChild>
              <Link to="/profiles/$id" params={{ id }}><Search className="h-4 w-4" /> Run search</Link>
            </Button>
          </div>
        </div>
      </div>

      <ProfileForm profile={profile} onSaved={() => qc.invalidateQueries({ queryKey: ["profile", id] })} />

      <ResumeSection profileId={id} resumes={resumesQ.data ?? []} loading={resumesQ.isLoading} />

      <KeywordsSection
        profileId={id}
        keywords={keywordsQ.data ?? []}
        loading={keywordsQ.isLoading}
      />

      <SearchRunsSection runs={runsQ.data ?? []} loading={runsQ.isLoading} />
    </div>
  );
}

/* --- Profile edit form --- */

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [form, setForm] = useState({
    profile_name: profile.profile_name,
    target_role: profile.target_role ?? "",
    location_preference: profile.location_preference ?? "",
    remote_preference: profile.remote_preference ?? "any",
    salary_min: profile.salary_min?.toString() ?? "",
    salary_max: profile.salary_max?.toString() ?? "",
    job_age_filter_days: profile.job_age_filter_days?.toString() ?? "30",
    notes: profile.notes ?? "",
  });

  useEffect(() => {
    setForm({
      profile_name: profile.profile_name,
      target_role: profile.target_role ?? "",
      location_preference: profile.location_preference ?? "",
      remote_preference: profile.remote_preference ?? "any",
      salary_min: profile.salary_min?.toString() ?? "",
      salary_max: profile.salary_max?.toString() ?? "",
      job_age_filter_days: profile.job_age_filter_days?.toString() ?? "30",
      notes: profile.notes ?? "",
    });
  }, [profile]);

  const saveM = useMutation({
    mutationFn: async () => {
      const patch = {
        profile_name: form.profile_name.trim(),
        target_role: form.target_role.trim() || null,
        location_preference: form.location_preference.trim() || null,
        remote_preference: form.remote_preference || null,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        job_age_filter_days: form.job_age_filter_days ? Number(form.job_age_filter_days) : null,
        notes: form.notes.trim() || null,
      };
      const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); onSaved(); },
    onError: () => toast.error("Couldn't save changes."),
  });

  const bind = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile settings</CardTitle>
        <CardDescription>Used to filter and score job matches for this profile.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); saveM.mutate(); }}
        >
          <Field label="Profile name" id="pn"><Input id="pn" {...bind("profile_name")} required maxLength={120} /></Field>
          <Field label="Target role" id="tr"><Input id="tr" {...bind("target_role")} maxLength={120} /></Field>
          <Field label="Location preference" id="lp"><Input id="lp" {...bind("location_preference")} placeholder="e.g. EU timezone" maxLength={120} /></Field>
          <Field label="Remote preference" id="rp">
            <Select value={form.remote_preference} onValueChange={(v) => setForm((f) => ({ ...f, remote_preference: v }))}>
              <SelectTrigger id="rp"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="remote">Remote only</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Salary min (USD)" id="smin"><Input id="smin" type="number" min={0} {...bind("salary_min")} /></Field>
          <Field label="Salary max (USD)" id="smax"><Input id="smax" type="number" min={0} {...bind("salary_max")} /></Field>
          <Field label="Job age filter (days)" id="age"><Input id="age" type="number" min={1} max={365} {...bind("job_age_filter_days")} /></Field>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...bind("notes")} rows={3} maxLength={2000} className="mt-2" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={saveM.isPending}>
              {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/* --- Resume section --- */

function ResumeSection({ profileId, resumes, loading }: { profileId: string; resumes: Resume[]; loading: boolean }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function upload() {
    if (!text.trim()) return toast.error("Paste your resume text first.");
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      const res = await fetch("/api/resume-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          user_id: userRes.user.id,
          profile_id: profileId,
          resume_text: text,
          file_name: fileName || "resume.txt",
          storage_path: null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed");
      toast.success(`Resume processed — ${json.keywords_extracted ?? 0} keywords extracted`);
      setText(""); setFileName("");
      qc.invalidateQueries({ queryKey: ["resumes", profileId] });
      qc.invalidateQueries({ queryKey: ["keywords", profileId] });
    } catch {
      toast.error("Couldn't process resume. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume</CardTitle>
        <CardDescription>Paste your resume text; keywords are extracted automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <Input placeholder="File name (optional)" value={fileName} onChange={(e) => setFileName(e.target.value)} maxLength={200} />
          <Textarea rows={8} placeholder="Paste resume text…" value={text} onChange={(e) => setText(e.target.value)} maxLength={50000} />
          <div className="flex justify-end">
            <Button onClick={upload} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Processing…" : "Upload & extract keywords"}
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <div className="text-sm font-medium mb-2">History</div>
          {loading ? <Skeleton className="h-16" /> : resumes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No resumes uploaded yet.</div>
          ) : (
            <ul className="divide-y border rounded-md">
              {resumes.map((r) => (
                <li key={r.id} className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{r.file_name ?? "resume"} <span className="text-muted-foreground">v{r.version}</span></div>
                    <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                  </div>
                  {r.is_current && <Badge>Current</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* --- Keywords --- */

function KeywordsSection({ profileId, keywords, loading }: { profileId: string; keywords: ProfileKeyword[]; loading: boolean }) {
  const qc = useQueryClient();
  const [newKw, setNewKw] = useState("");
  const [newType, setNewType] = useState<KeywordType>("skill");

  const grouped = KEYWORD_TYPES.map((t) => ({ type: t, items: keywords.filter((k) => k.keyword_type === t) }));

  const toggleM = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("profile_keywords").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keywords", profileId] }),
    onError: () => toast.error("Couldn't update keyword."),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profile_keywords").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Keyword removed"); qc.invalidateQueries({ queryKey: ["keywords", profileId] }); },
    onError: () => toast.error("Couldn't remove keyword."),
  });

  const addM = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { error } = await supabase.from("profile_keywords").insert({
        profile_id: profileId,
        user_id: user.user.id,
        keyword: newKw.trim(),
        keyword_type: newType,
        source: "user_added",
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNewKw(""); toast.success("Keyword added"); qc.invalidateQueries({ queryKey: ["keywords", profileId] }); },
    onError: () => toast.error("Couldn't add keyword."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Keywords</CardTitle>
        <CardDescription>Grouped by type. Toggle to include or exclude from matching.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(e) => { e.preventDefault(); if (newKw.trim()) addM.mutate(); }}
        >
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="kw">Add keyword</Label>
            <Input id="kw" value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="e.g. PostgreSQL" maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kt">Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as KeywordType)}>
              <SelectTrigger id="kt" className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KEYWORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={addM.isPending || !newKw.trim()}><Plus className="h-4 w-4" /> Add</Button>
        </form>

        <Separator />

        {loading ? <Skeleton className="h-40" /> : keywords.length === 0 ? (
          <div className="text-sm text-muted-foreground">No keywords yet. Upload a resume or add some manually.</div>
        ) : (
          <div className="space-y-5">
            {grouped.filter((g) => g.items.length > 0).map((g) => (
              <div key={g.type}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{g.type}</div>
                <ul className="flex flex-wrap gap-2">
                  {g.items.map((k) => (
                    <li key={k.id} className={`group flex items-center gap-2 border rounded-full pl-3 pr-1 py-1 text-sm ${k.is_active ? "" : "opacity-50"}`}>
                      <span className="font-medium">{k.keyword}</span>
                      <Badge variant={k.source === "ai_generated" ? "secondary" : "outline"} className="text-[10px] uppercase">
                        {k.source === "ai_generated" ? "AI" : "You"}
                      </Badge>
                      <Switch
                        checked={k.is_active}
                        onCheckedChange={(v) => toggleM.mutate({ id: k.id, is_active: v })}
                        aria-label="Toggle keyword"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteM.mutate(k.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --- Runs --- */

function SearchRunsSection({ runs, loading }: { runs: SearchRun[]; loading: boolean }) {
  const variant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    completed: "default", running: "secondary", pending: "outline", failed: "destructive",
  };
  return (
    <Card>
      <CardHeader><CardTitle>Search runs</CardTitle><CardDescription>Most recent 10.</CardDescription></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-24" /> : runs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No runs yet.</div>
        ) : (
          <ul className="divide-y">
            {runs.map((r) => (
              <li key={r.id} className="py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant={variant[r.status] ?? "outline"}>{r.status}</Badge>
                  <div className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
                </div>
                <div className="text-muted-foreground">
                  {r.jobs_fetched ?? 0} fetched · {r.jobs_inserted ?? 0} new · {r.jobs_matched ?? 0} matched
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
