import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type JobSource = {
  id: string;
  name: string | null;
  slug: string | null;
  is_enabled: boolean | null;
  description: string | null;
};

function SettingsPage() {
  const q = useQuery({
    queryKey: ["job_sources"],
    queryFn: async () => {
      const { data, error } = await supabase.from("job_sources").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as JobSource[];
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Job sources currently configured for the platform.</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Job sources</CardTitle><CardDescription>Read-only — managed by the platform.</CardDescription></CardHeader>
        <CardContent>
          {q.isLoading ? <Skeleton className="h-40" /> : q.error ? (
            <div className="text-sm text-destructive">Couldn't load sources.</div>
          ) : (q.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No sources configured.</div>
          ) : (
            <ul className="divide-y">
              {q.data!.map((s) => (
                <li key={s.id} className="py-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{s.name ?? s.slug ?? s.id}</div>
                    {s.description && <div className="text-sm text-muted-foreground">{s.description}</div>}
                  </div>
                  <Badge variant={s.is_enabled ? "default" : "outline"}>
                    {s.is_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
