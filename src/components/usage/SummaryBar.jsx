// Top-of-page summary for a non-technical audience: just the two numbers
// that matter most — how much this has cost in total, and on average
// per request. Detailed panels (hardware, latency, tokens...) come later.

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

function SummaryBar({ data }) {
  const { total_usd, per_request_usd } = data.cost

  return (
    <section className="summary-bar" aria-label="Cost summary">
      <div className="summary-stat">
        <span className="summary-label">Total cost</span>
        <span className="summary-value">{currency.format(total_usd)}</span>
      </div>
      <div className="summary-stat">
        <span className="summary-label">Average cost / request</span>
        <span className="summary-value">{currency.format(per_request_usd)}</span>
      </div>
    </section>
  )
}

export default SummaryBar
