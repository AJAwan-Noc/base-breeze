import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Archive, ArchiveRestore, ArrowRight } from "lucide-react";
import type { Profile } from "@/lib/db-types";

export const Route = createFileRoute("/_authenticated/profiles")({
  component: ProfilesPage,
});

function ProfilesPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["profiles", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_archived", tab === "archived")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const archiveM = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_archived: archive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.archive ? "Profile archived" : "Profile restored");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: () => toast.error("Couldn't update this profile."),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
          <p className="text-sm text-muted-foreground">Each profile has its own resume, keywords, and job matches.</p>
        </div>
        <NewProfileButton />
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-3">
          {q.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
          ) : q.error ? (
            <Card className="border-destructive/40 bg-destructive/5"><CardContent className="p-4 text-sm text-destructive">Couldn't load profiles.</CardContent></Card>
          ) : q.data && q.data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {q.data.map((p) => (
                <Card key={p.id} className="group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{p.profile_name}</CardTitle>
                        <CardDescription>{p.target_role ?? "No target role"}</CardDescription>
                      </div>
                      {p.is_archived && <Badge variant="outline">Archived</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">
                      {p.remote_preference ?? "Any remote"}
                      {p.location_preference ? ` · ${p.location_preference}` : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => archiveM.mutate({ id: p.id, archive: !p.is_archived })}
                        disabled={archiveM.isPending}
                      >
                        {p.is_archived ? <><ArchiveRestore className="h-4 w-4" /> Restore</> : <><Archive className="h-4 w-4" /> Archive</>}
                      </Button>
                      <Button size="sm" asChild>
                        <Link to="/profiles/$id" params={{ id: p.id }}>Open <ArrowRight className="h-4 w-4" /></Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">
              {tab === "active" ? "No profiles yet — create one to get started." : "Nothing archived."}
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewProfileButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          user_id: user.user.id,
          profile_name: name.trim(),
          target_role: role.trim() || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => {
      toast.success("Profile created");
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setOpen(false);
      setName(""); setRole("");
    },
    onError: () => toast.error("Couldn't create profile."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> New profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
          <DialogDescription>You can edit everything else after it's created.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) createM.mutate(); }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="pname">Profile name</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Backend Roles" maxLength={120} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prole">Target role (optional)</Label>
            <Input id="prole" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Backend Engineer" maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createM.isPending || !name.trim()}>
              {createM.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
