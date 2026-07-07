import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function TokensPanel({ data }) {
  const { prompt, completion, total } = data.tokens
  const chartData = [{ name: 'Last message', prompt, completion }]

  return (
    <section className="panel" aria-label="Token usage">
      <h2>Tokens</h2>
      {prompt + completion === 0 ? (
        <p className="panel-empty">Send a message to see token usage.</p>
      ) : (
        <div className="panel-chart">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.12)" />
              <XAxis type="number" tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#a99bc9', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#160f24', border: '1px solid rgba(255,255,255,0.15)', color: '#f5f0ff' }} />
              <Bar dataKey="prompt" stackId="tokens" fill="#ff2e88" name="Prompt" />
              <Bar dataKey="completion" stackId="tokens" fill="#23e6d1" radius={[0, 4, 4, 0]} name="Completion" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="panel-details">
        <div>
          <dt>Last message — prompt</dt>
          <dd>{prompt} tokens</dd>
        </div>
        <div>
          <dt>Last message — completion</dt>
          <dd>{completion} tokens</dd>
        </div>
        <div>
          <dt>Total this session</dt>
          <dd>{total} tokens</dd>
        </div>
      </dl>
    </section>
  )
}

export default TokensPanel
