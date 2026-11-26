import { Icon, type IconName } from './Icon';
import { optionInfo, type NecOption, type PricingFlow } from '../lib/projects';

export type DocFlow = PricingFlow | 'subletting';

const FLOWS: Record<PricingFlow, { label: string; icon: IconName }> = {
  bq: { label: 'Bill of Quantity (BQ)', icon: 'file-spreadsheet' },
  ce: { label: 'Compensation Event (CE)', icon: 'circle-alert' },
  activity: { label: 'Activity Schedule', icon: 'list-tree' },
  rate: { label: 'Schedule of Rate', icon: 'credit-card' }
};

export function FlowTabs({
  activeFlow,
  onSelect,
  necOption
}: {
  activeFlow: DocFlow;
  onSelect: (flow: DocFlow) => void;
  necOption?: NecOption;
}) {
  /* Tab order and availability come from the single NEC option table. */
  const option = optionInfo(necOption);

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
          {option.flows.map(id => {
            const flow = FLOWS[id];
            return (
              <button
                key={id}
                className={`apc-docpage__tab${activeFlow === id ? ' on' : ''}`}
                onClick={() => onSelect(id)}
              >
                <Icon name={flow.icon} size={13} />
                {flow.label}
              </button>
            );
          })}
        </nav>
      </div>
      {option.subletting && (
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
