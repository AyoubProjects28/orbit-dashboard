import VmChart from './VmChart'

export const VM_META = {
  llm: { name: 'LLM-TEST01', role: 'Ollama', ip: '172.18.53.7', accent: 'var(--accent-2)' },
  mcp: { name: 'MCP-TEST01', role: 'FastMCP', ip: '172.18.53.9', accent: 'var(--accent)' },
}

function formatBps(bps) {
  if (bps >= 1048576) return `${(bps / 1048576).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${Math.round(bps)} B/s`
}

function Reading({ id, label, children }) {
  return (
    <div className="vm-reading">
      <div className="vm-reading-label">{label}</div>
      <div className="vm-reading-value" data-testid={`reading-${id}`}>{children}</div>
    </div>
  )
}

function VmCard({ vm, sample, online, buffersRef, samplingRef }) {
  const meta = VM_META[vm]

  return (
    <article className="vm-card">
      <header className="vm-card-head">
        <span className="vm-card-name" style={{ color: meta.accent }}>
          <span className={`dot ${online ? 'dot-on' : 'dot-off'}`} data-testid="vm-dot" />
          {meta.name} · {meta.role}
        </span>
        <span className="vm-card-ip">{meta.ip}</span>
      </header>

      <VmChart vm={vm} buffersRef={buffersRef} samplingRef={samplingRef} />

      <div className="vm-legend">
        <span><i className="swatch" style={{ background: 'var(--accent-2)' }} />CPU %</span>
        <span><i className="swatch" style={{ background: 'var(--accent)' }} />RAM %</span>
        <span style={{ color: 'var(--accent-3)' }}>▮ request / response window</span>
      </div>

      <div className="vm-readings">
        <Reading id="cpu" label="CPU">{sample ? `${sample.cpu.toFixed(0)} %` : '–'}</Reading>
        <Reading id="mem" label="RAM">{sample ? `${sample.mem.toFixed(0)} %` : '–'}</Reading>
        <Reading id="net" label="Network ↓/↑">
          {sample ? `↓${formatBps(sample.rx)} ↑${formatBps(sample.tx)}` : '–'}
        </Reading>
        <Reading id="load" label="Load 1m">{sample ? sample.load.toFixed(2) : '–'}</Reading>
      </div>

      <div className="vm-cores">
        {(sample?.cores ?? []).map((usage, index) => (
          // eslint-disable-next-line react/no-array-index-key -- les cœurs n'ont pas d'identité stable hors de leur rang
          <span className="vm-core" key={index} data-testid="core-bar">
            <i style={{ height: `${Math.max(3, usage)}%` }} />
          </span>
        ))}
      </div>
    </article>
  )
}

export default VmCard
