import { createFileRoute, Navigate } from "@tanstack/react-router";

// Root "/" is protected via a client-side check — mirrored under the
// _authenticated layout below at /_authenticated/index. We keep this route
// as a thin redirect target so the URL stays "/" for signed-in users.
export const Route = createFileRoute("/")({
  ssr: false,
  component: () => <Navigate to="/dashboard" replace />,
});
