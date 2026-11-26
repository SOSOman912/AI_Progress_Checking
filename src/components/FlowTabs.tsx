import { Icon, type IconName } from './Icon';
import type { NecOption } from '../lib/projects';

export type DocFlow = 'bq' | 'ce' | 'activity' | 'rate' | 'subletting';

const FLOWS: Array<{ id: DocFlow; label: string; icon: IconName }> = [
  { id: 'bq', label: 'Bill of Quantity (BQ)', icon: 'file-spreadsheet' },
  { id: 'ce', label: 'Compensation Event (CE)', icon: 'circle-alert' },
  { id: 'activity', label: 'Activity Schedule', icon: 'list-tree' },
  { id: 'rate', label: 'Schedule of Rate', icon: 'credit-card' }
];

export function FlowTabs({
  activeFlow,
  onSelect,
  necOption
}: {
  activeFlow: DocFlow;
  onSelect: (flow: DocFlow) => void;
  necOption?: NecOption;
}) {
  const activityMain = necOption === 'A' || necOption === 'C';
  const ordered = activityMain
    ? [
        FLOWS.find(flow => flow.id === 'activity')!,
        FLOWS.find(flow => flow.id === 'bq')!,
        FLOWS.find(flow => flow.id === 'ce')!
      ]
    : [
        FLOWS.find(flow => flow.id === 'bq')!,
        FLOWS.find(flow => flow.id === 'ce')!
      ];

  return (
    <div className="apc-docpage__tabsbar">
      <div className="apc-clientnav">
        <div className="apc-clientnav__brand">
          <span className="apc-clientnav__logo">
            <Icon name="building-2" size={14} />
          </span>
          <b>Client</b>
        </div>
        <nav className="apc-docpage__tabs" aria-label="Pricing document flows">
          {ordered.map(flow => (
            <button
              key={flow.id}
              className={`apc-docpage__tab${activeFlow === flow.id ? ' on' : ''}`}
              onClick={() => onSelect(flow.id)}
            >
              <Icon name={flow.icon} size={13} />
              {flow.label}
            </button>
          ))}
        </nav>
      </div>
      {activityMain && (
        <div className="apc-clientnav apc-subcontractornav">
          <div className="apc-clientnav__brand">
            <span className="apc-clientnav__logo">
              <Icon name="user" size={14} />
            </span>
            <b>Sub-Contractor</b>
          </div>
          <nav className="apc-docpage__tabs" aria-label="Sub-contractor flows">
            <button
              className={`apc-docpage__tab${activeFlow === 'subletting' ? ' on' : ''}`}
              onClick={() => onSelect('subletting')}
            >
              <Icon name="list-tree" size={13} />
              Subletting
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
