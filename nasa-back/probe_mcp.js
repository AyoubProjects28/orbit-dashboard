import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const MCP_URL = process.env.ORBIT_MCP_URL || 'http://172.18.53.9:8000/mcp'
const t = new StreamableHTTPClientTransport(new URL(MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.ORBIT_MCP_TOKEN}` } },
})
const c = new Client({ name: 'probe', version: '1.0.0' })
await c.connect(t)
const { tools } = await c.listTools()
for (const tool of tools) {
  console.log('== TOOL:', tool.name)
  console.log('   desc :', tool.description)
  console.log('   args :', JSON.stringify(tool.inputSchema))
}
console.log('\n=== list_documents (sortie brute) ===')
console.log(JSON.stringify(await c.callTool({ name: 'list_documents', arguments: {} }), null, 2))
process.exit(0)
