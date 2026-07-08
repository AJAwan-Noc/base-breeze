import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser, jsonError, proxyToN8n } from "@/lib/api-helpers.server";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  resume_text: z.string().min(1).max(200_000),
  file_name: z.string().max(300).nullable().optional(),
  storage_path: z.string().max(1000).nullable().optional(),
});

export const Route = createFileRoute("/api/resume-extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "Invalid request"); }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return jsonError(400, "Invalid request");
        const auth = await requireUser(request, parsed.data.user_id);
        if (auth instanceof Response) return auth;
        return proxyToN8n("/resume-extract", parsed.data);
      },
    },
  },
});
