import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Plus, Search, Users, Briefcase, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Profile, SearchRun } from "@/lib/db-types";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const runStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  pending: "outline",
  failed: "destructive",
};

function Dashboard() {
  const profilesQ = useQuery({
    queryKey: ["profiles", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const runsQ = useQuery({
    queryKey: ["search_runs", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as SearchRun[];
    },
  });

  const statsQ = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [matches, interested] = await Promise.all([
        supabase.from("profile_job_matches").select("id", { count: "exact", head: true }),
        supabase.from("user_job_statuses").select("id", { count: "exact", head: true }).eq("status", "interested"),
      ]);
      return {
        matches: matches.count ?? 0,
        interested: interested.count ?? 0,
      };
    },
  });

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your job-search profiles, matches, and recent runs.</p>
        </div>
        <Button asChild>
          <Link to="/profiles"><Plus className="h-4 w-4" /> New profile</Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Active profiles" value={profilesQ.data?.length} loading={profilesQ.isLoading} />
        <StatCard icon={Sparkles} label="Total matches" value={statsQ.data?.matches} loading={statsQ.isLoading} />
        <StatCard icon={Briefcase} label="Marked interested" value={statsQ.data?.interested} loading={statsQ.isLoading} />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Profiles</h2>
          <Link to="/profiles" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>
        </div>
        {profilesQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        ) : profilesQ.error ? (
          <ErrorBox>Couldn't load your profiles.</ErrorBox>
        ) : profilesQ.data && profilesQ.data.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {profilesQ.data.slice(0, 4).map((p) => (
              <Link key={p.id} to="/profiles/$id" params={{ id: p.id }} className="block">
                <Card className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{p.profile_name}</CardTitle>
                    <CardDescription>{p.target_role ?? "No target role set"}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{p.remote_preference ?? "Any remote"}{p.location_preference ? ` · ${p.location_preference}` : ""}</span>
                    <ArrowRight className="h-4 w-4" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No profiles yet"
            body="Create your first search profile to upload a resume and start matching."
            cta={<Button asChild><Link to="/profiles"><Plus className="h-4 w-4" /> Create profile</Link></Button>}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent search runs</h2>
        {runsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : runsQ.error ? (
          <ErrorBox>Couldn't load recent runs.</ErrorBox>
        ) : runsQ.data && runsQ.data.length > 0 ? (
          <Card>
            <CardContent className="p-0 divide-y">
              {runsQ.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge variant={runStatusVariant[r.status] ?? "outline"}>{r.status}</Badge>
                    <div>
                      <div className="font-medium">{r.jobs_matched ?? 0} matched · {r.jobs_inserted ?? 0} new</div>
                      <div className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <Link to="/profiles/$id" params={{ id: r.profile_id }} className="text-muted-foreground hover:text-foreground">
                    View profile →
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Search} title="No searches yet" body="Runs will appear here once you launch a search from a profile." />
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, loading }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | undefined; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-semibold">{loading ? "—" : value ?? 0}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, body, cta }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; cta?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center flex flex-col items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground max-w-sm">{body}</div>
        </div>
        {cta}
      </CardContent>
    </Card>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 text-sm text-destructive">{children}</CardContent>
    </Card>
  );
}
