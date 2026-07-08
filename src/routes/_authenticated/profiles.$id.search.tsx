import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { authedFetch } from "@/lib/authed-fetch";
import { toast } from "sonner";
import { ArrowLeft, Play, Loader2 } from "lucide-react";
import type { Profile, ProfileKeyword, SearchRun } from "@/lib/db-types";

export const Route = createFileRoute("/_authenticated/profiles/$id/search")({
  component: SearchPage,
});

const SOURCES: { id: string; label: string; paid?: boolean }[] = [
  { id: "remoteok", label: "RemoteOK" },
  { id: "adzuna", label: "Adzuna" },
  { id: "remotive", label: "Remotive" },
  { id: "himalayas", label: "Himalayas" },
  { id: "jobicy", label: "Jobicy" },
  { id: "arbeitnow", label: "Arbeitnow" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "ats", label: "ATS boards" },
  { id: "apify_all_jobs", label: "Apify — All Jobs", paid: true },
];

function SearchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["profile", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const keywordsQ = useQuery({
    queryKey: ["keywords", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_keywords").select("*").eq("profile_id", id).eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as ProfileKeyword[];
    },
  });

  // Selection state
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (keywordsQ.data) setSelectedKeywords(new Set(keywordsQ.data.map((k) => k.id)));
  }, [keywordsQ.data]);

  const [postedWithin, setPostedWithin] = useState("30");
  const [remoteType, setRemoteType] = useState("any");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [sources, setSources] = useState<Set<string>>(
    () => new Set(SOURCES.filter((s) => !s.paid).map((s) => s.id)),
  );

  // Run state
  const [runId, setRunId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [runResult, setRunResult] = useState<null | { fetched: number; inserted: number; matched: number }>(null);

  const activeRunQ = useQuery({
    queryKey: ["run", runId],
    enabled: !!runId,
    refetchInterval: (q) => {
      const r = q.state.data as SearchRun | undefined;
      if (!r) return 3000;
      return r.status === "completed" || r.status === "failed" ? false : 3000;
    },
    queryFn: async () => {
      const { data, error } = await supabase.from("search_runs").select("*").eq("id", runId!).single();
      if (error) throw error;
      return data as SearchRun;
    },
  });

  useEffect(() => {
    const r = activeRunQ.data;
    if (r && (r.status === "completed" || r.status === "failed")) {
      qc.invalidateQueries({ queryKey: ["runs", id] });
    }
  }, [activeRunQ.data, id, qc]);

  const keywordsByType = useMemo(() => {
    const m = new Map<string, ProfileKeyword[]>();
    (keywordsQ.data ?? []).forEach((k) => {
      const arr = m.get(k.keyword_type) ?? [];
      arr.push(k);
      m.set(k.keyword_type, arr);
    });
    return m;
  }, [keywordsQ.data]);

  async function launch() {
    if (!profileQ.data) return;
    if (sources.size === 0) return toast.error("Pick at least one source.");
    if (selectedKeywords.size === 0) return toast.error("Select at least one keyword.");
    setLaunching(true);
    setRunResult(null);
    try {
      const chosen = (keywordsQ.data ?? []).filter((k) => selectedKeywords.has(k.id));
      const titles = chosen.filter((k) => k.keyword_type === "title").map((k) => k.keyword);
      const keywords = chosen.filter((k) => k.keyword_type !== "title" && k.keyword_type !== "negative").map((k) => k.keyword);
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("no user");
      const res = await authedFetch("/api/job-search", {
        user_id: userRes.user.id,
        profile_id: id,
        keywords,
        target_titles: titles,
        filters: {
          posted_within_days: Number(postedWithin) || 30,
          remote_type: remoteType,
          salary_min: salaryMin ? Number(salaryMin) : null,
          salary_max: salaryMax ? Number(salaryMax) : null,
        },
        sources: Array.from(sources),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "failed");
      setRunId(json.search_run_id);
      setRunResult({
        fetched: json.fetched ?? 0,
        inserted: json.inserted ?? 0,
        matched: json.matched ?? 0,
      });
      toast.success("Search started");
    } catch {
      toast.error("Couldn't start the search. Try again in a moment.");
    } finally {
      setLaunching(false);
    }
  }

  const activeRun = activeRunQ.data;
  const isRunning = activeRun ? activeRun.status === "pending" || activeRun.status === "running" : false;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link to="/profiles/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Run a job search</h1>
        <p className="text-sm text-muted-foreground">
          {profileQ.data?.profile_name ?? "…"}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Keywords</CardTitle><CardDescription>Active keywords for this profile. Uncheck any you don't want to include.</CardDescription></CardHeader>
        <CardContent>
          {keywordsQ.isLoading ? <Skeleton className="h-24" /> : keywordsQ.data && keywordsQ.data.length > 0 ? (
            <div className="space-y-4">
              {Array.from(keywordsByType.entries()).map(([type, list]) => (
                <div key={type}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{type}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((k) => {
                      const on = selectedKeywords.has(k.id);
                      return (
                        <button
                          type="button"
                          key={k.id}
                          onClick={() => {
                            setSelectedKeywords((s) => {
                              const n = new Set(s);
                              if (on) n.delete(k.id); else n.add(k.id);
                              return n;
                            });
                          }}
                          className={`px-3 py-1 rounded-full border text-sm transition ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                        >
                          {k.keyword}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No active keywords. Add or enable some on the profile page first.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pw">Posted within (days)</Label>
            <Input id="pw" type="number" min={1} max={365} value={postedWithin} onChange={(e) => setPostedWithin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rt">Remote type</Label>
            <Select value={remoteType} onValueChange={setRemoteType}>
              <SelectTrigger id="rt"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="remote">Remote only</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="smin">Salary min (USD)</Label>
            <Input id="smin" type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="smax">Salary max (USD)</Label>
            <Input id="smax" type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sources</CardTitle><CardDescription>Pick which job boards to search.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {SOURCES.map((s) => {
            const checked = sources.has(s.id);
            return (
              <label key={s.id} className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer ${checked ? "border-primary/60 bg-primary/5" : ""}`}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    setSources((prev) => {
                      const n = new Set(prev);
                      if (v) n.add(s.id); else n.delete(s.id);
                      return n;
                    });
                  }}
                />
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2">
                    {s.label}
                    {s.paid && <Badge variant="secondary" className="text-[10px] uppercase">Paid · optional</Badge>}
                  </div>
                  {s.paid && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Uses a paid API. Off by default.
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {selectedKeywords.size} keywords · {sources.size} sources
        </div>
        <Button size="lg" onClick={launch} disabled={launching || isRunning}>
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {launching ? "Starting…" : isRunning ? "Search running…" : "Run search"}
        </Button>
      </div>

      {(isRunning || activeRun) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StatusBadge status={activeRun?.status ?? "pending"} /> Search progress
            </CardTitle>
            <CardDescription>Searches can take 1–3 minutes. This page auto-refreshes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRunning && <IndeterminateProgress />}
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <Stat label="Fetched" value={activeRun?.jobs_fetched ?? runResult?.fetched ?? 0} />
              <Stat label="New" value={activeRun?.jobs_inserted ?? runResult?.inserted ?? 0} />
              <Stat label="Matched" value={activeRun?.jobs_matched ?? runResult?.matched ?? 0} />
            </div>
            {activeRun?.status === "completed" && (
              <>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={() => navigate({ to: "/profiles/$id/jobs", params: { id } })}>
                    View matched jobs →
                  </Button>
                </div>
              </>
            )}
            {activeRun?.status === "failed" && (
              <div className="text-sm text-destructive">The search didn't finish successfully. You can try again.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const v = { completed: "default", running: "secondary", pending: "outline", failed: "destructive" } as const;
  return <Badge variant={(v[status as keyof typeof v] ?? "outline")}>{status}</Badge>;
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
function IndeterminateProgress() {
  const [v, setV] = useState(15);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    let t = 15;
    const id = setInterval(() => {
      t = Math.min(90, t + Math.random() * 4);
      setV(t);
    }, 1200);
    return () => { clearInterval(id); if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return <Progress value={v} />;
}
