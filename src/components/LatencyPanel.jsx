import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function LatencyPanel({ data }) {
  const { latency_ms, throughput_rps } = data.network
  const { latency_ms: llm_latency_ms, overhead_ms, calls_last_turn } = data.llm

  // recharts needs an array of objects, but the schema gives us
  // [timestamp, value] pairs — so we convert one shape into the other.
  const chartData = data.series.latency_ms.map(([timestamp, value]) => ({
    time: formatTime(timestamp),
    value,
  }))

  return (
    <section className="panel" aria-label="Network latency">
      <h2>Network latency</h2>
      {chartData.length === 0 ? (
        <p className="panel-empty">Send a message to see latency.</p>
      ) : (
        <div className="panel-chart">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ left: 0, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.12)" />
              <XAxis dataKey="time" tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <YAxis unit="ms" width={76} tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <Tooltip formatter={(value) => `${value} ms`} contentStyle={{ background: '#160f24', border: '1px solid rgba(255,255,255,0.15)', color: '#f5f0ff' }} />
              <Line type="monotone" dataKey="value" stroke="#23e6d1" strokeWidth={2} dot={{ fill: '#23e6d1', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="panel-details">
        <div>
          <dt>Current latency</dt>
          <dd>{latency_ms} ms</dd>
        </div>
        <div>
          <dt>LLM latency (pure)</dt>
          <dd>{llm_latency_ms} ms</dd>
        </div>
        <div>
          <dt>Overhead (MCP + backend)</dt>
          <dd>{overhead_ms} ms</dd>
        </div>
        <div>
          <dt>LLM calls this turn</dt>
          <dd>{calls_last_turn}</dd>
        </div>
        <div>
          <dt>Throughput</dt>
          <dd>{throughput_rps} req/s</dd>
        </div>
      </dl>
    </section>
  )
}

export default LatencyPanel
