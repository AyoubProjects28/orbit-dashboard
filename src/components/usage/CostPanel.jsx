import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatCost(usd) {
  return usd < 0.01 ? `$${usd.toFixed(6)}` : `$${usd.toFixed(2)}`
}

function CostPanel({ data }) {
  const { per_request_usd, total_usd } = data.cost
  const chartData = data.series.cost_per_request_usd.map(([timestamp, value]) => ({
    time: formatTime(timestamp),
    value,
  }))

  return (
    <section className="panel" aria-label="Cost per request">
      <h2>Cost</h2>
      {chartData.length === 0 ? (
        <p className="panel-empty">Send a message to see cost per request.</p>
      ) : (
        <div className="panel-chart">
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={chartData} margin={{ left: 0, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.12)" />
              <XAxis dataKey="time" tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <YAxis width={76} tickFormatter={(v) => `$${v}`} tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <Tooltip formatter={(value) => formatCost(value)} contentStyle={{ background: '#160f24', border: '1px solid rgba(255,255,255,0.15)', color: '#f5f0ff' }} />
              <Line type="monotone" dataKey="value" stroke="#ff2e88" strokeWidth={2} dot={{ fill: '#ff2e88', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="panel-details">
        <div>
          <dt>Last request</dt>
          <dd>{formatCost(per_request_usd)}</dd>
        </div>
        <div>
          <dt>Total this session</dt>
          <dd>{formatCost(total_usd)}</dd>
        </div>
      </dl>
    </section>
  )
}

export default CostPanel
