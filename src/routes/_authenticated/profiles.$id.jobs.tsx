import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, LayoutGrid, Rows3, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { matchTier, type Job, type Profile, type UserJobStatus } from "@/lib/db-types";

export const Route = createFileRoute("/_authenticated/profiles/$id/jobs")({
  component: JobsPage,
});

type Row = {
  match_id: string;
  job_id: string;
  match_score: number;
  fit_level: string | null;
  match_reason: string | null;
  scored_at: string;
  job: Job;
  status: UserJobStatus["status"];
};

const STATUS_OPTIONS: UserJobStatus["status"][] = ["not_reviewed", "interested", "applied", "rejected", "saved", "hidden"];

function JobsPage() {
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

  const rowsQ = useQuery({
    queryKey: ["profile-jobs", id],
    queryFn: async () => {
      const { data: matches, error } = await supabase
        .from("profile_job_matches")
        .select("id, job_id, match_score, fit_level, match_reason, scored_at, jobs(*)")
        .eq("profile_id", id)
        .order("match_score", { ascending: false })
        .limit(500);
      if (error) throw error;
      const statuses = await supabase
        .from("user_job_statuses")
        .select("job_id, status")
        .eq("profile_id", id);
      const statusMap = new Map<string, UserJobStatus["status"]>();
      (statuses.data ?? []).forEach((s: { job_id: string; status: UserJobStatus["status"] }) => statusMap.set(s.job_id, s.status));
      type MatchRow = {
        id: string; job_id: string; match_score: number; fit_level: string | null;
        match_reason: string | null; scored_at: string; jobs: Job | null;
      };
      return (matches as unknown as MatchRow[])
        .filter((m) => m.jobs)
        .map<Row>((m) => ({
          match_id: m.id,
          job_id: m.job_id,
          match_score: m.match_score,
          fit_level: m.fit_level,
          match_reason: m.match_reason,
          scored_at: m.scored_at,
          job: m.jobs as Job,
          status: statusMap.get(m.job_id) ?? "not_reviewed",
        }));
    },
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [days, setDays] = useState<string>("");
  const [view, setView] = useState<"cards" | "table">("cards");

  const filtered = useMemo(() => {
    const rows = rowsQ.data ?? [];
    const cutoff = days ? Date.now() - Number(days) * 86_400_000 : null;
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (sourceFilter !== "all" && r.job.source !== sourceFilter) return false;
      if (cutoff && r.job.posted_at && new Date(r.job.posted_at).getTime() < cutoff) return false;
      return true;
    });
  }, [rowsQ.data, statusFilter, sourceFilter, days]);

  const sources = useMemo(() => {
    const s = new Set<string>();
    (rowsQ.data ?? []).forEach((r) => r.job.source && s.add(r.job.source));
    return Array.from(s).sort();
  }, [rowsQ.data]);

  const tiers = useMemo(() => ({
    perfect: filtered.filter((r) => matchTier(r.match_score) === "perfect"),
    somewhat: filtered.filter((r) => matchTier(r.match_score) === "somewhat"),
    no: filtered.filter((r) => matchTier(r.match_score) === "no"),
  }), [filtered]);

  const setStatus = useMutation({
    mutationFn: async ({ jobId, status }: { jobId: string; status: UserJobStatus["status"] }) => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("no user");
      const { error } = await supabase.from("user_job_statuses").upsert({
        user_id: userRes.user.id,
        job_id: jobId,
        profile_id: id,
        status,
        status_changed_at: new Date().toISOString(),
      }, { onConflict: "user_id,job_id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["profile-jobs", id] }); },
    onError: () => toast.error("Couldn't update the status."),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link to="/profiles/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to profile
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
            <p className="text-sm text-muted-foreground">{profileQ.data?.profile_name ?? "…"}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/profiles/$id/search" params={{ id }}><Sparkles className="h-4 w-4" /> Run a new search</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-4">
          <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[["all", "All"], ...STATUS_OPTIONS.map<[string,string]>((s) => [s, s.replace("_", " ")])]} />
          <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter}
            options={[["all", "All"], ...sources.map<[string,string]>((s) => [s, s])]} />
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Posted within (days)</div>
            <Input type="number" min={1} max={365} placeholder="Any" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">View</div>
            <Tabs value={view} onValueChange={(v) => setView(v as "cards" | "table")}>
              <TabsList>
                <TabsTrigger value="cards"><LayoutGrid className="h-4 w-4" /> Cards</TabsTrigger>
                <TabsTrigger value="table"><Rows3 className="h-4 w-4" /> Table</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {rowsQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : rowsQ.error ? (
        <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-4 text-sm">Couldn't load matches.</CardContent></Card>
      ) : (rowsQ.data ?? []).length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No matches yet. Run a search to see results here.
        </CardContent></Card>
      ) : (
        <div className="space-y-8">
          <TierSection title="Perfect Match" tint="emerald" rows={tiers.perfect} view={view} onStatus={(j, s) => setStatus.mutate({ jobId: j, status: s })} />
          <TierSection title="Somewhat a Match" tint="amber" rows={tiers.somewhat} view={view} onStatus={(j, s) => setStatus.mutate({ jobId: j, status: s })} />
          <TierSection title="No Match" tint="slate" rows={tiers.no} view={view} onStatus={(j, s) => setStatus.mutate({ jobId: j, status: s })} />
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function TierSection({ title, tint, rows, view, onStatus }: {
  title: string; tint: "emerald" | "amber" | "slate";
  rows: Row[]; view: "cards" | "table";
  onStatus: (jobId: string, status: UserJobStatus["status"]) => void;
}) {
  const tintClasses = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  }[tint];
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${tintClasses}`}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nothing in this tier.</div>
      ) : view === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => <JobCard key={r.match_id} row={r} onStatus={onStatus} />)}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.match_id}>
                  <TableCell className="font-medium">
                    <Link to="/jobs/$id" params={{ id: r.job_id }} className="hover:underline">{r.job.title}</Link>
                  </TableCell>
                  <TableCell>{r.job.company ?? "—"}</TableCell>
                  <TableCell>{r.match_score}</TableCell>
                  <TableCell>{r.job.source}</TableCell>
                  <TableCell>{r.job.posted_at ? formatDistanceToNow(new Date(r.job.posted_at), { addSuffix: true }) : "—"}</TableCell>
                  <TableCell>
                    <StatusSelect value={r.status} onChange={(s) => onStatus(r.job_id, s)} />
                  </TableCell>
                  <TableCell>
                    {r.job.url && <a href={r.job.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}

function JobCard({ row, onStatus }: { row: Row; onStatus: (jobId: string, status: UserJobStatus["status"]) => void }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-snug">
              <Link to="/jobs/$id" params={{ id: row.job_id }} className="hover:underline">{row.job.title}</Link>
            </CardTitle>
            <CardDescription>
              {row.job.company ?? "Unknown"} · {row.job.location ?? row.job.remote_type ?? "—"}
            </CardDescription>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold leading-none">{row.match_score}</div>
            <div className="text-[10px] uppercase text-muted-foreground">score</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {row.match_reason && <p className="text-sm text-muted-foreground line-clamp-3">{row.match_reason}</p>}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{row.job.source}</Badge>
            {row.job.posted_at && <span>{formatDistanceToNow(new Date(row.job.posted_at), { addSuffix: true })}</span>}
          </div>
          <StatusSelect value={row.status} onChange={(s) => onStatus(row.job_id, s)} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusSelect({ value, onChange }: { value: UserJobStatus["status"]; onChange: (s: UserJobStatus["status"]) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UserJobStatus["status"])}>
      <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
