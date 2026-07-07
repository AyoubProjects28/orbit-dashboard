import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

function formatMb(mb) {
  return `${(mb / 1000).toFixed(1)} GB`
}

function HardwarePanel({ data }) {
  const { gpu, cpu_pct, ram_used_mb, ram_total_mb } = data.hardware
  const primaryGpu = gpu[0]
  const ramPct = Math.round((ram_used_mb / ram_total_mb) * 100)

  const chartData = [
    { name: `GPU ${primaryGpu.id}`, value: primaryGpu.util_pct },
    { name: 'CPU', value: cpu_pct },
    { name: 'RAM', value: ramPct },
  ]

  return (
    <section className="panel" aria-label="Hardware usage">
      <h2>Hardware</h2>
      <div className="panel-chart">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.12)" />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: '#a99bc9', fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={60} tick={{ fill: '#a99bc9', fontSize: 12 }} />
            <Tooltip formatter={(value) => `${value}%`} contentStyle={{ background: '#160f24', border: '1px solid rgba(255,255,255,0.15)', color: '#f5f0ff' }} />
            <Bar dataKey="value" fill="#23e6d1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <dl className="panel-details">
        <div>
          <dt>GPU memory</dt>
          <dd>{formatMb(primaryGpu.mem_used_mb)} / {formatMb(primaryGpu.mem_total_mb)}</dd>
        </div>
        <div>
          <dt>GPU temperature</dt>
          <dd>{primaryGpu.temp_c} °C</dd>
        </div>
        <div>
          <dt>System RAM</dt>
          <dd>{formatMb(ram_used_mb)} / {formatMb(ram_total_mb)}</dd>
        </div>
      </dl>
    </section>
  )
}

export default HardwarePanel
