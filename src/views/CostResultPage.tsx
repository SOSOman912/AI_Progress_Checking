import { Fragment, useMemo, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { MAPPING_DOC_ICON, type MappingScenario } from '../lib/mappingScenarios';
import {
  buildCostResult,
  costDocLabel,
  type CostCeDetail,
  type CostCeInput,
  type CostResultMode
} from '../lib/costResult';
import { loadCeLinks } from '../data/ce';
import { usePricingMode } from '../lib/pricingMode';
import { formatBqQty } from '../lib/numberFormat';

const MODE_LABEL: Record<CostResultMode, string> = {
  bq: 'Bill of Quantities',
  activity: 'Activity Schedule',
  records: 'Cost records'
};

const MODE_ICON: Record<CostResultMode, IconName> = {
  bq: 'file-spreadsheet',
  activity: 'clipboard-check',
  records: 'invoice-dn'
};

const money = (value: number) =>
  `HK$ ${Math.round(value).toLocaleString('en-HK', { maximumFractionDigits: 0 })}`;

function CeDetails({ details }: { details: CostCeDetail[] }) {
  return (
    <div className="apc-ce-detail__list">
      {details.map(detail => (
        <div key={detail.id} className="apc-ce-detail__row">
          <b>{detail.ref}</b>
          <span>{detail.title}</span>
          <em>{money(detail.amount)}</em>
          <small>of {money(detail.total)}</small>
        </div>
      ))}
    </div>
  );
}

export function CostReviewBody({
  scenario,
  mode,
  projectId,
  necOption
}: {
  scenario: MappingScenario;
  mode: CostResultMode;
  projectId?: string;
  necOption?: string;
}) {
  const [pricingMode] = usePricingMode(projectId);
  const moneyVisible = pricingMode === 'priced';
  /* CE money always comes from the CE repository (apc.ce-links), never a constant. */
  const ceLinks = useMemo<CostCeInput[]>(
    () =>
      loadCeLinks(projectId, necOption).map(link => ({
        id: link.ceId,
        ref: link.ceCode,
        title: link.title,
        amount: link.amount,
        itemIds: link.itemIds
      })),
    [projectId, necOption]
  );
  const [selectedCe, setSelectedCe] = useState<string[]>(() =>
    scenario.sources?.ce ? ceLinks.map(record => record.id) : []
  );
  const [expandedBq, setExpandedBq] = useState<Set<string>>(new Set());
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set());
  const result = useMemo(
    () => buildCostResult(scenario, ceLinks, selectedCe),
    [scenario, ceLinks, selectedCe]
  );

  const certifiedPct = result.total ? Math.round((result.certified / result.total) * 100) : 0;
  const modeLabel = MODE_LABEL[mode];
  const valueSource = result.modes.includes('activity')
    ? 'From activity schedule'
    : result.modes.includes('bq')
      ? 'From bill of quantities'
      : 'From invoice records';
  const mainDocLabel = `${result.mainDocs.length} main ${
    result.mainDocs.length === 1 ? 'document' : 'documents'
  }`;
  const ceSelectedTotal = ceLinks
    .filter(record => selectedCe.includes(record.id))
    .reduce((sum, record) => sum + record.amount, 0);

  const bqTotal = result.bq.reduce((sum, line) => sum + line.amount, 0);
  const activityTotal = result.activity.reduce((sum, line) => sum + line.value, 0);
  const recordTotal = result.records.reduce((sum, line) => sum + line.amount, 0);

  const toggleCe = (id: string) => {
    setSelectedCe(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleBq = (id: string) => {
    setExpandedBq(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleActivity = (id: string) => {
    setExpandedActivity(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="apc-costresult__workspace">
      <div className="apc-costresult__main">
        <div className="apc-costresult__stats">
          <div className="apc-coststat">
            <span>NEC option</span>
            <b>{result.optionName}</b>
            <em>{result.contract}</em>
          </div>
          <div className="apc-coststat">
            <span>Main schedule</span>
            <b>{result.modes.map(item => MODE_LABEL[item]).join(' + ')}</b>
            <em>{mainDocLabel}</em>
          </div>
          <div className="apc-coststat">
            <span>Contract value</span>
            <b>{moneyVisible ? money(result.total) : '—'}</b>
            <em>{moneyVisible ? valueSource : 'Quantity only — no pricing imported'}</em>
          </div>
          <div className="apc-coststat">
            <span>Certified / paid</span>
            <b>{moneyVisible ? money(result.certified) : '—'}</b>
            <em>
              {moneyVisible
                ? `${certifiedPct}% of value${result.ceTotal ? ` · CE ${money(result.ceTotal)}` : ' · No CE'}`
                : 'Quantity only — no pricing imported'}
            </em>
          </div>
        </div>

        <section className="apc-bqpanel apc-costresult__panel">
          <div className="apc-bqpanel__head apc-costresult__panelhead">
            <b>{modeLabel}</b>
            <span>
              {mode === 'bq'
                ? `${result.bq.length} BQ lines`
                : mode === 'activity'
                  ? `${result.activity.length} activities`
                  : `${result.records.length} invoices`}
            </span>
          </div>

          <div className="apc-bqpanel__scroll">
            <div className="apc-tablefill">
              {mode === 'bq' && (
                <table className="apc-bqtable apc-cost-table apc-cost-table--bq">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      {moneyVisible && <th>Rate</th>}
                      {moneyVisible && <th>Amount</th>}
                      {moneyVisible && <th>CE</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.bq.map(line => {
                      const expanded = expandedBq.has(line.id);
                      return (
                        <Fragment key={line.id}>
                          <tr className="apc-bqtable__item">
                            <td className="apc-cost-table__code">{line.code}</td>
                            <td>{line.description}</td>
                            <td>{line.unit}</td>
                            <td className="num">{formatBqQty(line.qty)}</td>
                            {moneyVisible && (
                              <td className="num">{money(line.rate)}</td>
                            )}
                            {moneyVisible && (
                              <td className="num">{money(line.amount)}</td>
                            )}
                            {moneyVisible && (
                            <td className="apc-cost-table__ce">
                              {line.ceTotal ? (
                                <button
                                  className={`apc-ce-toggle${expanded ? ' on' : ''}`}
                                  onClick={() => toggleBq(line.id)}
                                  aria-expanded={expanded}
                                >
                                  {money(line.ceTotal)}
                                  <Icon
                                    name={expanded ? 'chevron-down' : 'chevron-right'}
                                    size={11}
                                  />
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                            )}
                          </tr>
                          {expanded && moneyVisible && line.ceDetails.length > 0 && (
                            <tr className="apc-ce-detail">
                              <td colSpan={moneyVisible ? 7 : 4}>
                                <CeDetails details={line.ceDetails} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!result.bq.length && (
                      <tr>
                        <td colSpan={moneyVisible ? 7 : 4} className="apc-scan-elements__empty">
                          No BQ lines linked to this scenario.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {moneyVisible && (
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Total</td>
                      <td className="num">{money(bqTotal)}</td>
                      <td className="num">{money(result.ceTotal)}</td>
                    </tr>
                  </tfoot>
                  )}
                </table>
              )}

              {mode === 'activity' && (
                <table className="apc-bqtable apc-cost-table apc-cost-table--activity">
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Start</th>
                      <th>Finish</th>
                      <th>Complete</th>
                      {moneyVisible && <th>Value</th>}
                      {moneyVisible && <th>CE</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.activity.map(line => {
                      const expanded = expandedActivity.has(line.id);
                      return (
                        <Fragment key={line.id}>
                          <tr className="apc-bqtable__item">
                            <td>
                              <b className="apc-cost-table__code">{line.code}</b> {line.name}
                            </td>
                            <td>{line.start}</td>
                            <td>{line.finish}</td>
                            <td>
                              <div className="apc-costresult__pct">
                                <span>
                                  <i style={{ width: `${line.pct}%` }} />
                                </span>
                                <b>{line.pct}%</b>
                              </div>
                            </td>
                            {moneyVisible && (
                              <td className="num">{money(line.value)}</td>
                            )}
                            {moneyVisible && (
                            <td className="apc-cost-table__ce">
                              {line.ceTotal ? (
                                <button
                                  className={`apc-ce-toggle${expanded ? ' on' : ''}`}
                                  onClick={() => toggleActivity(line.id)}
                                  aria-expanded={expanded}
                                >
                                  {money(line.ceTotal)}
                                  <Icon
                                    name={expanded ? 'chevron-down' : 'chevron-right'}
                                    size={11}
                                  />
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                            )}
                          </tr>
                          {expanded && moneyVisible && line.ceDetails.length > 0 && (
                            <tr className="apc-ce-detail">
                              <td colSpan={moneyVisible ? 6 : 4}>
                                <CeDetails details={line.ceDetails} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!result.activity.length && (
                      <tr>
                        <td colSpan={moneyVisible ? 6 : 4} className="apc-scan-elements__empty">
                          No activity schedule linked to this scenario.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {moneyVisible && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total</td>
                      <td className="num">{money(activityTotal)}</td>
                      <td className="num">{money(result.ceTotal)}</td>
                    </tr>
                  </tfoot>
                  )}
                </table>
              )}

              {mode === 'records' && (
                <table className="apc-bqtable apc-cost-table apc-cost-table--records">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Period</th>
                      <th>Date</th>
                      {moneyVisible && <th>Amount</th>}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.records.map(line => (
                      <tr key={line.id} className="apc-bqtable__item">
                        <td className="apc-cost-table__code">{line.ref}</td>
                        <td>{line.period}</td>
                        <td>{line.date}</td>
                        {moneyVisible && (
                          <td className="num">{money(line.amount)}</td>
                        )}
                        <td>
                          <span
                            className={`apc-costresult__status is-${line.status.toLowerCase()}`}
                          >
                            {line.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!result.records.length && (
                      <tr>
                        <td colSpan={moneyVisible ? 5 : 4} className="apc-scan-elements__empty">
                          No invoices linked to this scenario.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {moneyVisible && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className="num">{money(recordTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </section>
      </div>

      <aside className="apc-costresult__support" aria-label="Supporting documents">
        <div className="apc-costresult__supporthead">
          <Icon name="file-text" size={13} />
          <b>Supporting documents</b>
        </div>

        {scenario.sources?.ce ? (
          <div className="apc-costresult__ce">
            <div className="apc-costresult__cehead">
              <b>
                {mode === 'bq' ? 'CE linked to this BQ' : 'CE linked to this activity schedule'}
              </b>
              <span>{money(ceSelectedTotal)}</span>
            </div>
            <div className="apc-costresult__celist">
              {ceLinks.length === 0 && (
                <p className="apc-costresult__ceempty">
                  No compensation event has been linked to a BQ / activity item yet.
                  Link one from the Compensation Event page.
                </p>
              )}
              {ceLinks.map(record => (
                <label key={record.id} className="apc-costresult__cerow">
                  <input
                    type="checkbox"
                    checked={selectedCe.includes(record.id)}
                    onChange={() => toggleCe(record.id)}
                  />
                  <span>
                    <b>{record.ref}</b> {record.title}
                  </span>
                  <em>{moneyVisible ? money(record.amount) : '—'}</em>
                </label>
              ))}
            </div>
            <p className="apc-costresult__cehint">
              Selected CE amounts are allocated to the BQ / activity items; expand a CE value in the
              table to see the linked CE details.
            </p>
          </div>
        ) : (
          <p className="apc-costresult__ceempty">
            No CE document is linked to this scenario, so CE amounts are not assigned.
          </p>
        )}

        <div className="apc-costresult__docs">
          {result.supports.map(doc => (
            <div key={`${doc.type}-${doc.name}`} className="apc-costresult__doc">
              <span className={`apc-costresult__docicon is-${doc.type}`}>
                <Icon name={MAPPING_DOC_ICON[doc.type] as IconName} size={14} />
              </span>
              <div>
                <b>{costDocLabel(doc.type)}</b>
                <span title={doc.name}>{doc.name}</span>
                <em>{doc.role}</em>
              </div>
            </div>
          ))}
          {!result.supports.length && (
            <div className="apc-costresult__emptydocs">No documents linked to this scenario.</div>
          )}
        </div>
        <p className="apc-costresult__hint">
          CE amounts are referenced directly in the table and can be expanded per item.
        </p>
      </aside>
    </div>
  );
}

export function CostResultPage({
  scenario,
  onBack,
  projectId,
  necOption
}: {
  scenario: MappingScenario;
  onBack: () => void;
  projectId?: string;
  necOption?: string;
}) {
  const result = useMemo(() => buildCostResult(scenario), [scenario]);
  const [tab, setTab] = useState<CostResultMode>(result.modes[0]);

  return (
    <main className="apc-scan-review apc-costresult">
      <header className="apc-scan-review__head">
        <button
          className="apc-scan-review__back"
          onClick={onBack}
          aria-label="Back to mapping scenarios"
        >
          <Icon name="arrow-left" size={16} />
        </button>
        <div className="apc-scan-review__title">
          <h1>Mapping Model</h1>
          <span>
            {scenario.name} · Cost result
          </span>
        </div>
        <span className="apc-costresult__option">
          {result.optionName} · {result.contract}
        </span>
      </header>

      {result.modes.length > 1 && (
        <div className="apc-map-doctabs apc-costresult__tabs" role="tablist" aria-label="Cost result view">
          {result.modes.map(mode => (
            <button
              key={mode}
              role="tab"
              aria-selected={tab === mode}
              className={`apc-map-doctab${tab === mode ? ' on' : ''}`}
              onClick={() => setTab(mode)}
            >
              <Icon name={MODE_ICON[mode]} size={13} />
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
      )}

      <CostReviewBody
        scenario={scenario}
        mode={tab}
        projectId={projectId}
        necOption={necOption}
      />
    </main>
  );
}
