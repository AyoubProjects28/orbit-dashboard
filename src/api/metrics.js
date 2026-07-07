// Fetches the current metrics snapshot from the backend.
// During local dev, Vite forwards /api/* to the Express server (see
// vite.config.js). In production, nginx does the same forwarding.
// Either way, this is the only place in the frontend that knows the
// endpoint's URL.

export async function fetchMetrics() {
  const response = await fetch('/api/metrics');
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: ${response.status}`);
  }
  return response.json();
}
