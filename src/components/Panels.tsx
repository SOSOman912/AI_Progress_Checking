import { useEffect, type ChangeEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Toggle } from './primitives';
import { BqTable } from './BqPanels';
import type { BillLine, ProjectData, ProjectInfo } from '../lib/demo';

export function Modal({
  title,
  onClose,
  children,
  width = 720
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="apc-modal-scrim"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="apc-modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="apc-modal__head">
          <b>{title}</b>
          <span style={{ flex: 1 }} />
          <button className="apc-iconbtn" onClick={onClose} aria-label={'Close ' + title}>
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="apc-modal__body">{children}</div>
      </section>
    </div>
  );
}

export const SECTION_KEYS = ['browser', 'tools', 'bqlist', 'pano'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type Sections = Record<SectionKey, boolean>;

const SECTION_META: Array<{ key: SectionKey; label: string }> = [
  { key: 'browser', label: 'Project Browser' },
  { key: 'tools', label: 'Glass toolbars' },
  { key: 'bqlist', label: 'BQ list strip' },
  { key: 'pano', label: '360 views' }
];

export function ViewsPanel({
  sections,
  onToggle,
  onShowBadge,
  onShowProps,
  onClose
}: {
  sections: Sections;
  onToggle: (key: SectionKey) => void;
  onShowBadge: () => void;
  onShowProps: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Views" onClose={onClose} width={520}>
      {SECTION_META.map(s => (
        <div key={s.key} className="apc-vrow">
          <span className="t-sm" style={{ flex: 1, fontWeight: 500 }}>
            {s.label}
          </span>
          <Toggle on={sections[s.key]} onChange={() => onToggle(s.key)} />
        </div>
      ))}
      <div className="apc-modal__sep" />
      <button className="apc-popaction" onClick={onShowBadge}>
        <span className="t-sm" style={{ fontWeight: 500 }}>
          BQ line badge
        </span>
        <Icon name="chevron-right" size={14} style={{ color: 'var(--fg3)' }} />
      </button>
      <button className="apc-popaction" onClick={onShowProps}>
        <span className="t-sm" style={{ fontWeight: 500 }}>
          Properties
        </span>
        <Icon name="chevron-right" size={14} style={{ color: 'var(--fg3)' }} />
      </button>
    </Modal>
  );
}

export function FilesPanel({
  data,
  onClose,
  onImport,
  onExport
}: {
  data: ProjectData;
  onClose: () => void;
  onImport: (name: string) => void;
  onExport: () => void;
}) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onImport(f.name);
    e.target.value = '';
  };
  return (
    <Modal title="Files" onClose={onClose} width={620}>
      <div className="apc-fileacts">
        <label className="apc-btn apc-btn--primary apc-btn--sm" style={{ cursor: 'pointer' }}>
          <Icon name="folder" size={14} /> Import IFC
          <input type="file" accept=".ifc" hidden onChange={pick} />
        </label>
        <button className="apc-btn apc-btn--sm" onClick={onExport}>
          <Icon name="download" size={14} /> Export bill
        </button>
      </div>
      <div className="apc-filelist">
        {data.files.map(f => (
          <div key={f.id} className="apc-filerow">
            <Icon name="folder-closed" size={16} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="t-sm"
                style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {f.name}
              </div>
              <div className="t-xs t-faint">
                {f.count} elements · {f.drawings.length} drawings
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="apc-srow2">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

export function SettingsPanel({ project, onClose }: { project: ProjectInfo; onClose: () => void }) {
  return (
    <Modal title="Project settings" onClose={onClose} width={520}>
      <div className="apc-srows">
        <InfoRow label="Project" value={project.name} />
        <InfoRow label="Contract" value={project.contract} />
        <InfoRow label="Standard" value={project.standard} />
        <InfoRow label="Revision" value={project.revision} />
        <InfoRow label="Units" value="m · m² · m³ · nr" />
        <InfoRow label="Currency" value="HKD" />
      </div>
    </Modal>
  );
}

export function BillPage({
  lines,
  activeLine,
  setActiveLine,
  onQtyChange,
  onRateChange,
  showMoney
}: {
  lines: BillLine[];
  activeLine: string;
  setActiveLine: (id: string) => void;
  onQtyChange: (id: string, value: number | null) => void;
  onRateChange: (id: string, value: number | null) => void;
  showMoney: boolean;
}) {
  return (
    <main className="apc-page">
      <div className="apc-billtable">
        <BqTable
          lines={lines}
          activeLine={activeLine}
          setActiveLine={setActiveLine}
          onQtyChange={onQtyChange}
          onRateChange={onRateChange}
          showMoney={showMoney}
        />
      </div>
    </main>
  );
}

export function PageStub() {
  return (
    <main className="apc-page">
      <div className="apc-pagestub" />
    </main>
  );
}
