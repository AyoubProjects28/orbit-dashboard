// Coquille à onglets. Elle ne connaît que des libellés et des nœuds déjà
// construits : un onglet ignore totalement qu'il vit dans un onglet, ce qui
// permet de le tester et de le déplacer sans toucher à ce fichier.
function Tabs({ tabs, active, onChange }) {
  const current = tabs.find((tab) => tab.id === active)

  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={`tab${tab.id === active ? ' tab-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {current?.content ?? null}
      </div>
    </div>
  )
}

export default Tabs
