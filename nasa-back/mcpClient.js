// Client MCP — seul fichier qui parle le protocole MCP (streamable-http + token).
// Fait tools/list une fois au démarrage (init) et met la liste en cache ;
// callTool() exécute un outil par son nom à la demande de index.js.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const MCP_URL = process.env.ORBIT_MCP_URL || 'http://172.18.53.9:8000/mcp'
const MCP_TOKEN = process.env.ORBIT_MCP_TOKEN

let client = null
let cachedTools = []

export async function init() {
  if (!MCP_TOKEN) {
    throw new Error('ORBIT_MCP_TOKEN is not set — refusing to connect to the MCP server without a token.')
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${MCP_TOKEN}` },
    },
  })

  client = new Client({ name: 'orbit-backend', version: '1.0.0' })
  await client.connect(transport)

  const { tools } = await client.listTools()
  cachedTools = tools

  console.log(`[mcpClient] connected to ${MCP_URL}, cached ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}`)

  return cachedTools
}

export function getTools() {
  return cachedTools
}

export async function callTool(name, args) {
  if (!client) {
    throw new Error('mcpClient not initialized — call init() first.')
  }
  return client.callTool({ name, arguments: args })
}
