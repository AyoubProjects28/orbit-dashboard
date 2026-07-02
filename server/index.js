// Thin Express backend for the Orbit dashboard.
// Its only real job right now: serve /api/metrics from mock data.
// Later (see mcpClient.js), this route will call the real MCP on
// mcp-test01 instead — the frontend contract (the JSON shape) stays the same.

import express from 'express';
import { getMockMetrics } from './mock.js';

const app = express();
const PORT = 3001;

app.get('/api/metrics', (req, res) => {
  res.json(getMockMetrics());
});

app.listen(PORT, () => {
  console.log(`Orbit backend listening on http://localhost:${PORT}`);
});
