// STUB — not used yet.
//
// Once the MCP on mcp-test01 is reachable (address, port, transport, and
// tool list confirmed by JB/Manish — see PLAN §8), this file will:
//   1. open a connection to the MCP using @modelcontextprotocol/sdk
//   2. call its tools (e.g. get_gpu_usage, get_latency, ...)
//   3. normalize the results into the same shape mock.js produces, so
//      server/index.js can swap getMockMetrics() for getMetricsFromMcp()
//      without the frontend noticing any difference.
//
// Sketch of what this will look like (not implemented yet):
//
// import { Client } from '@modelcontextprotocol/sdk/client/index.js';
//
// export async function getMetricsFromMcp() {
//   // const client = new Client(...);
//   // const gpuData = await client.callTool('get_gpu_usage');
//   // const latencyData = await client.callTool('get_latency');
//   // ...normalize into the same JSON shape as getMockMetrics()
// }
