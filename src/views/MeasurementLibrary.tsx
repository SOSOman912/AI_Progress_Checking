import { useState } from 'react';
import { Icon } from '../components/Icon';
import {
  loadLibraryRows as loadLibraryRowsFromStore,
  saveLibraryRows
} from '../data/measurement';
import {
  SMM_ITEMS,
  SMM_SECTIONS,
  calculationRule,
  rowSlot,
  targetLabel,
  type MeasureMapRow,
  type SmmItem,
  type SmmStandard
} from '../lib/measurementLibrary';

interface PairResult {
  slot: number;
  piece: string;
  value: string;
  target: string;
  status: 'match' | 'error' | 'empty';
}

function pairRows(item: SmmItem, rows: MeasureMapRow[], values: Record<string, string>): PairResult[] {
  return rows.map((row, index) => {
    const slot = rowSlot(rows, index);
    const raw = values[row.attribute] || '';
    const pieces = row.separator ? raw.split(row.separator) : [raw];
    const piece = slot === 1 ? raw : pieces[slot - 1] || '';
    if (!piece) return { slot, piece: '', value: '', target: targetLabel(item, row.target), status: 'empty' };
    try {
      const found = new RegExp(row.regex || '(.+)').exec(piece);
      return {
        slot,
        piece,
        value: found?.[1] || '',
        target: targetLabel(item, row.target),
        status: found?.[1] ? 'match' : 'empty'
      };
    } catch {
      return { slot, piece, value: 'Invalid regex', target: targetLabel(item, row.target), status: 'error' };
    }
  });
}

function MappingRows({
  item,
  rows,
  setRows
}: {
  item: SmmItem;
  rows: MeasureMapRow[];
  setRows: (rows: MeasureMapRow[]) => void;
}) {
  const [sample, setSample] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({ Material: 'INSITU_C35/20_OPC' });
  const [paired, setPaired] = useState<PairResult[] | null>(null);

  const patch = (index: number, key: keyof MeasureMapRow, value: string) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
    setPaired(null);
  };

  const addRow = () => {
    const target = item.groups[0]?.id || 'item';
    setRows([
      ...rows,
      {
        id: 'map-' + Date.now(),
        target,
        attribute: rows[rows.length - 1]?.attribute || 'Material',
        separator: '_',
        regex: '(.+)',
        displayName: targetLabel(item, target)
      }
    ]);
    setPaired(null);
  };

  const attributes = [...new Set(rows.map(r => r.attribute).filter(Boolean))];

  return (
    <>
      <div className="apc-libsectionhead">
        <b>Mapping rules</b>
        <span style={{ flex: 1 }} />
        <button className="apc-btn apc-btn--sm" onClick={() => setSample(v => !v)}>
          {sample ? 'Hide sample' : 'Try a sample'}
        </button>
        <button className="apc-btn apc-btn--primary apc-btn--sm" onClick={addRow}>
          Add mapping row
        </button>
      </div>

      {rows.length ? (
        <div className="apc-libtablescroll">
          <table className="apc-grid apc-libmap">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Maps to</th>
                <th>Display name</th>
                <th>IFC attribute</th>
                <th>Separator</th>
                <th>Regex</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const slot = rowSlot(rows, index);
                return (
                  <tr key={row.id}>
                    <td className="apc-libmap__slot">
                      {row.attribute || 'Attribute'} <span>{slot}</span>
                    </td>
                    <td>
                      <select
                        className="apc-libinput"
                        value={row.target}
                        onChange={e => patch(index, 'target', e.target.value)}
                        aria-label={`Maps to for row ${index + 1}`}
                      >
                        <option value="item">{item.name}</option>
                        {item.groups.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="apc-libinput"
                        value={row.displayName}
                        onChange={e => patch(index, 'displayName', e.target.value)}
                        placeholder={targetLabel(item, row.target)}
                        aria-label={`Display name for row ${index + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        className="apc-libinput mono"
                        value={row.attribute}
                        onChange={e => patch(index, 'attribute', e.target.value)}
                        aria-label={`IFC attribute for row ${index + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        className="apc-libinput mono"
                        value={row.separator}
                        disabled={slot === 1}
                        onChange={e => patch(index, 'separator', e.target.value)}
                        title={slot === 1 ? 'The first slot of this attribute has no separator.' : 'Separator'}
                        aria-label={`Separator for row ${index + 1}`}
                      />
                    </td>
                    <td>
                      <input
                        className="apc-libinput mono"
                        value={row.regex}
                        onChange={e => patch(index, 'regex', e.target.value)}
                        placeholder="(.+)"
                        aria-label={`Regex for row ${index + 1}`}
                      />
                    </td>
                    <td className="apc-libmap__del">
                      <button
                        className="apc-iconbtn"
                        onClick={() => {
                          setRows(rows.filter((_, i) => i !== index));
                          setPaired(null);
                        }}
                        aria-label={`Delete mapping row ${index + 1}`}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="apc-libempty">No mapping rows yet. Add one row for each IFC attribute piece.</div>
      )}

      {sample && (
        <section className="apc-libsample">
          <div className="apc-libsample__head">
            <b>Sample values</b>
          </div>
          <div className="apc-libsample__fields">
            {attributes.map(attribute => (
              <label key={attribute}>
                <span>{attribute}</span>
                <input
                  className="apc-input mono"
                  value={values[attribute] || ''}
                  onChange={e => {
                    setValues(v => ({ ...v, [attribute]: e.target.value }));
                    setPaired(null);
                  }}
                />
              </label>
            ))}
            <button className="apc-btn apc-btn--primary apc-btn--sm" onClick={() => setPaired(pairRows(item, rows, values))}>
              Pair values
            </button>
          </div>
          {paired && (
            <div className="apc-libtablescroll">
              <table className="apc-grid">
                <thead>
                  <tr>
                    <th>Attribute slot</th>
                    <th>Piece</th>
                    <th>Paired value</th>
                    <th>Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {paired.map((pair, i) => (
                    <tr key={i}>
                      <td>
                        {rows[i]?.attribute || '—'} <span className="mono">{pair.slot}</span>
                      </td>
                      <td className="mono">{pair.piece || '—'}</td>
                      <td className={pair.status === 'error' ? 'apc-libbad' : 'mono'}>
                        {pair.value || '—'}
                      </td>
                      <td>{pair.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const loadLibraryRows = loadLibraryRowsFromStore;

export function MeasurementLibrary({ projectId }: { projectId?: string }) {
  const [standard, setStandard] = useState<SmmStandard>('cesmm');
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 12: true });
  const [selected, setSelected] = useState('s12-insitu');
  const [rows, setRows] = useState<Record<string, MeasureMapRow[]>>(() =>
    loadLibraryRows(projectId)
  );
  const [saved, setSaved] = useState(false);

  const saveSettings = () => {
    setSaved(saveLibraryRows(rows, projectId));
    window.setTimeout(() => setSaved(false), 1800);
  };

  const q = query.trim().toLowerCase();
  const matches = (item: SmmItem) =>
    !q ||
    item.name.toLowerCase().includes(q) ||
    item.groups.some(g => g.name.toLowerCase().includes(q) || g.feature.toLowerCase().includes(q));
  const sectionItems = (sectionNo: number) => SMM_ITEMS.filter(i => i.sectionNo === sectionNo);
  const visibleSections = SMM_SECTIONS.filter(([no, name]) => {
    if (!q) return true;
    if (name.toLowerCase().includes(q)) return true;
    return sectionItems(no).some(matches);
  });
  const item = SMM_ITEMS.find(i => i.id === selected);
  const rule = item ? calculationRule(item) : null;

  if (standard === 'hksmm') {
    return (
      <main className="apc-page apc-librarypage">
        <div className="apc-libhead">
          <div>
            <h1>Measurement Library</h1>
          </div>
          <label className="apc-libstd">
            SMM type
            <select className="apc-input" value={standard} onChange={e => setStandard(e.target.value as SmmStandard)}>
              <option value="cesmm">CESMM</option>
              <option value="hksmm">HKSMM</option>
            </select>
          </label>
          <button className="apc-libsave" onClick={saveSettings}>
            <Icon name={saved ? 'check' : 'save'} size={13} />
            {saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
        <div className="apc-libempty apc-libempty--page">No HKSMM section has been analysed yet.</div>
      </main>
    );
  }

  return (
    <main className="apc-page apc-librarypage">
      <div className="apc-libhead">
        <div>
          <h1>Measurement Library</h1>
        </div>
        <label className="apc-libstd">
          SMM type
          <select className="apc-input" value={standard} onChange={e => setStandard(e.target.value as SmmStandard)}>
            <option value="cesmm">CESMM</option>
            <option value="hksmm">HKSMM</option>
          </select>
        </label>
        <input
          className="apc-input apc-libsearch"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search sections, items or groups"
          aria-label="Search measurement library"
        />
        <button className="apc-libsave" onClick={saveSettings}>
          <Icon name={saved ? 'check' : 'save'} size={13} />
          {saved ? 'Saved' : 'Save changes'}
        </button>
      </div>

      <div className="apc-libbody">
        <aside className="apc-libnav">
          <div className="apc-libnav__head">
            <b>CESMM sections</b>
            <span>{SMM_SECTIONS.length}</span>
          </div>
          <div className="apc-libnav__scroll">
            {visibleSections.map(([no, name]) => {
              const items = sectionItems(no).filter(matches);
              const open = !!q || !!openSections[no];
              return (
                <div key={no} className="apc-libsecwrap">
                  <button
                    className="apc-libsec"
                    onClick={() => setOpenSections(s => ({ ...s, [no]: !openSections[no] }))}
                    aria-expanded={open}
                  >
                    <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
                    <span className="apc-libsec__no">Section {no}</span>
                    <span className="apc-libsec__name">{name}</span>
                    <span className="apc-libsec__count">{items.length}</span>
                  </button>
                  {open && (
                    <div className="apc-libitems">
                      {items.length ? (
                        items.map(i => (
                          <button
                            key={i.id}
                            className={`apc-libitem${selected === i.id ? ' on' : ''}`}
                            onClick={() => setSelected(i.id)}
                          >
                            {i.name}
                          </button>
                        ))
                      ) : (
                        <div className="apc-libempty apc-libempty--nav">No BQ items analysed</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!visibleSections.length && <div className="apc-libempty apc-libempty--nav">No sections match.</div>}
          </div>
        </aside>

        <section className="apc-libdetail">
          {item ? (
            <>
              <div className="apc-libdetail__head">
                <h2>{item.name}</h2>
              </div>

              <div className="apc-libsectionhead">
                <b>Measurement groups</b>
              </div>
              {item.groups.length ? (
                <div className="apc-libtablescroll">
                  <table className="apc-grid apc-libgroups">
                    <thead>
                      <tr>
                        <th>Group</th>
                        <th>Feature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.groups.map((group, index) => (
                        <tr key={group.id}>
                          <td>
                            <b>
                              Group {index + 1}. {group.name}
                            </b>
                          </td>
                          <td>{group.feature}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="apc-libempty">No measurement groups analysed for this item.</div>
              )}

              <MappingRows
                key={item.id}
                item={item}
                rows={rows[item.id] || []}
                setRows={next => setRows(all => ({ ...all, [item.id]: next }))}
              />

              <div className="apc-libsectionhead">
                <b>Calculation rule</b>
              </div>
              <div className="apc-libtablescroll">
                <table className="apc-grid apc-librule">
                  <tbody>
                    <tr>
                      <th>Measurement unit</th>
                      <td>
                        {item.unit} · {item.basis}
                      </td>
                    </tr>
                    <tr>
                      <th>Formula</th>
                      <td className="mono">{rule!.formula}</td>
                    </tr>
                    <tr>
                      <th>Measurement rules</th>
                      <td>
                        <div className="apc-librule__rules">
                          {rule!.measurementRules.map((line, index) =>
                            line.marker ? (
                              <div
                                key={index}
                                className={`apc-librule__line${
                                  line.marker.length > 3 ? ' apc-librule__line--wide' : ''
                                }`}
                              >
                                <span className="apc-librule__marker">{line.marker}</span>
                                <span>{line.text}</span>
                              </div>
                            ) : (
                              <p key={index} className="apc-librule__para">
                                {line.text}
                              </p>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="apc-libempty apc-libempty--page">
              Select a BQ item in the library to view its measurement groups and mapping rules.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
