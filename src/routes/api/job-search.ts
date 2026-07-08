import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser, jsonError, proxyToN8n } from "@/lib/api-helpers.server";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  keywords: z.array(z.string()).default([]),
  target_titles: z.array(z.string()).default([]),
  filters: z.object({ posted_within_days: z.number().int().positive().max(365) }).passthrough(),
  sources: z.array(z.string()).min(1),
});

export const Route = createFileRoute("/api/job-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "Invalid request"); }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return jsonError(400, "Invalid request");
        const auth = await requireUser(request, parsed.data.user_id);
        if (auth instanceof Response) return auth;
        return proxyToN8n("/job-search-run", parsed.data);
      },
    },
  },
});
