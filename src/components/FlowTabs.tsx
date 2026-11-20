import { Icon, type IconName } from './Icon';

export type DocFlow = 'bq' | 'ce' | 'activity' | 'rate';

const FLOWS: Array<{ id: DocFlow; label: string; icon: IconName }> = [
  { id: 'bq', label: 'Bill of Quantity (BQ)', icon: 'file-spreadsheet' },
  { id: 'ce', label: 'Compensation Event (CE)', icon: 'circle-alert' },
  { id: 'activity', label: 'Activity Schedule', icon: 'list-tree' },
  { id: 'rate', label: 'Schedule of Rate', icon: 'credit-card' }
];

export function FlowTabs({
  activeFlow,
  onSelect
}: {
  activeFlow: DocFlow;
  onSelect: (flow: DocFlow) => void;
}) {
  return (
    <div className="apc-docpage__tabsbar">
      <nav className="apc-docpage__tabs" aria-label="Pricing document flows">
        {FLOWS.map(flow => (
          <button
            key={flow.id}
            className={`apc-docpage__tab${activeFlow === flow.id ? ' on' : ''}`}
            onClick={() => onSelect(flow.id)}
            disabled={flow.id !== 'bq' && flow.id !== 'ce'}
            title={flow.id === 'bq' || flow.id === 'ce' ? undefined : 'Next flow'}
          >
            <Icon name={flow.icon} size={13} />
            {flow.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
