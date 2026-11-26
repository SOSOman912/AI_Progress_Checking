import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent
} from 'react';
import * as XLSX from 'xlsx';
import { FlowTabs, type DocFlow } from '../components/FlowTabs';
import { Icon } from '../components/Icon';
import { SublettingSchedule } from '../components/SublettingSchedule';
import { ACTIVITY_ITEMS, BQ_SAMPLE_ITEMS } from './Preprocessing';
import { loadPricingOptions } from '../lib/ceLinks';
import { usePricingMode } from '../lib/pricingMode';
import { formatBqQty } from '../lib/numberFormat';
import {
  clearDraftAssignments,
  loadContracts,
  loadDraftAssignments,
  loadMappedScheduleNos,
  loadScheduleRows,
  loadSubcontractors,
  nextSubcontractorId,
  saveContracts,
  saveDraftAssignments,
  saveScheduleRows,
  saveSubcontractors,
  type Subcontractor,
  type SublettingContract,
  type SublettingScheduleRow
} from '../data/subletting';
import type { NecOption } from '../lib/projects';

const loadMappedBqSchedules = loadMappedScheduleNos;

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

const money = (value: number) =>
  value.toLocaleString('en-HK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const itemValue = (item: (typeof ACTIVITY_ITEMS)[number]) =>
  (item.rate ?? 0) * (item.qty ?? 0);

export function SublettingPage({
  projectId,
  necOption,
  onFlow
}: {
  projectId?: string;
  necOption?: NecOption;
  onFlow: (flow: DocFlow) => void;
}) {
  const activityOptions = useMemo(
    () => loadPricingOptions(projectId, 'activity'),
    [projectId]
  );
  const [pricingMode] = usePricingMode(projectId);
  const moneyVisible = pricingMode === 'priced';
  const [contracts, setContracts] = useState<SublettingContract[]>(() =>
    loadContracts(projectId)
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [popupActivityId, setPopupActivityId] = useState('');
  const [pendingActivityId, setPendingActivityId] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>(() =>
    loadSubcontractors(projectId)
  );
  const [listError, setListError] = useState('');
  const [draftActivityId, setDraftActivityId] = useState('');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set()
  );
  const [saveNote, setSaveNote] = useState('');
  const [expandedActivityId, setExpandedActivityId] = useState('');
  const [bqSchedules, setBqSchedules] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [view, setView] = useState<'schedule' | 'contracts'>('schedule');
  const [scheduleRows, setScheduleRows] = useState<SublettingScheduleRow[]>(() =>
    loadScheduleRows(projectId)
  );

  useEffect(() => {
    setContracts(loadContracts(projectId));
    setSubcontractors(loadSubcontractors(projectId));
    setScheduleRows(loadScheduleRows(projectId));
  }, [projectId]);

  useEffect(() => {
    saveScheduleRows(scheduleRows, projectId);
  }, [scheduleRows, projectId]);

  useEffect(() => {
    saveSubcontractors(subcontractors, projectId);
  }, [subcontractors, projectId]);

  useEffect(() => {
    saveContracts(contracts, projectId);
  }, [contracts, projectId]);

  const assignment = useMemo(() => {
    const map = new Map<string, SublettingContract>();
    contracts.forEach(contract => {
      contract.itemIds.forEach(itemId => map.set(itemId, contract));
    });
    return map;
  }, [contracts]);

  const assignedCount = Object.values(assignments).filter(Boolean).length;

  const builderActivity =
    activityOptions.find(option => option.id === draftActivityId) ?? null;

  const builderActivityItems = useMemo(() => {
    if (!builderActivity) return [];
    if (builderActivity.itemIds?.length) {
      return ACTIVITY_ITEMS.filter(item =>
        builderActivity.itemIds?.includes(item.id)
      );
    }
    return ACTIVITY_ITEMS;
  }, [builderActivity]);

  const builderActivityGroups = useMemo(() => {
    const groups = new Map<
      string,
      { no: string; title: string; items: typeof ACTIVITY_ITEMS }
    >();
    builderActivityItems.forEach(item => {
      const key = item.scheduleNo ?? '';
      const group = groups.get(key);
      if (group) {
        group.items.push(item);
      } else {
        groups.set(key, {
          no: item.scheduleNo ?? '',
          title: item.scheduleTitle ?? '',
          items: [item]
        });
      }
    });
    return [...groups.values()];
  }, [builderActivityItems]);

  const bqItemsForSchedule = (scheduleNo: string) =>
    scheduleNo === '3' && bqSchedules.includes(scheduleNo)
      ? BQ_SAMPLE_ITEMS
      : [];

  const openCreate = () => {
    setPopupActivityId('');
    setError('');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setError('');
  };

  const startSubcontractorStep = () => {
    if (!popupActivityId) return;
    setPendingActivityId(popupActivityId);
    setCreateOpen(false);
    setListOpen(true);
    setListError('');
  };

  const backToActivityStep = () => {
    setListOpen(false);
    setCreateOpen(true);
    setListError('');
  };

  const subcontractorIds = new Set(
    subcontractors.map(item => item.id.trim()).filter(Boolean)
  );
  const listValid =
    subcontractors.length > 0 &&
    subcontractorIds.size === subcontractors.length &&
    subcontractors.every(item => item.name.trim());

  const finishSubcontractorStep = () => {
    if (!listValid) {
      setListError('Every subcontractor needs a unique ID and a name.');
      return;
    }
    const existingAssignments: Record<string, string> = {};
    contracts
      .filter(contract => contract.activityId === pendingActivityId)
      .forEach(contract => {
        const subId =
          contract.subcontractorId ??
          subcontractors.find(
            sub =>
              sub.name.trim().toLowerCase() ===
              contract.subcontractor.trim().toLowerCase()
          )?.id;
        if (!subId) return;
        contract.itemIds.forEach(itemId => {
          existingAssignments[itemId] = subId;
        });
      });
    const draftAssignments = loadDraftAssignments(projectId, pendingActivityId);
    const validIds = new Set(subcontractors.map(sub => sub.id));
    const merged = Object.fromEntries(
      Object.entries({ ...existingAssignments, ...draftAssignments }).filter(
        ([, subId]) => validIds.has(subId)
      )
    );
    setDraftActivityId(pendingActivityId);
    setAssignments(merged);
    setSelectedItemIds(new Set());
    setSaveNote('');
    setExpandedActivityId('');
    setBqSchedules(loadMappedBqSchedules(projectId));
    setError('');
    setListOpen(false);
    setListError('');
  };

  const addSubcontractorRow = () => {
    setSubcontractors(prev => [
      ...prev,
      { id: nextSubcontractorId(prev), name: '' }
    ]);
    setListError('');
  };

  const updateSubcontractorRow = (
    index: number,
    patch: Partial<Subcontractor>
  ) => {
    setSubcontractors(prev =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
    setListError('');
  };

  const removeSubcontractorRow = (index: number) => {
    setSubcontractors(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    setListError('');
  };

  const importSubcontractorList = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('No worksheet found');
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: false
      });
      if (!rows.length) throw new Error('The file is empty');
      const first = rows[0].map(value => String(value ?? '').trim().toLowerCase());
      const hasHeader =
        first[0]?.includes('id') ||
        first[1]?.includes('name') ||
        first[1]?.includes('subcontractor');
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const seen = new Set<string>();
      const next: Subcontractor[] = [];
      dataRows.forEach((row, index) => {
        const rawId = String(row[0] ?? '').trim();
        const name = String(row[1] ?? '').trim();
        if (!name) return;
        const id = rawId || `SC-${String(index + 1).padStart(3, '0')}`;
        if (seen.has(id)) return;
        seen.add(id);
        next.push({ id, name });
      });
      if (!next.length) throw new Error('No subcontractor rows found');
      setSubcontractors(next);
      setListError('');
    } catch (errorValue) {
      setListError(
        errorValue instanceof Error
          ? errorValue.message
          : 'Could not read the subcontractor list.'
      );
    }
  };

  const cancelBuilder = () => {
    setDraftActivityId('');
    setAssignments({});
    setSelectedItemIds(new Set());
    setSaveNote('');
    setExpandedActivityId('');
    setError('');
  };

  const assignActivity = (activityId: string, subcontractorId: string) => {
    const targets =
      selectedItemIds.has(activityId) && selectedItemIds.size > 1
        ? [...selectedItemIds]
        : [activityId];
    setAssignments(prev => {
      const next = { ...prev };
      targets.forEach(itemId => {
        next[itemId] = subcontractorId;
      });
      return next;
    });
    setSelectedItemIds(new Set());
    setSaveNote('');
    setError('');
  };

  const applyLatestAssignments = (): number => {
    if (!builderActivity) return 0;
    const activityIds = new Set(builderActivityItems.map(item => item.id));
    const groups = new Map<string, { sub: Subcontractor; itemIds: string[] }>();
    Object.entries(assignments).forEach(([itemId, subcontractorId]) => {
      if (!activityIds.has(itemId)) return;
      const sub = subcontractors.find(item => item.id === subcontractorId);
      if (!sub) return;
      const entry = groups.get(subcontractorId);
      if (entry) entry.itemIds.push(itemId);
      else groups.set(subcontractorId, { sub, itemIds: [itemId] });
    });

    const existingForActivity = contracts.filter(
      contract => contract.activityId === builderActivity.id
    );
    let nextNumber =
      Math.max(
        0,
        ...contracts.map(contract => {
          const match = contract.code.match(/SUB-2026-(\d+)/);
          return match ? Number(match[1]) : 0;
        })
      ) + 1;
    const usedExisting = new Set<string>();
    const nextContracts: SublettingContract[] = [];
    groups.forEach((group, subcontractorId) => {
      const existing =
        existingForActivity.find(contract => {
          if (usedExisting.has(contract.id)) return false;
          if (contract.subcontractorId) {
            return contract.subcontractorId === subcontractorId;
          }
          return (
            contract.subcontractor.trim().toLowerCase() ===
            group.sub.name.trim().toLowerCase()
          );
        }) ??
        existingForActivity.find(
          contract =>
            !usedExisting.has(contract.id) &&
            contract.itemIds.some(itemId => group.itemIds.includes(itemId))
        );
      if (existing) {
        usedExisting.add(existing.id);
        nextContracts.push({
          ...existing,
          subcontractorId,
          subcontractor: group.sub.name.trim(),
          itemIds: group.itemIds
        });
      } else {
        nextContracts.push({
          id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: `SUB-2026-${String(nextNumber).padStart(3, '0')}`,
          subcontractor: group.sub.name.trim(),
          subcontractorId,
          activityId: builderActivity.id,
          activityCode: builderActivity.code,
          activityName: builderActivity.name,
          itemIds: group.itemIds,
          createdAt: Date.now()
        });
        nextNumber += 1;
      }
    });

    const removedIds = new Set(
      existingForActivity
        .filter(contract => !usedExisting.has(contract.id))
        .map(contract => contract.id)
    );
    setContracts(prev => [
      ...prev.filter(
        contract =>
          contract.activityId !== builderActivity.id &&
          !removedIds.has(contract.id)
      ),
      ...nextContracts
    ]);
    return groups.size;
  };

  const saveChanges = () => {
    if (!builderActivity) return;
    applyLatestAssignments();
    clearDraftAssignments(projectId, builderActivity.id);
    setSelectedItemIds(new Set());
    setSaveNote(
      `${assignedCount} item${assignedCount === 1 ? '' : 's'} saved`
    );
    setError('');
  };

  const toggleRowSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    setSaveNote('');
  };

  const subcontractorForActivity = (activityId: string): string => {
    if (activityId in assignments) {
      const selected = assignments[activityId];
      if (!selected) return '';
      const sub = subcontractors.find(item => item.id === selected);
      if (sub) return sub.name;
    }
    const existing = assignment.get(activityId);
    if (existing) return existing.subcontractor;
    return '';
  };

  const createContracts = () => {
    if (!builderActivity) {
      setError('Import an Activity Schedule before creating a subletting contract.');
      return;
    }
    if (!applyLatestAssignments()) {
      setError('Select a subcontractor for at least one Activity item.');
      return;
    }
    clearDraftAssignments(projectId, builderActivity.id);
    cancelBuilder();
  };

  const deleteContract = (id: string) => {
    setContracts(prev => prev.filter(contract => contract.id !== id));
  };

  return (
    <main className="apc-docpage">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>Document Management</h1>
          <span>
            {view === 'schedule'
              ? 'Subletting Schedule · BK-CP03.02-FR01'
              : 'Subletting contracts'}
          </span>
        </div>
        {view === 'contracts' && (
          <button className="apc-docpage__new" onClick={openCreate}>
            <span aria-hidden>+</span>
            Create Subletting Contract
          </button>
        )}
      </header>

      <FlowTabs activeFlow="subletting" onSelect={onFlow} necOption={necOption} />

      <div className="apc-docpage__tabsbar apc-docpage__tabsbar--sub">
        <div className="apc-seg apc-seg--sm">
          <button
            className={view === 'schedule' ? 'on' : ''}
            onClick={() => setView('schedule')}
          >
            Subletting schedule
          </button>
          <button
            className={view === 'contracts' ? 'on' : ''}
            onClick={() => setView('contracts')}
          >
            Contracts
          </button>
        </div>
        <span className="apc-docpage__subhint">
          Plan the sub-contract packages first — awarded details can be completed
          later.
        </span>
      </div>

      <div className="apc-docpage__body">
        <div className="apc-docpage__content apc-docpage__content--records">
          {view === 'schedule' ? (
            <SublettingSchedule
              rows={scheduleRows}
              subcontractors={subcontractors}
              onChange={setScheduleRows}
              showMoney={moneyVisible}
            />
          ) : draftActivityId && builderActivity ? (
            <section className="apc-subbuilder">
              <div className="apc-subbuilder__head">
                <div>
                  <span>Creating subletting contract from</span>
                  <b>
                    {builderActivity.code} · {builderActivity.name}
                  </b>
                </div>
                {selectedItemIds.size > 0 && (
                  <span className="apc-subbuilder__selection">
                    {selectedItemIds.size} selected
                    <button
                      type="button"
                      onClick={() => setSelectedItemIds(new Set())}
                    >
                      Clear
                    </button>
                  </span>
                )}
                {saveNote && (
                  <span className="apc-subbuilder__saved">{saveNote}</span>
                )}
                <button className="apc-ce-back" onClick={cancelBuilder}>
                  Cancel
                </button>
                <button
                  className="apc-subbuilder__save"
                  disabled={!Object.keys(assignments).length}
                  onClick={saveChanges}
                >
                  Save Changes
                </button>
                <button
                  className="apc-subbuilder__create"
                  disabled={!assignedCount}
                  onClick={createContracts}
                >
                  Create Contracts
                </button>
              </div>

              {error && <div className="apc-home__error">{error}</div>}

              <div className="apc-subbuilder__scroll">
                <table
                  className={`apc-subitems apc-subitems--assign${moneyVisible ? '' : ' is-nomoney'}`}
                  title="Shift+click rows to select multiple items, then change one subcontractor dropdown to apply to all selected"
                >
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th className="num">Qty</th>
                      {moneyVisible && <th className="num">Value</th>}
                      <th>Status</th>
                      <th>Subcontractor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builderActivityGroups.map(group => [
                      <tr key={`group-${group.no}`} className="apc-subitems__schedule">
                        <td colSpan={moneyVisible ? 7 : 6}>
                          Schedule No. {group.no} — {group.title}
                        </td>
                      </tr>,
                      ...group.items.map(item => {
                        const assigned = assignment.get(item.id);
                        const existingSubId = assigned
                          ? assigned.subcontractorId ??
                            subcontractors.find(
                              sub =>
                                sub.name.trim().toLowerCase() ===
                                assigned.subcontractor.trim().toLowerCase()
                            )?.id ??
                            ''
                          : '';
                        const currentSubId =
                          assignments[item.id] ?? existingSubId;
                        const changed =
                          !!assigned && currentSubId !== existingSubId;
                        const subName = subcontractorForActivity(item.id);
                        const expanded = expandedActivityId === item.id;
                        const bqItems = bqItemsForSchedule(item.scheduleNo ?? '');
                        return [
                          <tr
                            key={item.id}
                            className={`${currentSubId ? 'on' : ''}${assigned ? ' is-assigned' : ''}${expanded ? ' is-expanded' : ''}${
                              selectedItemIds.has(item.id) ? ' is-selected' : ''
                            }`}
                            onMouseDown={event => {
                              if (!event.shiftKey) return;
                              event.preventDefault();
                              toggleRowSelection(item.id);
                            }}
                            onClick={event => {
                              if (event.shiftKey) {
                                event.preventDefault();
                                return;
                              }
                              if (selectedItemIds.size) {
                                setSelectedItemIds(new Set());
                              }
                              setExpandedActivityId(expanded ? '' : item.id);
                            }}
                          >
                            <td className="mono">{item.no}</td>
                            <td>{item.label}</td>
                            <td>{item.unit || '—'}</td>
                            <td className="num">{formatBqQty(item.qty)}</td>
                            {moneyVisible && (
                              <td className="num">{money(itemValue(item))}</td>
                            )}
                            <td>
                              {assigned && !changed ? (
                                <span className="apc-subitems__assigned">
                                  {assigned.code}
                                </span>
                              ) : changed ? (
                                <span className="apc-subitems__edited">
                                  Edited
                                </span>
                              ) : currentSubId ? (
                                <span className="apc-subitems__available">
                                  Assigned
                                </span>
                              ) : (
                                <span className="apc-subitems__unassigned">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td>
                              <label
                                className={`apc-subassign${currentSubId ? ' has-value' : ''}`}
                                onClick={event => event.stopPropagation()}
                              >
                                <select
                                  value={currentSubId}
                                  onChange={event =>
                                    assignActivity(item.id, event.target.value)
                                  }
                                  aria-label={`Subcontractor for ${item.no}`}
                                >
                                  <option value="">Select subcontractor</option>
                                  {subcontractors.map(sub => (
                                    <option key={sub.id} value={sub.id}>
                                      {sub.name}
                                    </option>
                                  ))}
                                </select>
                                <Icon name="chevron-down" size={11} />
                              </label>
                            </td>
                          </tr>,
                          expanded && (
                            <tr key={`${item.id}-bq`} className="apc-subitems__bqexpand">
                              <td colSpan={moneyVisible ? 7 : 6}>
                                <div className="apc-subitems__bqpanel">
                                  <div className="apc-subitems__bqhead">
                                    <b>Mapped BQ items</b>
                                    <span>
                                      Schedule No. {item.scheduleNo}
                                      {item.scheduleNo === '3'
                                        ? ' · Bill No. 3 — Site Formation'
                                        : ''}
                                    </span>
                                    <span className="apc-subitems__bqsub">
                                      {subName || 'Unassigned'}
                                    </span>
                                  </div>
                                  {bqItems.length ? (
                                    <table className="apc-subitems__bqtable">
                                      <thead>
                                        <tr>
                                          <th>Description</th>
                                          <th className="num">Qty</th>
                                          <th>Unit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bqItems.map(bqItem => (
                                          <tr key={bqItem.no}>
                                            <td>{bqItem.label}</td>
                                            <td className="num">
                                              {formatBqQty(bqItem.qty)}
                                            </td>
                                            <td>{bqItem.unit}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div className="apc-subitems__bqempty">
                                      No BQ items are mapped to this Schedule No.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        ];
                      })
                    ])}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <div className="apc-recordtablewrap">
              <table className="apc-recordtable apc-subtable">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Subcontractor</th>
                    <th>Activity items</th>
                    <th>Items</th>
                    {moneyVisible && <th>Value</th>}
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {contracts.length === 0 ? (
                    <tr>
                      <td colSpan={moneyVisible ? 7 : 6} className="apc-records__empty">
                        No subletting contracts yet.
                      </td>
                    </tr>
                  ) : (
                    contracts.map(contract => {
                      const items = ACTIVITY_ITEMS.filter(item =>
                        contract.itemIds.includes(item.id)
                      );
                      const value = items.reduce(
                        (sum, item) => sum + itemValue(item),
                        0
                      );
                      return (
                        <tr key={contract.id}>
                          <td className="mono">{contract.code}</td>
                          <td>
                            <div className="apc-subtable__sub">
                              <b>{contract.subcontractor}</b>
                              <span>{contract.activityCode}</span>
                            </div>
                          </td>
                          <td>
                            <div className="apc-subtable__items">
                              {items.slice(0, 4).map(item => (
                                <span key={item.id}>{item.no}</span>
                              ))}
                              {items.length > 4 && <em>+{items.length - 4}</em>}
                            </div>
                          </td>
                          <td className="num">{items.length}</td>
                          {moneyVisible && (
                            <td className="num">{money(value)}</td>
                          )}
                          <td>{dateLabel(contract.createdAt)}</td>
                          <td>
                            <button
                              className="apc-subtable__delete"
                              onClick={() => deleteContract(contract.id)}
                              aria-label={`Delete ${contract.code}`}
                            >
                              <Icon name="trash-2" size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="apc-docpage__scrim">
          <section
            className="apc-ceimportpop apc-subsourcepop"
            role="dialog"
            aria-label="Create Subletting Contract"
          >
            <div className="apc-importpop__head">
              <div>
                <b>Create Subletting Contract</b>
                <span>Select the Activity Schedule to sublet from</span>
              </div>
              <button className="apc-iconbtn" onClick={closeCreate} aria-label="Close">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="apc-ceimportpop__body">
              {activityOptions.length ? (
                <div className="apc-map-doclist apc-ce-pickerlist">
                  {activityOptions.map(option => {
                    const selected = popupActivityId === option.id;
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`apc-map-doc${selected ? ' on' : ''}`}
                        onClick={() => setPopupActivityId(option.id)}
                        aria-pressed={selected}
                      >
                        <span className="apc-map-doc__icon is-bq">
                          <Icon name="list-tree" size={16} />
                        </span>
                        <span className="apc-map-doc__body">
                          <b>{option.code}</b>
                          <span>{option.name}</span>
                        </span>
                        <i className="apc-map-doc__check">
                          {selected && <Icon name="check" size={11} stroke={3} />}
                        </i>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="apc-pre__reportempty">
                  No Activity Schedule records found. Import an Activity Schedule first.
                </div>
              )}
            </div>
            <div className="apc-importpop__foot">
              <span>
                {popupActivityId
                  ? 'Activity Schedule selected.'
                  : 'Select an Activity Schedule to continue.'}
              </span>
              <button className="apc-ce-back" onClick={closeCreate}>
                Cancel
              </button>
              <button
                className="apc-docpage__import"
                disabled={!popupActivityId}
                onClick={startSubcontractorStep}
              >
                Next
              </button>
            </div>
          </section>
        </div>
      )}

      {listOpen && (
        <div className="apc-docpage__scrim">
          <section
            className="apc-ceimportpop apc-sublistpop"
            role="dialog"
            aria-label="Subcontractor list"
          >
            <div className="apc-importpop__head">
              <div>
                <b>Subcontractor list</b>
                <span>
                  {activityOptions.find(option => option.id === pendingActivityId)?.code ??
                    'Activity Schedule'}
                  {' · '}Add or import the subcontractors before creating contracts
                </span>
              </div>
              <button
                className="apc-iconbtn"
                onClick={() => {
                  setListOpen(false);
                  setListError('');
                }}
                aria-label="Close subcontractor list"
              >
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="apc-ceimportpop__body">
              <div className="apc-sublist__toolbar">
                <div>
                  <b>Subcontractors</b>
                  <span>{subcontractors.length}</span>
                </div>
                <button onClick={addSubcontractorRow}>
                  <Icon name="plus" size={12} />
                  Add row
                </button>
                <label className="apc-sublist__import">
                  <Icon name="upload" size={12} />
                  Import Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={importSubcontractorList}
                  />
                </label>
              </div>
              <div className="apc-sublist__hint">
                Excel format: Subcontractor ID | Subcontractor Name
              </div>
              <div className="apc-sublist__scroll">
                <table className="apc-sublisttable">
                  <thead>
                    <tr>
                      <th>Unique ID</th>
                      <th>Subcontractor name</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {subcontractors.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="apc-sublist__empty">
                          No subcontractors yet. Add a row or import an Excel list.
                        </td>
                      </tr>
                    ) : (
                      subcontractors.map((sub, index) => (
                        <tr key={`${sub.id}-${index}`}>
                          <td>
                            <input
                              value={sub.id}
                              onChange={event =>
                                updateSubcontractorRow(index, {
                                  id: event.target.value
                                })
                              }
                              aria-label={`Subcontractor ID ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              value={sub.name}
                              onChange={event =>
                                updateSubcontractorRow(index, {
                                  name: event.target.value
                                })
                              }
                              placeholder="Subcontractor name"
                              aria-label={`Subcontractor name ${index + 1}`}
                            />
                          </td>
                          <td>
                            <button
                              className="apc-sublist__delete"
                              onClick={() => removeSubcontractorRow(index)}
                              aria-label={`Remove ${sub.id}`}
                            >
                              <Icon name="trash-2" size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {listError && <div className="apc-home__error">{listError}</div>}
            </div>
            <div className="apc-importpop__foot">
              <span>
                {listValid
                  ? `${subcontractors.length} subcontractors ready.`
                  : 'Every subcontractor needs a unique ID and a name.'}
              </span>
              <button className="apc-ce-back" onClick={backToActivityStep}>
                Back
              </button>
              <button
                className="apc-ce-back"
                onClick={() => {
                  setListOpen(false);
                  setListError('');
                }}
              >
                Cancel
              </button>
              <button
                className="apc-docpage__import"
                disabled={!listValid}
                onClick={finishSubcontractorStep}
              >
                Next
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
