// Real MCP client — connects to mcp-test01 over streamable-http with a
// bearer token. This is the Node sibling of test_client_remote.py: same
// env vars (ORBIT_MCP_URL, ORBIT_MCP_TOKEN), same connectivity check
// (tools/list, then call echo/add/server_time).
//
// Not wired into index.js yet — this is step 1: prove the path from
// web-test01 to mcp-test01 works over the network, matching the toy
// tools the MCP exposes today. Once JB/Manish's real tools (get_gpu_usage,
// get_latency, ...) exist, callMcpTool() below is reused as-is; only a
// getMetricsFromMcp() normalizer needs to be added on top (see
// ARCHITECTURE_Orbit_synthese.md §2/§3).

import { pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

let client = null

export async function connectMcp() {
  const url = process.env.ORBIT_MCP_URL
  const token = process.env.ORBIT_MCP_TOKEN

  if (!url || !token) {
    throw new Error(
      'Set ORBIT_MCP_URL (e.g. http://mcp-test01:8000/mcp) and ORBIT_MCP_TOKEN before connecting.'
    )
  }

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })

  client = new Client({ name: 'orbit-backend', version: '0.0.0' })
  await client.connect(transport)
  return client
}

export async function listMcpTools() {
  if (!client) throw new Error('connectMcp() must be called first')
  const { tools } = await client.listTools()
  return tools
}

export async function callMcpTool(name, args = {}) {
  if (!client) throw new Error('connectMcp() must be called first')
  return client.callTool({ name, arguments: args })
}

export async function closeMcp() {
  if (!client) return
  await client.close()
  client = null
}

// Connectivity check — equivalent to test_client_remote.py. Run directly
// with `node mcpClient.js` from web-test01 to prove the path to
// mcp-test01 works end to end.
async function checkConnectivity() {
  console.log(`Connecting to ${process.env.ORBIT_MCP_URL} ...`)

  await connectMcp()

  const tools = await listMcpTools()
  console.log('Tools advertised:', tools.map((t) => t.name))

  const echo = await callMcpTool('echo', { message: 'hello from across the network' })
  console.log('echo ->', echo.content[0].text)

  const add = await callMcpTool('add', { a: 10, b: 32 })
  console.log('add ->', add.content[0].text)

  const time = await callMcpTool('server_time', {})
  console.log('server_time ->', time.content[0].text)

  console.log('\nAll good — the remote path works end to end.')

  await closeMcp()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkConnectivity().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
