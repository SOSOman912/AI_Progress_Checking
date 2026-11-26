import { useState } from 'react';
import { Icon } from './Icon';
import type { Subcontractor } from '../lib/subcontractors';
import {
  SCHEDULE_GROUPS,
  REQUIRED_LABEL,
  createScheduleRow,
  formatAmount,
  isRowComplete,
  missingRequired,
  parseAmount,
  savingLoss,
  scheduleTotals,
  type ScheduleColumn,
  type ScheduleColumnKey,
  type SublettingScheduleRow
} from '../lib/sublettingSchedule';

const FLAT_COLUMNS = SCHEDULE_GROUPS.flatMap(group => group.columns);
const MULTI_COLUMN_GROUPS = SCHEDULE_GROUPS.filter(
  group => group.columns.length > 1
);

const rowId = (index: number) => `sched-row-${index}`;

const cellValue = (row: SublettingScheduleRow, key: ScheduleColumnKey): string => {
  if (key === 'savingLoss') return '';
  return String(row[key as Exclude<ScheduleColumnKey, 'savingLoss'>] ?? '');
};

export function SublettingSchedule({
  rows,
  subcontractors,
  onChange
}: {
  rows: SublettingScheduleRow[];
  subcontractors: Subcontractor[];
  onChange: (rows: SublettingScheduleRow[]) => void;
}) {
  const [savedNote, setSavedNote] = useState('');
  const totals = scheduleTotals(rows);

  const updateCell = (id: string, key: ScheduleColumnKey, value: string) => {
    if (key === 'savingLoss') return;
    onChange(
      rows.map(row =>
        row.id === id
          ? {
              ...row,
              [key]: value,
              updatedAt: Date.now()
            }
          : row
      )
    );
    setSavedNote('');
  };

  const blurCell = (id: string, column: ScheduleColumn, value: string) => {
    if (column.kind !== 'money') return;
    const amount = parseAmount(value);
    if (amount === null) return;
    const formatted = formatAmount(amount);
    if (formatted === value) return;
    updateCell(id, column.key, formatted);
  };

  const addRow = () => {
    onChange([...rows, createScheduleRow(rows)]);
    setSavedNote('');
  };

  const removeRow = (id: string) => {
    onChange(rows.filter(row => row.id !== id));
    setSavedNote('');
  };

  const clearRow = (id: string) => {
    onChange(
      rows.map(row =>
        row.id === id
          ? {
              ...createScheduleRow([]),
              id: row.id,
              item: row.item,
              createdAt: row.createdAt,
              updatedAt: Date.now()
            }
          : row
      )
    );
    setSavedNote('');
  };

  const completeAll = () => {
    const pending = rows.filter(row => !isRowComplete(row)).length;
    setSavedNote(
      pending
        ? `${pending} package${pending === 1 ? '' : 's'} still need ${REQUIRED_LABEL}.`
        : 'All packages have the required data.'
    );
  };

  return (
    <section className="apc-sched">
      <div className="apc-bqstats apc-sched__stats">
        <div>
          <span>Sub-contract packages</span>
          <b>{totals.packages}</b>
          <small className={totals.pending ? 'warn' : 'ok'}>
            {totals.pending
              ? `${totals.pending} need required data`
              : 'All required data captured'}
          </small>
        </div>
        <div>
          <span>Tender budget</span>
          <b>{formatAmount(totals.tenderBudget)}</b>
          <small>HK$ across all packages</small>
        </div>
        <div>
          <span>Awarded tender sum</span>
          <b>{formatAmount(totals.awardedTenderSum)}</b>
          <small>HK$ awarded to date</small>
        </div>
        <div>
          <span>Saving / (Loss)</span>
          <b className={totals.savingLoss < 0 ? 'is-negative' : undefined}>
            {totals.savingLossKnown ? formatAmount(totals.savingLoss) : '—'}
          </b>
          <small>Budget less awarded sum</small>
        </div>
      </div>

      <div className="apc-recordstoolbar">
        <div className="apc-recordstoolbar__title">
          <b>Subletting schedule</b>
          <span>BK-CP03.02-FR01</span>
        </div>
        <div className="apc-sched__tools">
          {savedNote && <span className="apc-sched__note">{savedNote}</span>}
          <button className="apc-docpage__tool" onClick={completeAll}>
            <Icon name="check" size={12} />
            Check completeness
          </button>
          <button className="apc-docpage__tool" onClick={addRow}>
            <Icon name="plus" size={12} />
            Add package
          </button>
        </div>
      </div>

      <p className="apc-sched__hint">
        Only <b>{REQUIRED_LABEL}</b> are required. Awarded subcontractor, dates,
        LOA and work order details can be added later — switch away and come
        back at any time.
      </p>

      <div className="apc-sched__wrap">
        <table className="apc-schedtable">
          <thead>
            <tr>
              {SCHEDULE_GROUPS.map(group => {
                if (group.columns.length === 1) {
                  const column = group.columns[0];
                  return (
                    <th
                      key={group.label}
                      rowSpan={2}
                      style={{ width: column.width, minWidth: column.width }}
                      className={column.required ? 'is-required' : undefined}
                    >
                      {column.label}
                      {column.required && <i aria-hidden>*</i>}
                    </th>
                  );
                }
                return (
                  <th key={group.label} colSpan={group.columns.length}>
                    {group.label}
                  </th>
                );
              })}
              <th rowSpan={2} className="apc-schedtable__actionhead" aria-label="Row actions" />
            </tr>
            <tr>
              {MULTI_COLUMN_GROUPS.flatMap(group =>
                group.columns.map(column => (
                  <th
                    key={column.key}
                    style={{ width: column.width, minWidth: column.width }}
                  >
                    {column.label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="apc-records__empty" colSpan={FLAT_COLUMNS.length + 1}>
                  No sub-contract packages yet. Add the first package — only the
                  package name and tender budget are needed to start.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const missing = new Set(missingRequired(row));
                const saving = savingLoss(row);
                return (
                  <tr key={row.id} id={rowId(index)}>
                    {FLAT_COLUMNS.map(column => {
                      if (column.kind === 'computed') {
                        return (
                          <td key={column.key} className="apc-schedtable__computed">
                            {saving === null ? (
                              <span className="apc-schedtable__empty">—</span>
                            ) : (
                              <span className={saving < 0 ? 'is-negative' : undefined}>
                                {formatAmount(saving)}
                              </span>
                            )}
                          </td>
                        );
                      }
                      const value = cellValue(row, column.key);
                      const isMissing = missing.has(column.key);
                      return (
                        <td
                          key={column.key}
                          className={isMissing ? 'is-missing-cell' : undefined}
                        >
                          {column.kind === 'date' ? (
                            <input
                              type="date"
                              className="apc-schedtable__input apc-schedtable__input--date"
                              value={value}
                              onChange={event =>
                                updateCell(row.id, column.key, event.target.value)
                              }
                              aria-label={`${column.label} for item ${row.item}`}
                            />
                          ) : column.key === 'awardedSubcontractor' ? (
                            <input
                              className="apc-schedtable__input"
                              value={value}
                              list="apc-sched-subcontractor-options"
                              placeholder="Not awarded yet"
                              onChange={event =>
                                updateCell(row.id, column.key, event.target.value)
                              }
                              onBlur={event =>
                                blurCell(row.id, column, event.target.value)
                              }
                              aria-label={`${column.label} for item ${row.item}`}
                            />
                          ) : (
                            <input
                              className={`apc-schedtable__input${
                                column.kind === 'money'
                                  ? ' apc-schedtable__input--money'
                                  : ''
                              }`}
                              value={value}
                              inputMode={column.kind === 'money' ? 'decimal' : undefined}
                              placeholder={
                                column.required
                                  ? column.kind === 'money'
                                    ? '0.00'
                                    : 'Required'
                                  : 'Optional'
                              }
                              onChange={event =>
                                updateCell(row.id, column.key, event.target.value)
                              }
                              onBlur={event =>
                                blurCell(row.id, column, event.target.value)
                              }
                              aria-label={`${column.label} for item ${row.item}`}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="apc-schedtable__actions">
                      <button
                        className="apc-sublist__delete"
                        onClick={() => clearRow(row.id)}
                        title="Clear this row"
                        aria-label={`Clear row ${row.item}`}
                      >
                        <Icon name="eraser" size={12} />
                      </button>
                      <button
                        className="apc-sublist__delete"
                        onClick={() => removeRow(row.id)}
                        title="Delete this package"
                        aria-label={`Delete row ${row.item}`}
                      >
                        <Icon name="trash-2" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <datalist id="apc-sched-subcontractor-options">
          {subcontractors.map(subcontractor => (
            <option key={subcontractor.id} value={subcontractor.name} />
          ))}
        </datalist>
      </div>

      <div className="apc-sched__foot">
        <span>
          {totals.complete} of {totals.packages} package
          {totals.packages === 1 ? '' : 's'} have the required data
        </span>
        <span className="apc-sched__legend">
          <i className="is-required" aria-hidden />
          Required field
        </span>
      </div>
    </section>
  );
}
