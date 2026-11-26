import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { CostResultPage } from './CostResultPage';
import { ModelReview, type ModelViewProps } from './ModelView';
import { DraggablePanel } from '../components/DraggablePanel';
import { Hint } from '../components/Hint';
import { Icon, type IconName } from '../components/Icon';
import { demoData, type ElementData } from '../lib/demo';
import { loadSmmMaterials, saveSmmMaterials } from '../data/smm';
import { optionInfo, type NecOption } from '../lib/projects';
import {
  BAND_COLOR,
  BAND_HEX,
  BAND_LABEL,
  buildMappingResult,
  formatIsoDay,
  type MappingElementResult,
  type MappingResult,
  type ProgrammeActivity,
  type ProgressBand
} from '../lib/mappingResult';
import { mount as mountViewport, type ViewportApi } from '../three/viewport';
import {
  MAPPING_DOC_ICON,
  MAPPING_DOC_LABEL,
  MAPPING_STANDARDS,
  MAPPING_STATUS_LABEL,
  MAPPING_TYPE_LABEL,
  countSources,
  loadMappingScenarios,
  newMappingScenarioId,
  saveMappingScenarios,
  type MappingDocType,
  type MappingScenario,
  type MappingSources,
  type MappingType
} from '../lib/mappingScenarios';
import { loadScanAssets, saveScanAssets, type ScanAsset } from '../lib/scanAssets';
import { getIfcModel, listScanAssets, probeScanApi } from '../lib/scanApi';
import { loadModelMeshes } from '../lib/ifc/meshCache';

const MAPPING_STEPS = [
  'Reading BIM model',
  'Reading quantity source',
  'Matching BIM elements to SMM items',
  'Preparing mapping result'
];

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function MappingViewer({
  elements,
  colors,
  selectedId,
  showCloud,
  pointsOnly = false,
  onPick,
  onApi
}: {
  elements: MappingElementResult[];
  colors: Record<string, number>;
  selectedId: string | null;
  showCloud: boolean;
  pointsOnly?: boolean;
  onPick: (id: string | null) => void;
  onApi: (api: ViewportApi | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewportApi | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!host.current) return;
    const api = mountViewport(host.current, {
      elements: elements.map(item => item.el),
      levels: demoData.levels,
      onPick: id => pickRef.current(id)
    });
    apiRef.current = api;
    onApi(api);
    if (!pointsOnly) api.setElementColors(colors, selectedId);
    if (showCloud) api.setPointCloud([0, 0, 0]);
    api.focus(elements.map(item => item.el.id));
    if (pointsOnly) api.hide(elements.map(item => item.el.id));
    return () => {
      apiRef.current = null;
      onApi(null);
      api.dispose();
    };
  }, [elements]);

  useEffect(() => {
    if (pointsOnly) return;
    apiRef.current?.setElementColors(colors, selectedId);
  }, [colors, selectedId, pointsOnly]);

  useEffect(() => {
    apiRef.current?.setPointCloud(showCloud ? [0, 0, 0] : null);
  }, [showCloud]);

  return <div className="apc-scan-review__canvas" ref={host} />;
}

function MappingProcessing({
  pct,
  step,
  name,
  hasProgramme
}: {
  pct: number;
  step: number;
  name: string;
  hasProgramme: boolean;
}) {
  const steps = hasProgramme
    ? MAPPING_STEPS
    : MAPPING_STEPS.filter(label => !label.startsWith('Linking'));
  return (
    <div className="apc-docpage__scrim apc-scan-processing__scrim">
      <section className="apc-scan-processing" role="status" aria-label="Mapping in progress">
        <div
          className="apc-scan-processing__ring"
          style={{ background: `conic-gradient(#151719 ${pct}%, #e8edf0 ${pct}% 100%)` }}
        >
          <span>{pct}%</span>
        </div>
        <b>Mapping BIM to SMM</b>
        <span className="apc-scan-processing__model" title={name}>
          {name}
        </span>
        <div className="apc-scan-processing__steps">
          {steps.map((label, index) => (
            <div key={label} className={index <= step ? 'on' : ''}>
              <Icon name={index < step ? 'check' : index === step ? 'scan' : 'box'} size={13} />
              {label}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MappingComplete({ result, onView }: { result: MappingResult; onView: () => void }) {
  return (
    <div className="apc-docpage__scrim apc-cleansepop__scrim">
      <section className="apc-cleansepop" role="dialog" aria-label="Mapping complete">
        <button className="apc-cleansepop__close" onClick={onView} aria-label="Close">
          <Icon name="x" size={17} />
        </button>
        <div className="apc-cleansepop__mark">
          <Icon name="check" size={54} stroke={3.4} />
        </div>
        <h2>Mapping complete</h2>
        <p>{result.elements.length} BIM elements mapped to SMM items.</p>
        <button className="apc-cleansepop__cta" onClick={onView}>
          View mapping result
          <Icon name="chevron-right" size={14} />
        </button>
      </section>
    </div>
  );
}

function MappingSmmPage({
  scenario,
  elements,
  onBack
}: {
  scenario: MappingScenario;
  elements: ElementData[];
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    loadSmmMaterials(scenario.id)
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [materialDraft, setMaterialDraft] = useState('');
  const materialCancel = useRef(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMaterial, setBatchMaterial] = useState('');
  const pricingLabel = scenario.sources?.activity ? 'Activity Schedule' : 'BQ';

  useEffect(() => {
    saveSmmMaterials(scenario.id, overrides);
  }, [overrides, scenario.id]);

  const effectiveElements = useMemo(
    () =>
      elements.map(element => {
        const value = overrides[element.id];
        return value === undefined ? element : { ...element, mat: value };
      }),
    [elements, overrides]
  );

  const mappedRows = useMemo(
    () => effectiveElements.map((element, index) => ({ el: element, ...smmForElement(element, index) })),
    [effectiveElements]
  );
  const unmappedRows = useMemo(() => mappedRows.filter(row => !row.mapped), [mappedRows]);
  const visibleRows = useMemo(
    () =>
      statusFilter === 'all'
        ? mappedRows
        : mappedRows.filter(row => (statusFilter === 'mapped' ? row.mapped : !row.mapped)),
    [mappedRows, statusFilter]
  );
  const viewerElements = useMemo(
    () =>
      mappedRows.map(row => ({
        el: row.el,
        progress: 0,
        band: 'green' as const,
        activityId: ''
      })),
    [mappedRows]
  );
  const colors = useMemo(
    () =>
      Object.fromEntries(
        mappedRows.map(row => [row.el.id, row.mapped ? BAND_HEX.green : BAND_HEX.amber])
      ),
    [mappedRows]
  );
  const materialOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...effectiveElements.map(element => element.mat).filter(Boolean),
          'C20/20_BLINDING',
          'C35/20_OPC',
          'C50/20_OPC',
          'C60/20_OPC',
          'PRECAST_CP1'
        ])
      ).sort(),
    [effectiveElements]
  );
  const quantityLabel = scenario.sources?.bq
    ? `BQ · ${scenario.sources.bq}`
    : scenario.sources?.activity
      ? `Activity · ${scenario.sources.activity}`
      : null;

  const startMaterialEdit = (row: { el: ElementData; material: string }) => {
    setSelectedId(row.el.id);
    setEditingId(row.el.id);
    setMaterialDraft(row.material);
    materialCancel.current = false;
  };

  const commitMaterialEdit = (id: string) => {
    if (materialCancel.current) {
      materialCancel.current = false;
      setEditingId(null);
      return;
    }
    const value = materialDraft.trim();
    const original = elements.find(element => element.id === id)?.mat ?? '';
    setOverrides(prev => {
      const next = { ...prev };
      if (!value || value === original) delete next[id];
      else next[id] = value;
      return next;
    });
    setEditingId(null);
  };

  const cancelMaterialEdit = () => {
    materialCancel.current = true;
    setEditingId(null);
  };

  const openBatch = () => {
    setStatusFilter('unmapped');
    setBatchMaterial('');
    setBatchOpen(true);
  };

  const applyBatch = () => {
    const value = batchMaterial.trim();
    if (!value) return;
    const ids = unmappedRows.map(row => row.el.id);
    setOverrides(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        next[id] = value;
      });
      return next;
    });
    setBatchOpen(false);
    setStatusFilter('all');
  };

  return (
    <main className="apc-scan-review apc-smmresult">
      <header className="apc-scan-review__head">
        <button className="apc-scan-review__back" onClick={onBack} aria-label="Back to mapping scenarios">
          <Icon name="arrow-left" size={16} />
        </button>
        <div className="apc-scan-review__title">
          <h1>Mapping Model</h1>
          <span title={quantityLabel ?? undefined}>
            {scenario.name} · {elements.length} BIM elements
            {quantityLabel ? ` · ${quantityLabel}` : ''}
          </span>
        </div>
        <span className="apc-scan-review__state is-cleansed">SMM library</span>
      </header>

      <div className="apc-smmresult__workspace">
        <div className="apc-smmresult__viewer">
          <MappingViewer
            elements={viewerElements}
            colors={colors}
            selectedId={selectedId}
            showCloud={false}
            onPick={setSelectedId}
            onApi={() => undefined}
          />
        </div>

        <section className="apc-bqpanel apc-smmresult__table">
          <div className="apc-bqpanel__head apc-smmresult__head">
            <div className="apc-smmresult__headmain">
              <b>SMM mapping</b>
              <span>
                {visibleRows.length} / {mappedRows.length} elements
              </span>
            </div>
            <div className="apc-smmresult__tools">
              <select
                className="apc-smmresult__filter"
                value={statusFilter}
                onChange={event =>
                  setStatusFilter(event.target.value as 'all' | 'mapped' | 'unmapped')
                }
                aria-label="Filter by mapping status"
              >
                <option value="all">All elements</option>
                <option value="mapped">Mapped</option>
                <option value="unmapped">Unmapped</option>
              </select>
              {Object.keys(overrides).length > 0 && (
                <button
                  type="button"
                  className="apc-smmresult__reset"
                  onClick={() => {
                    setOverrides({});
                    setEditingId(null);
                  }}
                >
                  Reset edits
                </button>
              )}
              <button
                type="button"
                className="apc-smmresult__batch"
                disabled={!unmappedRows.length}
                onClick={openBatch}
              >
                Batch edit unmapped
              </button>
            </div>
          </div>

          {batchOpen && (
            <div className="apc-smm-batch">
              <div className="apc-smm-batch__copy">
                <b>Batch assign material</b>
                <span>{unmappedRows.length} unmapped elements · choose an existing value or type a new one</span>
              </div>
              <input
                className="apc-smm-batch__input"
                list="smm-material-options"
                value={batchMaterial}
                aria-label="Batch material attribute"
                onChange={event => setBatchMaterial(event.target.value)}
                placeholder="e.g. C35/20_OPC"
              />
              <button className="apc-smm-batch__cancel" onClick={() => setBatchOpen(false)}>
                Cancel
              </button>
              <button
                className="apc-smm-batch__apply"
                disabled={!batchMaterial.trim()}
                onClick={applyBatch}
              >
                Apply to {unmappedRows.length}
              </button>
            </div>
          )}

          <datalist id="smm-material-options">
            {materialOptions.map(option => (
              <option key={option} value={option} />
            ))}
          </datalist>

          <div className="apc-bqpanel__scroll">
            <div className="apc-tablefill">
              <table className="apc-bqtable apc-smmresult__grid">
                <thead>
                  <tr>
                    <th>Element</th>
                    <th>IFC class</th>
                    <th>Storey</th>
                    <th>Material attribute</th>
                    <th>SMM library item</th>
                    <th>{pricingLabel} item</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => {
                    const editing = editingId === row.el.id;
                    return (
                      <tr
                        key={row.el.id}
                        className={`apc-bqtable__item${selectedId === row.el.id ? ' on' : ''}`}
                        onClick={() => setSelectedId(row.el.id)}
                      >
                        <td>
                          <b>{row.el.mark}</b>
                        </td>
                        <td>{row.el.cls.replace('Ifc', '')}</td>
                        <td>{row.el.level}</td>
                        <td className="apc-smm-material">
                          {editing ? (
                            <input
                              className="apc-smm-material__input"
                              list="smm-material-options"
                              autoFocus
                              value={materialDraft}
                              placeholder="C35/20_OPC"
                              aria-label="Material attribute"
                              onChange={event => setMaterialDraft(event.target.value)}
                              onBlur={() => commitMaterialEdit(row.el.id)}
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitMaterialEdit(row.el.id);
                                } else if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelMaterialEdit();
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="apc-smm-material__btn"
                              onClick={() => startMaterialEdit(row)}
                              title={`${row.material || '—'} · Click to edit material attribute`}
                              aria-label={`Edit material attribute ${row.material || ''}`}
                            >
                              <span>{row.material || '—'}</span>
                              <Icon name="pencil-line" size={10} />
                            </button>
                          )}
                        </td>
                        <td className="apc-smm-cell" title={row.smm}>
                          {row.smm}
                        </td>
                        <td className="apc-smm-cell" title={row.bq}>
                          {row.bq}
                        </td>
                        <td className="num">{row.el.net.toFixed(2)}</td>
                        <td>
                          <span className={`apc-map-finding is-${row.mapped ? 'green' : 'amber'}`}>
                            {row.mapped ? 'Mapped' : 'Unmapped'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length && (
                    <tr>
                      <td colSpan={8} className="apc-bqtable__empty">
                        No elements match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function MappingResultPage({
  run,
  onBack,
  showProgramme,
  onCloseProgramme,
  onToggleProgramme
}: {
  run: { scenario: MappingScenario; result: MappingResult };
  onBack: () => void;
  showProgramme: boolean;
  onCloseProgramme: () => void;
  onToggleProgramme: () => void;
}) {
  const { scenario, result } = run;
  const hasProgramme = !!scenario.sources?.programme;
  const hasP6 = hasProgramme && isP6Programme(scenario.sources?.programme);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [band, setBand] = useState<'all' | ProgressBand>('all');
  const [readinessOpen, setReadinessOpen] = useState(true);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [cloudOn, setCloudOn] = useState(true);
  const [timeline, setTimeline] = useState(1000);
  const [playing, setPlaying] = useState(false);
  const [viewWidth, setViewWidth] = useState(360);
  const [expanded, setExpanded] = useState(false);
  const viewerApi = useRef<ViewportApi | null>(null);
  const viewResize = useRef<{ x: number; w: number } | null>(null);
  const ticks = useMemo(() => buildProgrammeTicks(result.activities), [result]);

  useEffect(() => {
    if (!showProgramme) setExpanded(false);
  }, [showProgramme]);

  const closeProgramme = () => {
    setExpanded(false);
    onCloseProgramme();
  };

  const startViewResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    viewResize.current = { x: event.clientX, w: viewWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveViewResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!viewResize.current) return;
    const next = Math.min(
      560,
      Math.max(300, viewResize.current.w + (viewResize.current.x - event.clientX))
    );
    setViewWidth(next);
  };
  const endViewResize = () => {
    viewResize.current = null;
  };

  const colors = useMemo(() => {
    const map: Record<string, number> = {};
    result.elements.forEach(item => {
      map[item.el.id] = BAND_HEX[item.band];
    });
    return map;
  }, [result]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return result.elements.filter(item => {
      if (band !== 'all' && item.band !== band) return false;
      if (!needle) return true;
      return [item.el.mark, item.el.cls, item.el.level, item.activityId]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [result, query, band]);

  const activityName = (id: string) =>
    result.activities.find(activity => activity.id === id)?.name ?? '—';

  const activityOf = (id: string) =>
    result.activities.find(activity => activity.id === id) ?? null;

  const timelineStart = result.activities.length
    ? Math.min(...result.activities.map(activity => Date.parse(activity.startISO)))
    : 0;
  const timelineEnd = result.activities.length
    ? Math.max(...result.activities.map(activity => Date.parse(activity.endISO)))
    : 0;
  const cursorMs =
    timelineStart + (timeline / 1000) * Math.max(1, timelineEnd - timelineStart);

  const visibleIds = useMemo(() => {
    if (!hasP6) return null;
    return result.elements
      .filter(item => {
        const activity = result.activities.find(candidate => candidate.id === item.activityId);
        return !activity || Date.parse(activity.startISO) <= cursorMs;
      })
      .map(item => item.el.id);
  }, [hasP6, result, cursorMs]);

  useEffect(() => {
    if (!hasP6 || !visibleIds) return;
    const api = viewerApi.current;
    if (!api) return;
    if (!visibleIds.length) api.isolate(['__none__']);
    else if (visibleIds.length === result.elements.length) api.showAll();
    else api.isolate(visibleIds);
  }, [hasP6, visibleIds, result, expanded]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTimeline(prev => {
        const next = Math.min(1000, prev + 8);
        if (next >= 1000) setPlaying(false);
        return next;
      });
    }, 60);
    return () => window.clearInterval(timer);
  }, [playing]);

  const underIds = result.elements
    .filter(item => item.band === 'red')
    .map(item => item.el.id);

  const toggleActivity = (activityId: string, ids: string[]) => {
    if (selectedActivity === activityId) {
      setSelectedActivity(null);
      viewerApi.current?.showAll();
      return;
    }
    setSelectedActivity(activityId);
    viewerApi.current?.isolate(ids);
  };

  const exportCsv = () => {
    const header = [
      'Element',
      'IFC class',
      'Storey',
      'Qty',
      ...(hasProgramme ? ['Programme activity'] : []),
      ...(hasP6
        ? ['Activity ID', 'Start', 'End', 'Late start', 'Late end', 'Delay (days)']
        : []),
      'Progress %',
      'Finding'
    ];
    const lines = result.elements.map(item => {
      const activity = activityOf(item.activityId);
      const cells: Array<string | number> = [
        item.el.mark,
        item.el.cls,
        item.el.level,
        item.el.net.toFixed(2)
      ];
      if (hasProgramme) cells.push(activity?.name ?? '—');
      if (hasP6) {
        cells.push(
          activity?.code ?? '—',
          activity ? formatIsoDay(activity.startISO) : '—',
          activity ? formatIsoDay(activity.endISO) : '—',
          activity ? formatIsoDay(activity.lateStartISO) : '—',
          activity ? formatIsoDay(activity.lateEndISO) : '—',
          activity ? activity.delayDays : '—'
        );
      }
      cells.push(item.progress, BAND_LABEL[item.band]);
      return cells.map(csvCell).join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scenario.name.replace(/[^\w-]+/g, '_')}_mapping.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const bandCount = (key: ProgressBand) => result.counts[key];
  const bandPercent = (key: ProgressBand) =>
    result.elements.length ? Math.round((bandCount(key) / result.elements.length) * 100) : 0;

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (timeline >= 1000) setTimeline(0);
    setPlaying(true);
  };

  return (
    <main className="apc-scan-review apc-mapresult">
      <header className="apc-scan-review__head">
        <button className="apc-scan-review__back" onClick={onBack} aria-label="Back to mapping scenarios">
          <Icon name="arrow-left" size={16} />
        </button>
        <div className="apc-scan-review__title">
          <h1>AI Scanning</h1>
          <span>
            AI Progress Checking · {scenario.name} · {result.elements.length} BIM elements
          </span>
        </div>
        <span
          className={`apc-scan-review__state ${result.overall >= 90 ? 'is-cleansed' : 'is-review'}`}
        >
          {result.overall}% complete
        </span>
        <button className="apc-scan-review__cleanse" onClick={exportCsv}>
          <Icon name="download" size={13} />
          Export report
        </button>
      </header>

      <div className="apc-scan-review__workspace">
        <div
          className={`apc-scan-review__stage apc-map-stage${expanded ? ' is-expanded' : ''}`}
          style={
            {
              '--map-view-w':
                hasProgramme && showProgramme && !expanded ? `${viewWidth}px` : '0px'
            } as CSSProperties
          }
        >
          {!expanded && (
          <div className="apc-map-canvas">
          <div className="apc-map-tiles">
            <section className="apc-map-tile" aria-label="BIM model tile">
              <span className="apc-map-tile__label">
                <Icon name="box" size={11} />
                BIM model
              </span>
              <MappingViewer
                elements={result.elements}
                colors={colors}
                selectedId={selectedId}
                showCloud={false}
                onPick={id => setSelectedId(id)}
                onApi={api => {
                  viewerApi.current = api;
                }}
              />
            </section>
            <section className="apc-map-tile" aria-label="Point cloud tile">
              <span className="apc-map-tile__label">
                <Icon name="scan" size={11} />
                Point cloud
              </span>
              <MappingViewer
                elements={result.elements}
                colors={colors}
                selectedId={null}
                showCloud={cloudOn}
                pointsOnly
                onPick={() => undefined}
                onApi={() => undefined}
              />
            </section>
          </div>

          {readinessOpen && (
            <DraggablePanel
              title="Point cloud verification"
              icon="badge-check"
              initial={{ x: 16, y: 16, w: 318, h: 330 }}
              minWidth={270}
              minHeight={220}
              onClose={() => setReadinessOpen(false)}
            >
              <div className="apc-scan-readiness__body">
                <div className="apc-scan-readiness__hero">
                  <div
                    className="apc-scan-readiness__ring"
                    style={{ background: `conic-gradient(#24b04b ${result.overall}%, #e8edf0 ${result.overall}% 100%)` }}
                  >
                    <span>{result.overall}%</span>
                  </div>
                  <div className="apc-scan-readiness__legend">
                    <b>Overall progress</b>
                    <span>{result.elements.length} elements compared with the point cloud</span>
                  </div>
                </div>
                <div className="apc-map-bandrows">
                  {(['green', 'amber', 'red'] as ProgressBand[]).map(key => (
                    <div key={key} className="apc-map-bandrow">
                      <i style={{ background: BAND_COLOR[key] }} />
                      <span>{BAND_LABEL[key]}</span>
                      <b>{bandCount(key)}</b>
                      <em>{bandPercent(key)}%</em>
                    </div>
                  ))}
                </div>
                <div className="apc-map-grid">
                  <Icon name={cloudOn ? 'check' : 'scan'} size={11} />
                  {scenario.sources?.pointCloud
                    ? `${scenario.sources.pointCloud} · HK1980 grid ±0.050 m`
                    : 'No point cloud linked · comparison generated from BIM'}
                </div>
              </div>
            </DraggablePanel>
          )}

          </div>
          )}

          {hasProgramme && showProgramme && (
            <aside
              className={`apc-map-view${expanded ? ' is-expanded' : ''}`}
              style={{ width: expanded ? '100%' : viewWidth }}
              aria-label="Master programme view"
            >
              {!expanded && (
                <span
                  className="apc-map-view__resize"
                  onPointerDown={startViewResize}
                  onPointerMove={moveViewResize}
                  onPointerUp={endViewResize}
                  onPointerCancel={endViewResize}
                  role="separator"
                  aria-label="Resize master programme view"
                />
              )}
              <header className="apc-map-view__head">
                <Icon name="file-text" size={13} />
                <b>Master programme</b>
                <span className="apc-map-view__src" title={scenario.sources?.programme ?? ''}>
                  {scenario.sources?.programme ?? 'No programme linked'}
                </span>
                <button
                  className="apc-iconbtn"
                  onClick={() => setExpanded(value => !value)}
                  aria-label={expanded ? 'Restore 3D view' : 'Expand master programme'}
                  title={expanded ? 'Restore 3D view' : 'Expand to full width'}
                >
                  <Icon name={expanded ? 'minimize-2' : 'maximize-2'} size={14} />
                </button>
                <button
                  className="apc-iconbtn"
                  onClick={closeProgramme}
                  aria-label="Close master programme view"
                >
                  <Icon name="x" size={13} />
                </button>
              </header>

              <div className={`apc-mp${expanded ? ' is-expanded' : ''}`}>
                <div className="apc-mp__head">
                  <div className="apc-mp__left">
                    <span>ID</span>
                    <span>Activity</span>
                    <span>Start</span>
                    <span>Finish</span>
                    <span>%</span>
                  </div>
                  {expanded && (
                    <div className="apc-mp__gantt">
                      <div className="apc-mp__years">
                        {ticks.years.map(year => (
                          <span key={year.year} style={{ width: `${year.width}%` }}>
                            {year.year}
                          </span>
                        ))}
                      </div>
                      <div className="apc-mp__months">
                        {ticks.months.map(month => (
                          <span key={month.key} style={{ width: `${month.width}%` }}>
                            {month.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="apc-mp__scroll">
                  {result.activities.map(activity => {
                    const start = Date.parse(activity.startISO);
                    const end = Date.parse(activity.endISO);
                    const span = Math.max(1, ticks.end - ticks.start);
                    const left = ((start - ticks.start) / span) * 100;
                    const width = Math.max(0.8, ((end - start) / span) * 100);
                    return (
                      <div
                        key={activity.id}
                        className={`apc-mp__row${selectedActivity === activity.id ? ' on' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleActivity(activity.id, activity.elementIds)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleActivity(activity.id, activity.elementIds);
                          }
                        }}
                      >
                        <div className="apc-mp__left">
                          <span className="apc-mp__code">{activity.code}</span>
                          <b className="apc-mp__name" title={activity.name}>
                            {activity.name}
                          </b>
                          <span>{formatIsoDay(activity.startISO)}</span>
                          <span>{formatIsoDay(activity.endISO)}</span>
                          <span className="apc-mp__pct">{activity.actualPct}%</span>
                        </div>
                        {expanded && (
                          <div className="apc-mp__track">
                            <i
                              className={`apc-mp__bar is-${activity.status}`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              <b style={{ width: `${activity.actualPct}%` }} />
                            </i>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!result.activities.length && (
                    <div className="apc-mp__empty">No programme activities linked to this scenario.</div>
                  )}
                </div>
              </div>
            </aside>
          )}

          <div className="apc-scan-review__bar">
            <span className="apc-toolgroup">
              <Hint delay={0} label="Progress readiness">
                <button
                  className={`apc-tool${readinessOpen ? ' on' : ''}`}
                  onClick={() => setReadinessOpen(open => !open)}
                  aria-label="Progress readiness"
                >
                  <Icon name="badge-check" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Isolate under 50%">
                <button
                  className="apc-tool"
                  onClick={() => viewerApi.current?.isolate(underIds)}
                  disabled={!underIds.length}
                  aria-label="Isolate under 50 percent"
                >
                  <Icon name="circle-alert" size={15} />
                </button>
              </Hint>
              <Hint delay={0} label="Show all">
                <button
                  className="apc-tool"
                  onClick={() => {
                    setSelectedActivity(null);
                    viewerApi.current?.showAll();
                  }}
                  aria-label="Show all"
                >
                  <Icon name="eye" size={15} />
                </button>
              </Hint>
              {hasProgramme && (
                <>
                  <i className="apc-toolsep" aria-hidden="true" />
                  <Hint delay={0} label={showProgramme ? 'Hide master programme' : 'Show master programme'}>
                    <button
                      className={`apc-tool${showProgramme ? ' on' : ''}`}
                      onClick={onToggleProgramme}
                      aria-label="Master programme"
                    >
                      <Icon name="file-text" size={15} />
                    </button>
                  </Hint>
                </>
              )}
              <Hint delay={0} label={cloudOn ? 'Hide point cloud' : 'Show point cloud'}>
                <button
                  className={`apc-tool${cloudOn ? ' on' : ''}`}
                  onClick={() => setCloudOn(on => !on)}
                  aria-label="Toggle point cloud"
                >
                  <Icon name="scan" size={15} />
                </button>
              </Hint>
              <i className="apc-toolsep" aria-hidden="true" />
              <Hint delay={0} label="Export report">
                <button className="apc-tool" onClick={exportCsv} aria-label="Export report">
                  <Icon name="download" size={15} />
                </button>
              </Hint>
            </span>
          </div>
        </div>

        <section className="apc-bqpanel apc-scan-elements apc-map-elements" style={{ height: 300 }}>
          <div className="apc-bqpanel__head apc-scan-elements__head">
            <b>BIM elements</b>
            <div className="apc-bqsearch apc-scan-elements__search">
              <Icon name="search" size={12} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search elements"
                aria-label="Search mapping elements"
              />
            </div>
            <div className="apc-map-bands">
              <button
                className={band === 'all' ? 'on' : ''}
                onClick={() => setBand('all')}
              >
                All <b>{result.elements.length}</b>
              </button>
              {(['red', 'amber', 'green'] as ProgressBand[]).map(key => (
                <button
                  key={key}
                  className={`is-${key}${band === key ? ' on' : ''}`}
                  onClick={() => setBand(key)}
                >
                  {BAND_LABEL[key]} <b>{bandCount(key)}</b>
                </button>
              ))}
            </div>
          </div>

          {hasP6 && (
            <div className="apc-map-timeline">
              <button
                className={`apc-map-timeline__play${playing ? ' on' : ''}`}
                onClick={togglePlay}
                aria-label={playing ? 'Pause construction sequence' : 'Play construction sequence'}
                title={playing ? 'Pause 4D sequence' : 'Play 4D sequence'}
              >
                <Icon name={playing ? 'pause' : 'play'} size={12} />
              </button>
              <span className="apc-map-timeline__date">
                {formatIsoDay(new Date(cursorMs).toISOString().slice(0, 10))}
              </span>
              <input
                type="range"
                min={0}
                max={1000}
                step={1}
                value={timeline}
                onChange={event => {
                  setPlaying(false);
                  setTimeline(Number(event.target.value));
                }}
                aria-label="Construction timeline"
              />
              <span className="apc-map-timeline__count">
                {visibleIds?.length ?? result.elements.length}/{result.elements.length} shown
              </span>
            </div>
          )}

          <div className="apc-bqpanel__scroll">
            <div className="apc-tablefill apc-scan-elements__tablefill">
              <table
                className={`apc-bqtable apc-scan-elements__table apc-map-elements__table${
                  hasProgramme ? '' : ' is-noprog'
                }${hasP6 ? ' is-p6' : ''}`}
              >
                <thead>
                  <tr>
                    <th>Element</th>
                    <th>IFC class</th>
                    <th>Storey</th>
                    <th>Qty</th>
                    {hasProgramme && <th>Programme activity</th>}
                    {hasP6 && (
                      <>
                        <th>Activity ID</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Late start</th>
                        <th>Late end</th>
                        <th>Delay</th>
                      </>
                    )}
                    <th>Progress</th>
                    <th>Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => {
                    const activity = activityOf(item.activityId);
                    return (
                      <tr
                        key={item.el.id}
                        className={`apc-bqtable__item${selectedId === item.el.id ? ' on' : ''}`}
                        onClick={() => setSelectedId(item.el.id)}
                      >
                        <td>
                          <b>{item.el.mark}</b>
                        </td>
                        <td>{item.el.cls.replace('Ifc', '')}</td>
                        <td>{item.el.level}</td>
                        <td className="mono">{item.el.net.toFixed(2)}</td>
                        {hasProgramme && <td>{activity?.name ?? '—'}</td>}
                        {hasP6 && (
                          <>
                            <td className="mono">{activity?.code ?? '—'}</td>
                            <td>{activity ? formatIsoDay(activity.startISO) : '—'}</td>
                            <td>{activity ? formatIsoDay(activity.endISO) : '—'}</td>
                            <td>{activity ? formatIsoDay(activity.lateStartISO) : '—'}</td>
                            <td>{activity ? formatIsoDay(activity.lateEndISO) : '—'}</td>
                            <td className={activity && activity.delayDays > 0 ? 'is-delay' : ''}>
                              {activity ? `${activity.delayDays} d` : '—'}
                            </td>
                          </>
                        )}
                        <td>
                          <div className="apc-map-progress">
                            <span className="bar">
                              <i style={{ width: `${item.progress}%`, background: BAND_COLOR[item.band] }} />
                            </span>
                            <b>{item.progress}%</b>
                          </div>
                        </td>
                        <td>
                          <span className={`apc-map-finding is-${item.band}`}>
                            {BAND_LABEL[item.band]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && (
                    <tr>
                      <td
                        colSpan={hasP6 ? 13 : hasProgramme ? 7 : 6}
                        className="apc-scan-elements__empty"
                      >
                        No elements match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

const TYPE_ICON: Record<MappingType, IconName> = {
  progress: 'clipboard-check',
  cost: 'credit-card',
  hybrid: 'columns-2'
};

const TYPE_ACCENT: Record<MappingType, string> = {
  progress: '#2f7ea8',
  cost: '#c08a2e',
  hybrid: '#6a5acd'
};

const dateLabel = (time: number) =>
  new Date(time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const percentOf = (scenario: MappingScenario) =>
  scenario.elementCount ? Math.round((scenario.mappedCount / scenario.elementCount) * 100) : 0;

interface SourceDoc {
  id?: string;
  name: string;
  project: string;
  size: string;
  uploaded: string;
  modelId?: string;
}

const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const isP6Programme = (name?: string) => !!name && /\.(xer|xml)$/i.test(name);

const BQ_ITEMS = demoData.bill.lines.filter(line => line.type === 'item');

const smmLibraryForMaterial = (material: string) => {
  if (!material) return null;
  if (/PRECAST/i.test(material)) return 'Precast concrete';
  if (/TREAT|FORMWORK|FINISH/i.test(material)) {
    return 'Treatment to faces of in-situ concrete';
  }
  if (/C\d+\s*\/\s*\d+/i.test(material) || /CONCRETE/i.test(material)) {
    return 'In-situ concrete';
  }
  return null;
};

const smmLibraryForBq = (rule?: string) => {
  if (!rule) return null;
  if (rule.startsWith('S12-INSITU')) return 'In-situ concrete';
  if (rule.startsWith('S12-PRECAST')) return 'Precast concrete';
  if (rule.startsWith('S12-TREAT')) return 'Treatment to faces of in-situ concrete';
  return null;
};

const bqForElement = (element: ElementData) => {
  const library = smmLibraryForMaterial(element.mat);
  if (!library) return '—';
  const material = element.mat.toUpperCase();
  const type = element.type.toUpperCase();
  const candidates = BQ_ITEMS.filter(item => {
    if (smmLibraryForBq(item.rule) !== library) return false;
    const filter = item.filter;
    if (!filter) return false;
    if (filter.grade && !material.includes(filter.grade.toUpperCase())) return false;
    if (filter.cement && !material.includes(filter.cement.toUpperCase())) return false;
    if (
      filter.ptype &&
      !type.includes(filter.ptype.toUpperCase()) &&
      !material.includes(filter.ptype.toUpperCase())
    ) {
      return false;
    }
    return true;
  });
  const match =
    candidates.find(item => item.filter?.cls === element.cls) ?? candidates[0];
  return match ? `${match.no ?? ''} ${match.label}`.trim() : '—';
};

const smmForElement = (element: ElementData, _index: number) => {
  const material = element.mat || '—';
  const smm = smmLibraryForMaterial(element.mat) ?? '—';
  const bq = bqForElement(element);
  return {
    material,
    smm,
    bq,
    qty: element.net,
    mapped: smm !== '—' && bq !== '—'
  };
};

interface ProgrammeMonth {
  key: string;
  label: string;
  year: number;
  width: number;
}

const buildProgrammeTicks = (activities: ProgrammeActivity[]) => {
  if (!activities.length) {
    return { months: [] as ProgrammeMonth[], years: [] as { year: number; width: number }[], start: 0, end: 0 };
  }
  const start = Math.min(...activities.map(activity => Date.parse(activity.startISO)));
  const end = Math.max(...activities.map(activity => Date.parse(activity.endISO)));
  const total = Math.max(1, end - start);
  const months: ProgrammeMonth[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  while (cursor.getTime() < end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const monthStart = Date.UTC(year, month, 1);
    const monthEnd = Date.UTC(year, month + 1, 1);
    const from = Math.max(start, monthStart);
    const to = Math.min(end, monthEnd);
    if (to > from) {
      months.push({
        key: `${year}-${month}`,
        label: new Date(monthStart).toLocaleDateString('en-GB', { month: 'short' }),
        year,
        width: ((to - from) / total) * 100
      });
    }
    cursor.setUTCMonth(month + 1);
  }
  const years: Array<{ year: number; width: number }> = [];
  months.forEach(month => {
    const last = years[years.length - 1];
    if (last && last.year === month.year) last.width += month.width;
    else years.push({ year: month.year, width: month.width });
  });
  return { months, years, start, end };
};

const buildSourceCatalog = (projectId?: string): Record<MappingDocType, SourceDoc[]> => {
  let assets: ReturnType<typeof loadScanAssets> = [];
  try {
    assets = loadScanAssets(projectId);
  } catch {
    assets = [];
  }
  const bim: SourceDoc[] = assets
    .filter(asset => asset.type === 'bim')
    .map(asset => ({
      id: asset.id,
      name: asset.name,
      project: asset.projectName,
      size: fileSize(asset.size),
      uploaded: dateLabel(asset.addedAt),
      modelId: asset.modelId
    }));
  const pointCloud: SourceDoc[] = assets
    .filter(asset => asset.type === 'scan')
    .map(asset => ({
      id: asset.id,
      name: asset.name,
      project: asset.projectName,
      size: fileSize(asset.size),
      uploaded: dateLabel(asset.addedAt)
    }));

  return {
    bim: bim.length
      ? bim
      : [
          {
            name: 'RW-03_Structure.ifc',
            project: 'Tung Chung RW-03',
            size: '24.6 MB',
            uploaded: '12 Nov 2026'
          }
        ],
    pointCloud: pointCloud.length
      ? pointCloud
      : [
          {
            name: 'RW-03_Scan_Level1.e57',
            project: 'Tung Chung RW-03',
            size: '185.0 MB',
            uploaded: '08 Nov 2026'
          }
        ],
    programme: [
      {
        name: 'RW-03_P6_Programme_RevC.xer',
        project: 'Tung Chung RW-03',
        size: '3.8 MB',
        uploaded: '12 Nov 2026'
      },
      {
        name: 'ND201801_P6_Update_Nov.xer',
        project: 'ND201801 Tank STM',
        size: '4.2 MB',
        uploaded: '10 Nov 2026'
      },
      {
        name: 'RW-03 Master Programme Rev C.xlsx',
        project: 'Tung Chung RW-03',
        size: '2.4 MB',
        uploaded: '10 Nov 2026'
      },
      {
        name: 'Marina South Programme Rev B.pdf',
        project: 'Marina South Tower',
        size: '3.1 MB',
        uploaded: '02 Nov 2026'
      }
    ],
    bq: [
      {
        name: 'RW-03 BQ Rev C.xlsx',
        project: 'Tung Chung RW-03',
        size: '1.9 MB',
        uploaded: '28 Oct 2026'
      },
      {
        name: 'RW-03 BQ Rev B.xlsx',
        project: 'Tung Chung RW-03',
        size: '1.8 MB',
        uploaded: '12 Oct 2026'
      },
      {
        name: 'KT-2026-01 BQ Rev C.xlsx',
        project: 'KT-2026-01 RC Frame',
        size: '1.2 MB',
        uploaded: '31 Oct 2026'
      }
    ],
    ce: [
      {
        name: 'RW-03 CE Register 2026-10.xlsx',
        project: 'Tung Chung RW-03',
        size: '420 KB',
        uploaded: '04 Nov 2026'
      },
      {
        name: 'KT-2026-01 CE 2026-10.xlsx',
        project: 'KT-2026-01 RC Frame',
        size: '860 KB',
        uploaded: '03 Nov 2026'
      }
    ],
    invoices: [
      {
        name: 'RW-03 Invoice Pack 2026-10.pdf',
        project: 'Tung Chung RW-03',
        size: '4.6 MB',
        uploaded: '02 Nov 2026'
      },
      {
        name: 'ND201801 Invoice Pack 2026-10.pdf',
        project: 'ND201801 Tank STM',
        size: '3.9 MB',
        uploaded: '31 Oct 2026'
      }
    ],
    activity: [
      {
        name: 'RW-03 Activity Schedule Rev B.xlsx',
        project: 'Tung Chung RW-03',
        size: '980 KB',
        uploaded: '08 Nov 2026'
      },
      {
        name: 'ND201801 Activity Schedule Rev B.xlsx',
        project: 'ND201801 Tank STM',
        size: '1.2 MB',
        uploaded: '06 Nov 2026'
      }
    ],
    rates: [
      {
        name: 'RW-03 Schedule of Rates 2026.xlsx',
        project: 'Tung Chung RW-03',
        size: '260 KB',
        uploaded: '28 Oct 2026'
      },
      {
        name: 'ND201801 Schedule of Rates 2026.xlsx',
        project: 'ND201801 Tank STM',
        size: '310 KB',
        uploaded: '27 Oct 2026'
      }
    ]
  };
};

function MappingDiagram({ type }: { type: MappingType }) {
  const accent = TYPE_ACCENT[type];
  return (
    <svg className="apc-map-card__art" viewBox="0 0 320 150" preserveAspectRatio="none" aria-hidden="true">
      <text x="160" y="18" textAnchor="middle" fontSize="6.5" fill="#96a1aa" letterSpacing="1.6">
        AUTO UPDATE
      </text>
      <rect x="26" y="28" width="92" height="94" rx="9" fill="#ffffff" fillOpacity="0.86" stroke="#dbe3e9" />
      <path d="M72 44 L94 56 V82 L72 94 L50 82 V56 Z" fill="none" stroke="#b6c4cf" strokeWidth="1.3" />
      <path d="M50 56 L72 68 L94 56 M72 68 V94" fill="none" stroke="#b6c4cf" strokeWidth="1.3" />
      <text x="72" y="112" textAnchor="middle" fontSize="7" fill="#8b959e" letterSpacing="1.4">
        BIM
      </text>

      <rect x="202" y="28" width="92" height="94" rx="9" fill="#ffffff" fillOpacity="0.86" stroke="#dbe3e9" />
      {[0, 1, 2].map(index => (
        <g key={index}>
          <rect
            x="214"
            y={48 + index * 20}
            width="9"
            height="9"
            rx="2"
            fill={index === 0 ? accent : '#d9e2e8'}
            fillOpacity={index === 0 ? 0.9 : 1}
          />
          <rect x="230" y={50 + index * 20} width="50" height="4" rx="2" fill="#dde5ea" />
        </g>
      ))}
      <text x="248" y="112" textAnchor="middle" fontSize="7" fill="#8b959e" letterSpacing="1.4">
        SMM
      </text>

      {[0, 1, 2].map(index => (
        <path
          key={index}
          d={`M118 ${62 + index * 12} C 146 ${62 + index * 12}, 174 ${62 + index * 12}, 202 ${62 + index * 12}`}
          fill="none"
          stroke={accent}
          strokeOpacity={0.5 - index * 0.1}
          strokeWidth="1.3"
          strokeDasharray="3 3"
        />
      ))}
      {[0, 1, 2].map(index => (
        <circle key={index} cx="160" cy={62 + index * 12} r="2.4" fill={accent} opacity={0.85 - index * 0.2} />
      ))}
    </svg>
  );
}

export function ScenarioCard({
  scenario,
  onOpen,
  onEdit,
  onRemove
}: {
  scenario: MappingScenario;
  onOpen: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const percent = percentOf(scenario);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <article
      className={`apc-map-card apc-map-card--${scenario.type}`}
      onClick={onOpen}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(true);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="apc-map-card__preview">
        <MappingDiagram type={scenario.type} />
        <span className={`apc-map__pill apc-map__pill--${scenario.type}`}>
          {MAPPING_TYPE_LABEL[scenario.type]}
        </span>
        <span className={`apc-map__state is-${scenario.status}`}>
          {MAPPING_STATUS_LABEL[scenario.status]}
        </span>
      </div>
      <div className="apc-map-card__body">
        <div className="apc-map-card__head">
          <h3 title={scenario.name}>{scenario.name}</h3>
          <div className="apc-map-card__actions" onClick={event => event.stopPropagation()}>
            <button
              className="apc-map-card__more"
              onClick={event => {
                event.stopPropagation();
                setMenuOpen(value => !value);
              }}
              aria-label={`Actions for ${scenario.name}`}
              aria-expanded={menuOpen}
            >
              ···
            </button>
            {menuOpen && (
              <div className="apc-recordmenu apc-map-card__menu">
                {onEdit && (
                  <button
                    onClick={event => {
                      event.stopPropagation();
                      setMenuOpen(false);
                      onEdit();
                    }}
                  >
                    Edit
                  </button>
                )}
                {onRemove && (
                  <button
                    className="danger"
                    onClick={event => {
                      event.stopPropagation();
                      setMenuOpen(false);
                      onRemove();
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="apc-map-card__project">
          {scenario.projectName}
          <span>{scenario.projectNumber}</span>
        </div>
        {(scenario.sources?.bq || scenario.sources?.activity) && (
          <div
            className="apc-map-card__source"
            title={scenario.sources?.bq ?? scenario.sources?.activity}
          >
            <Icon
              name={scenario.sources?.bq ? 'file-spreadsheet' : 'clipboard-check'}
              size={11}
            />
            <span>{scenario.sources?.bq ? 'BQ' : 'Activity'}</span>
            <b>{scenario.sources?.bq ?? scenario.sources?.activity}</b>
          </div>
        )}
        <div className="apc-map-card__meter">
          {scenario.elementCount > 0 ? (
            <>
              <div className="apc-map-card__meterrow">
                <span>Mapped elements</span>
                <b>{percent}%</b>
              </div>
              <div className="apc-map-card__bar">
                <i style={{ width: `${percent}%`, background: TYPE_ACCENT[scenario.type] }} />
              </div>
              <div className="apc-map-card__counts">
                {`${scenario.mappedCount} / ${scenario.elementCount} BIM elements${
                  scenario.smmItemCount ? ` · ${scenario.smmItemCount} SMM items` : ''
                }`}
              </div>
            </>
          ) : (
            <>
              <div className="apc-map-card__meterrow">
                <span>Cost documents</span>
                <b>{countSources(scenario)}</b>
              </div>
              <div className="apc-map-card__counts">
                {countSources(scenario)
                  ? `${countSources(scenario)} ${countSources(scenario) === 1 ? 'document' : 'documents'} linked${
                      scenario.sources?.necOption ? ` · NEC Option ${scenario.sources.necOption}` : ''
                    }`
                  : 'No documents linked yet'}
              </div>
            </>
          )}
        </div>
        <div className="apc-map-card__foot">
          <span />
          <span>Updated {dateLabel(scenario.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function CreateMappingDialog({
  projectName,
  standard,
  necOption,
  mainDoc,
  projectId,
  onClose,
  onCreate
}: {
  projectName: string;
  standard: string;
  necOption?: NecOption;
  mainDoc?: 'bq' | 'activity' | null;
  projectId?: string;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    type: MappingType;
    standard: string;
    sources: MappingSources;
  }) => void;
}) {
  const type: MappingType = 'hybrid';
  const [name, setName] = useState('');
  const scenarioStandard = MAPPING_STANDARDS.includes(standard)
    ? standard
    : MAPPING_STANDARDS[0];
  const [sources, setSources] = useState<MappingSources>({});
  const [error, setError] = useState('');
  const catalog = useMemo(() => buildSourceCatalog(projectId), [projectId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const quantitySource = sources.bq ? 'bq' : sources.activity ? 'activity' : null;
  const mainDocLabel =
    mainDoc === 'activity'
      ? 'Activity Schedule'
      : mainDoc === 'bq'
        ? 'Bill of Quantities'
        : null;
  const requiredComplete =
    !!sources.bim && (mainDoc ? !!sources[mainDoc] : !!quantitySource);
  const docTypes: Array<'bim' | 'bq' | 'activity'> =
    mainDoc === 'activity'
      ? ['bim', 'activity']
      : mainDoc === 'bq'
        ? ['bim', 'bq']
        : ['bim', 'bq', 'activity'];

  const toggleDoc = (docType: MappingDocType, doc: SourceDoc) => {
    setSources(prev => {
      if (prev[docType] === doc.name) {
        const next = { ...prev };
        delete next[docType];
        if (docType === 'bim') {
          delete next.bimAssetId;
          delete next.bimModelId;
        }
        return next;
      }
      if (docType === 'bim') {
        return { ...prev, bim: doc.name, bimAssetId: doc.id, bimModelId: doc.modelId };
      }
      const next = { ...prev };
      if (docType === 'bq') delete next.activity;
      if (docType === 'activity') delete next.bq;
      next[docType] = doc.name;
      return next;
    });
    setError('');
  };

  const submit = () => {
    if (!name.trim()) {
      setError('Enter a scenario name.');
      return;
    }
    if (!sources.bim) {
      setError('Select the BIM model before creating the mapping.');
      return;
    }
    if (mainDoc && !sources[mainDoc]) {
      setError(
        `Select the ${mainDocLabel} as the main pricing document for NEC Option ${necOption}.`
      );
      return;
    }
    if (!mainDoc && !quantitySource) {
      setError('Select either a Bill of Quantities or an Activity Schedule.');
      return;
    }
    onCreate({
      name: name.trim(),
      type,
      standard: scenarioStandard,
      sources
    });
  };

  const status = error
    ? error
    : !name.trim()
      ? 'Enter a scenario name.'
      : !sources.bim
        ? 'Select a BIM model.'
        : mainDoc && !sources[mainDoc]
          ? `Select the ${mainDocLabel} (main pricing for Option ${necOption}).`
          : !mainDoc && !quantitySource
            ? 'Select a Bill of Quantities or an Activity Schedule.'
            : `BIM model + ${
                quantitySource === 'bq' ? 'Bill of Quantities' : 'Activity Schedule'
              } selected.`;

  return (
    <div className="apc-docpage__scrim">
      <section className="apc-map-dialog apc-mapcreate" role="dialog" aria-label="Create Mapping Model">
        <div className="apc-map-dialog__head">
          <div>
            <b>Create a Mapping Model</b>
          </div>
          <button className="apc-iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="apc-map-dialog__body apc-mapcreate__body">
          <div className="apc-map-form apc-map-form--top">
            <label className="apc-map-field">
              <span>Scenario name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="e.g. Level 2 SMM mapping"
              />
            </label>
          </div>

          <div className="apc-ce-ainote">
            <Icon name="badge-check" size={12} />
            <span>
              {mainDoc
                ? `NEC Option ${necOption} · ${mainDocLabel}`
                : 'BIM model + one quantity source'}
            </span>
          </div>

          {docTypes.map(docType => (
            <section className="apc-mapcreate__group" key={docType}>
              <div className="apc-ce-linklabel">
                <span>{MAPPING_DOC_LABEL[docType]}</span>
                {mainDoc === docType && <em className="apc-mapcreate__main">Main pricing</em>}
              </div>
              <div className="apc-map-doclist apc-mapcreate__list">
                {catalog[docType].map((doc, index) => {
                  const selected = sources[docType] === doc.name;
                  return (
                    <button
                      key={`${doc.project}-${doc.name}-${index}`}
                      className={`apc-map-doc${selected ? ' on' : ''}`}
                      onClick={() => toggleDoc(docType, doc)}
                    >
                      <span className={`apc-map-doc__icon is-${docType}`}>
                        <Icon name={MAPPING_DOC_ICON[docType] as IconName} size={16} />
                      </span>
                      <span className="apc-map-doc__body">
                        <b>{doc.name}</b>
                        <span>
                          {doc.project} · {doc.size} · Uploaded {doc.uploaded}
                        </span>
                      </span>
                      <i className="apc-map-doc__check">
                        {selected && <Icon name="check" size={11} stroke={3} />}
                      </i>
                    </button>
                  );
                })}
                {!catalog[docType].length && (
                  <div className="apc-map-doclist__empty">
                    No {MAPPING_DOC_LABEL[docType].toLowerCase()} uploaded yet.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        <div className="apc-map-dialog__foot">
          <span className={error ? 'is-error' : ''}>{status}</span>
          <button className="apc-map-dialog__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="apc-map-dialog__cta"
            disabled={!name.trim() || !requiredComplete}
            onClick={submit}
            title={!requiredComplete ? 'Select a BIM model and one quantity source' : undefined}
          >
            Create Mapping Model
          </button>
        </div>
      </section>
    </div>
  );
}

export function BimMapping({
  projectName,
  projectNumber,
  standard,
  showProgramme,
  onCloseProgramme,
  onToggleProgramme,
  modelView,
  necOption,
  projectId
}: {
  projectName: string;
  projectNumber: string;
  standard: string;
  showProgramme: boolean;
  onCloseProgramme: () => void;
  onToggleProgramme: () => void;
  modelView: ModelViewProps;
  necOption?: NecOption;
  projectId?: string;
}) {
  const [scenarios, setScenarios] = useState<MappingScenario[]>(() =>
    loadMappingScenarios(projectId)
  );
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [modelScenario, setModelScenario] = useState<MappingScenario | null>(null);
  const option = optionInfo(necOption);
  const mainDoc: 'bq' | 'activity' | null =
    option.main === 'activity' || option.main === 'activity-cost'
      ? 'activity'
      : option.main === 'bq'
        ? 'bq'
        : null;
  const [page, setPage] = useState<'library' | 'result' | 'cost' | 'smm'>('library');
  const [run, setRun] = useState<{ scenario: MappingScenario; result: MappingResult } | null>(null);
  const [costRun, setCostRun] = useState<MappingScenario | null>(null);
  const [smmRun, setSmmRun] = useState<{
    scenario: MappingScenario;
    elements: ElementData[];
  } | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingPct, setMappingPct] = useState(0);
  const [mappingStep, setMappingStep] = useState(0);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [pendingReady, setPendingReady] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [opening, setOpening] = useState<MappingScenario | null>(null);
  const [notice, setNotice] = useState('');
  const pending = useRef<{ scenario: MappingScenario; result: MappingResult } | null>(null);
  const probeRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    saveMappingScenarios(scenarios, projectId);
  }, [scenarios]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let alive = true;
    const probe = probeScanApi();
    probeRef.current = probe;
    probe
      .then(online => {
        if (!alive) return;
        setApiOnline(online);
        setApiReady(true);
      })
      .catch(() => {
        if (alive) setApiReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!apiOnline) return;
    let alive = true;
    listScanAssets()
      .then(list => {
        if (alive) saveScanAssets(list, projectId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [apiOnline]);

  const openResult = () => {
    if (!pending.current) return;
    setSmmRun({
      scenario: pending.current.scenario,
      elements: pending.current.result.elements.map(item => item.el)
    });
    setCompleteOpen(false);
    setPage('smm');
  };

  useEffect(() => {
    if (!mappingOpen) return;
    const stepCount = MAPPING_STEPS.length;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - started) / 3800) * 100));
      setMappingPct(pct);
      setMappingStep(Math.min(stepCount - 1, Math.floor((pct / 100) * stepCount)));
      if (pct >= 100) window.clearInterval(timer);
    }, 110);
    return () => window.clearInterval(timer);
  }, [mappingOpen]);

  useEffect(() => {
    if (!mappingOpen || mappingPct < 100 || !pendingReady) return;
    setMappingOpen(false);
    setCompleteOpen(true);
  }, [mappingOpen, mappingPct, pendingReady]);

  useEffect(() => {
    if (!completeOpen) return;
    const timer = window.setTimeout(openResult, 2200);
    return () => window.clearTimeout(timer);
  }, [completeOpen]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return scenarios;
    return scenarios.filter(scenario =>
      [
        scenario.name,
        scenario.projectName,
        scenario.projectNumber,
        scenario.modelName,
        scenario.standard,
        MAPPING_TYPE_LABEL[scenario.type]
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [scenarios, query]);

  const findModelId = (sources: MappingSources): string | undefined => {
    if (sources.bimModelId) return sources.bimModelId;
    if (!sources.bim) return undefined;
    const asset = loadScanAssets(projectId).find(
      item => item.type === 'bim' && item.name === sources.bim
    ) as ScanAsset | undefined;
    return asset?.modelId;
  };

  const loadModelElements = async (modelId: string): Promise<ElementData[]> => {
    try {
      const model = await getIfcModel(modelId);
      const meshes = await loadModelMeshes(modelId);
      return meshes.size
        ? model.elements.map(element => ({
            ...element,
            mesh: meshes.get(element.id) ?? element.mesh
          }))
        : model.elements;
    } catch {
      return demoData.elements;
    }
  };

  const resolveElements = async (sources: MappingSources): Promise<ElementData[]> => {
    const modelId = findModelId(sources);
    return modelId ? loadModelElements(modelId) : demoData.elements;
  };

  const createScenario = (input: {
    name: string;
    type: MappingType;
    standard: string;
    sources: MappingSources;
  }) => {
    const now = Date.now();
    if (input.type === 'cost') {
      const costScenario: MappingScenario = {
        id: newMappingScenarioId(),
        name: input.name,
        type: 'cost',
        projectName,
        projectNumber,
        modelName: input.sources.necOption
          ? `NEC Option ${input.sources.necOption} — cost documents`
          : 'NEC cost documents',
        standard: input.standard,
        elementCount: 0,
        smmItemCount: 0,
        mappedCount: 0,
        status: 'draft',
        sources: input.sources,
        createdAt: now,
        updatedAt: now
      };
      setScenarios(prev => [costScenario, ...prev]);
      setCreateOpen(false);
      setView('grid');
      const documentCount = countSources(costScenario);
      setNotice(
        `${costScenario.name} created with ${documentCount} ${
          documentCount === 1 ? 'document' : 'documents'
        }.`
      );
      return;
    }
    const hasProgramme = !!input.sources.programme;
    const next: MappingScenario = {
      id: newMappingScenarioId(),
      name: input.name,
      type: input.type,
      projectName,
      projectNumber,
      modelName: input.sources.bim || `${projectName} cleanse BIM`,
      standard: input.standard,
      elementCount: 0,
      smmItemCount: 0,
      mappedCount: 0,
      status: 'in-progress',
      sources: input.sources,
      createdAt: now,
      updatedAt: now
    };
    const initial = buildMappingResult(next, demoData.elements, hasProgramme);
    next.elementCount = initial.elements.length;
    next.mappedCount = initial.counts.red + initial.counts.amber + initial.counts.green;

    setScenarios(prev => [next, ...prev]);
    setCreateOpen(false);
    setView('grid');
    pending.current = { scenario: next, result: initial };
    setPendingReady(false);
    setMappingPct(0);
    setMappingStep(0);
    setMappingOpen(true);

    void resolveElements(input.sources)
      .then(elements => {
        const result = buildMappingResult(next, elements, hasProgramme);
        const updated: MappingScenario = {
          ...next,
          elementCount: result.elements.length,
          mappedCount: result.counts.red + result.counts.amber + result.counts.green,
          updatedAt: Date.now()
        };
        pending.current = { scenario: updated, result };
        setScenarios(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      })
      .finally(() => setPendingReady(true));
  };

  const removeScenario = (id: string) => {
    setScenarios(prev => prev.filter(scenario => scenario.id !== id));
  };

  const openScenario = (scenario: MappingScenario) => {
    if (scenario.type === 'cost') {
      setCostRun(scenario);
      setPage('cost');
      return;
    }
    if (!scenario.elementCount) return;
    const hasProgramme = !!scenario.sources?.programme;
    setOpening(scenario);
    void (async () => {
      const online = apiReady ? apiOnline : await (probeRef.current ?? Promise.resolve(false));
      const sources = scenario.sources ?? {};
      let modelId = findModelId(sources);
      if (!modelId && online) {
        try {
          const list = await listScanAssets();
          saveScanAssets(list, projectId);
          modelId = list.find(
            asset => asset.type === 'bim' && asset.name === sources.bim
          )?.modelId;
        } catch {
          modelId = undefined;
        }
      }
      const elements =
        online && modelId ? await loadModelElements(modelId) : demoData.elements;
      if (scenario.type === 'hybrid') {
        setSmmRun({ scenario, elements });
        setPage('smm');
        return;
      }
      setRun({ scenario, result: buildMappingResult(scenario, elements, hasProgramme) });
      setPage('result');
    })().finally(() => setOpening(null));
  };

  if (modelScenario) {
    return (
      <ModelReview
        {...modelView}
        projectId={projectId}
        scenario={modelScenario}
        onBack={() => setModelScenario(null)}
      />
    );
  }

  if (page === 'smm' && smmRun) {
    return (
      <MappingSmmPage
        scenario={smmRun.scenario}
        elements={smmRun.elements}
        onBack={() => {
          setPage('library');
          setSmmRun(null);
        }}
      />
    );
  }

  if (page === 'result' && run) {
    return (
      <MappingResultPage
        run={run}
        onBack={() => setPage('library')}
        showProgramme={showProgramme}
        onCloseProgramme={onCloseProgramme}
        onToggleProgramme={onToggleProgramme}
      />
    );
  }

  if (page === 'cost' && costRun) {
    return (
      <CostResultPage
        key={costRun.id}
        scenario={costRun}
        projectId={projectId}
        onBack={() => {
          setPage('library');
          setCostRun(null);
        }}
      />
    );
  }

  return (
    <main className="apc-docpage apc-scan">
      <header className="apc-docpage__head">
        <div className="apc-docpage__title">
          <h1>Mapping Model</h1>
          <span>Mapping models</span>
        </div>
        {necOption && (
          <span className="apc-map-home__nec" title={option.contract}>
            {option.name} · {option.mainLabel}
          </span>
        )}
        <button className="apc-docpage__new" onClick={() => setCreateOpen(true)}>
          <span aria-hidden>+</span>
          Create a Mapping Model
        </button>
      </header>

      <div className="apc-scan__body">
        <div className="apc-scan__inner">
          <div className="apc-scan__summary">
            <div>
              <b>Mapping models</b>
              <span>
                {filtered.length} {filtered.length === 1 ? 'model' : 'models'}
              </span>
            </div>
            <div className="apc-scan__tools">
              <label className="apc-recordsearch apc-scan__search">
                <Icon name="search" size={14} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search mapping models..."
                />
                {query && (
                  <button className="apc-scan__searchclear" onClick={() => setQuery('')} aria-label="Clear search">
                    <Icon name="x" size={11} />
                  </button>
                )}
              </label>
              <div className="apc-scan__viewtoggle" role="group" aria-label="View style">
                <button
                  className={view === 'grid' ? 'on' : ''}
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <Icon name="layout-grid" size={14} />
                </button>
                <button
                  className={view === 'list' ? 'on' : ''}
                  onClick={() => setView('list')}
                  aria-label="List view"
                  title="List view"
                >
                  <Icon name="rows-2" size={14} />
                </button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="apc-scan__empty">
              <span>
                <Icon name="list-tree" size={24} />
              </span>
              <b>{query ? 'No matching mapping models' : 'No mapping models yet'}</b>
              <p>{query ? 'No matching model.' : 'No mapping models uploaded.'}</p>
              {!query && (
                <button onClick={() => setCreateOpen(true)}>
                  <span aria-hidden>+</span>
                  Create a Mapping Model
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <div className="apc-scan__grid">
              {filtered.map(scenario => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  onOpen={() => setModelScenario(scenario)}
                  onEdit={() => openScenario(scenario)}
                  onRemove={() => removeScenario(scenario.id)}
                />
              ))}
            </div>
          ) : (
            <div className="apc-scan__listwrap">
              <table className="apc-scan-list apc-map-list">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Type</th>
                    <th>Project</th>
                    <th>BIM elements</th>
                    <th>Mapped</th>
                    <th>Progress</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(scenario => {
                    const percent = percentOf(scenario);
                    return (
                      <tr
                        key={scenario.id}
                        onClick={() => setModelScenario(scenario)}
                        className="is-openable"
                      >
                        <td>
                          <div className="apc-map-rowname">
                            <span className={`apc-map-rowicon is-${scenario.type}`}>
                              <Icon name={TYPE_ICON[scenario.type]} size={14} />
                            </span>
                            <div>
                              <b title={scenario.name}>{scenario.name}</b>
                              <span title={scenario.modelName}>{scenario.modelName}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`apc-map__type apc-map__type--${scenario.type}`}>
                            {MAPPING_TYPE_LABEL[scenario.type]}
                          </span>
                        </td>
                        <td title={scenario.projectName}>
                          {scenario.projectName}
                          <div className="apc-map-rowsub">{scenario.projectNumber}</div>
                        </td>
                        <td className="num">{scenario.elementCount || '—'}</td>
                        <td className="num">{scenario.elementCount ? scenario.mappedCount : '—'}</td>
                        <td>
                          {scenario.elementCount ? (
                            <div className="apc-map-progress">
                              <span className="bar">
                                <i
                                  style={{ width: `${percent}%`, background: TYPE_ACCENT[scenario.type] }}
                                />
                              </span>
                              <b>{percent}%</b>
                            </div>
                          ) : (
                            <span className="apc-map-rowsub">—</span>
                          )}
                        </td>
                        <td className="apc-scan__listdate">{dateLabel(scenario.updatedAt)}</td>
                        <td>
                          <button
                            className="apc-map-rowedit"
                            onClick={event => {
                              event.stopPropagation();
                              openScenario(scenario);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="apc-map-rowdel"
                            onClick={event => {
                              event.stopPropagation();
                              removeScenario(scenario.id);
                            }}
                            aria-label={`Delete ${scenario.name}`}
                          >
                            <Icon name="trash-2" size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {opening && (
        <div className="apc-docpage__scrim">
          <section className="apc-map-open" role="status" aria-label="Loading mapping result">
            <span className="apc-map-open__ring" />
            <b>Loading mapping result</b>
            <span>{opening.name}</span>
            <small>{opening.sources?.bim ?? 'IFC model'} · reading parsed elements</small>
          </section>
        </div>
      )}

      {createOpen && (
        <CreateMappingDialog
          projectName={projectName}
          standard={standard}
          necOption={necOption}
          mainDoc={mainDoc}
          projectId={projectId}
          onClose={() => setCreateOpen(false)}
          onCreate={createScenario}
        />
      )}

      {mappingOpen && (
        <MappingProcessing
          pct={mappingPct}
          step={mappingStep}
          name={pending.current?.scenario.name ?? ''}
          hasProgramme={!!pending.current?.scenario.sources?.programme}
        />
      )}

      {completeOpen && pending.current && (
        <MappingComplete result={pending.current.result} onView={openResult} />
      )}

      {notice && <div className="apc-scan__toast">{notice}</div>}
    </main>
  );
}
