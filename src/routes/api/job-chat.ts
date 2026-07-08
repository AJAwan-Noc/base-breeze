import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser, jsonError, proxyToN8n } from "@/lib/api-helpers.server";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  job_id: z.string().uuid(),
  chat_session_id: z.string().uuid().nullable(),
  message: z.string().min(1).max(8000),
});

export const Route = createFileRoute("/api/job-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return jsonError(400, "Invalid request"); }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return jsonError(400, "Invalid request");
        const auth = await requireUser(request, parsed.data.user_id);
        if (auth instanceof Response) return auth;
        return proxyToN8n("/job-chat", parsed.data);
      },
    },
  },
});
