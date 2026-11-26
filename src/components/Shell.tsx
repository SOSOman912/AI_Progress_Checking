import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Icon, type IconName } from './Icon';
import { Hint } from './Hint';

export type ToolId = 'library' | 'mapping' | 'data' | 'bill' | 'review';
export type DocTool = 'pricing' | 'invoice';
export type ModalId = 'files' | 'views' | 'settings' | null;

const TOOLS: Array<{ id: ToolId; icon: IconName; hint: string }> = [
  { id: 'bill', icon: 'file-spreadsheet', hint: '01 Document Management' },
  { id: 'library', icon: 'pencil-ruler', hint: '02 Measurement Library' },
  { id: 'data', icon: 'clipboard-check', hint: '03 AI Scanning' },
  { id: 'mapping', icon: 'list-tree', hint: '04 Mapping Model' },
  { id: 'review', icon: 'badge-check', hint: '05 eCheck Payment' }
];

type MenuNode =
  | { sep: true }
  | {
      label: string;
      children?: MenuNode[];
      onSelect?: () => void;
      disabled?: boolean;
      kbd?: string;
      lead?: boolean;
      checked?: boolean;
      keepOpen?: boolean;
    };

function LogoMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2.2" fill="#fff" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" fill="#fff" opacity="0.55" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" fill="#fff" opacity="0.55" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" fill="#fff" />
    </svg>
  );
}

function MenuList({ items, onClose }: { items: MenuNode[]; onClose: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<{ index: number; top: number } | null>(null);

  const openSub = (e: ReactMouseEvent<HTMLButtonElement>, node: MenuNode, index: number) => {
    if ('sep' in node || !node.children || node.disabled) {
      setSub(null);
      return;
    }
    const row = e.currentTarget.getBoundingClientRect();
    const parent = list.current?.getBoundingClientRect();
    setSub({ index, top: row.top - (parent?.top ?? 0) - 6 });
  };

  const subNode = sub ? items[sub.index] : undefined;
  const subItems = subNode && !('sep' in subNode) ? subNode.children : undefined;

  return (
    <div className="apc-menu__list" ref={list} role="menu">
      {items.map((node, i) => {
        if ('sep' in node) return <div key={'sep-' + i} className="apc-menu__sep" />;
        return (
          <button
            key={node.label}
            className={`apc-menu__row${node.lead ? ' apc-menu__row--lead' : ''}`}
            disabled={node.disabled}
            role="menuitem"
            aria-haspopup={node.children ? 'menu' : undefined}
            onMouseEnter={e => openSub(e, node, i)}
            onClick={e => {
              if (node.children) {
                openSub(e, node, i);
                return;
              }
              node.onSelect?.();
              if (!node.keepOpen) onClose();
            }}
          >
            <span className="apc-menu__txt">{node.label}</span>
            <span className="apc-menu__tail">
              {node.kbd && <span className="apc-menu__kbd">{node.kbd}</span>}
              {node.checked && <Icon name="check" size={12} />}
              {node.children && <Icon name="chevron-right" size={13} />}
            </span>
          </button>
        );
      })}
      {sub && subItems && (
        <div className="apc-submenu" style={{ top: sub.top }} onMouseLeave={() => setSub(null)}>
          <MenuList items={subItems} onClose={onClose} />
        </div>
      )}
    </div>
  );
}

export function ToolRail({
  tool,
  sections,
  onTool,
  onModal,
  onToggleSection,
  onToggleWindow,
  windows,
  onExport,
  docTool,
  onDocTool,
  onHome
}: {
  tool: ToolId;
  docTool: DocTool;
  onDocTool: (tool: DocTool) => void;
  onHome: () => void;
  sections: Record<'browser' | 'tools' | 'bqlist' | 'pano', boolean>;
  windows: Record<'badge' | 'props' | 'bqDetails' | 'drawing' | 'programme', boolean>;
  onTool: (tool: ToolId) => void;
  onModal: (modal: ModalId) => void;
  onToggleSection: (key: 'browser' | 'tools' | 'bqlist' | 'pano') => void;
  onToggleWindow: (key: 'badge' | 'props' | 'bqDetails' | 'drawing' | 'programme') => void;
  onExport: () => void;
}) {
  const [logoOpen, setLogoOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [billTop, setBillTop] = useState(60);
  const [docNavOpen, setDocNavOpen] = useState(false);
  const billBtn = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const docNavTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (tool !== 'bill') {
      setDocNavOpen(false);
      return;
    }
    const stage = stageRef.current;
    const button = billBtn.current;
    if (stage && button) {
      setBillTop(button.getBoundingClientRect().top - stage.getBoundingClientRect().top);
    }
  }, [tool]);

  const openDocNav = () => {
    window.clearTimeout(docNavTimer.current);
    setDocNavOpen(true);
  };
  const closeDocNav = () => {
    window.clearTimeout(docNavTimer.current);
    docNavTimer.current = window.setTimeout(() => setDocNavOpen(false), 120);
  };

  const openUser = () => {
    window.clearTimeout(closeTimer.current);
    setUserOpen(true);
  };
  const closeUser = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setUserOpen(false), 160);
  };
  const closeLogo = () => setLogoOpen(false);
  const modal = (id: Exclude<ModalId, null>) => {
    setLogoOpen(false);
    onModal(id);
  };

  const menu: MenuNode[] = [
    { label: 'Project Browser', lead: true, onSelect: () => { setLogoOpen(false); onHome(); } },
    { label: 'Actions…', kbd: 'Ctrl+K', disabled: true },
    { sep: true },
    {
      label: 'File',
      children: [
        { label: 'Import IFC…', onSelect: () => modal('files') },
        { label: 'Export bill', onSelect: onExport }
      ]
    },
    { label: 'Edit', disabled: true, children: [] },
    {
      label: 'View',
      children: [
        { label: 'Views…', onSelect: () => modal('views') },
        { sep: true },
        {
          label: 'Properties',
          checked: windows.props,
          keepOpen: true,
          onSelect: () => onToggleWindow('props')
        },
        {
          label: 'BQ Details',
          checked: windows.bqDetails,
          keepOpen: true,
          onSelect: () => onToggleWindow('bqDetails')
        },
        {
          label: 'BQ line badge',
          checked: windows.badge,
          keepOpen: true,
          onSelect: () => onToggleWindow('badge')
        },
        {
          label: 'Drawing viewer',
          checked: windows.drawing,
          keepOpen: true,
          onSelect: () => onToggleWindow('drawing')
        },
        {
          label: 'Master programme',
          checked: windows.programme,
          keepOpen: true,
          disabled: tool !== 'data',
          onSelect: () => onToggleWindow('programme')
        },
        { sep: true },
        {
          label: 'Project Browser',
          checked: sections.browser,
          keepOpen: true,
          onSelect: () => onToggleSection('browser')
        },
        {
          label: 'Glass toolbars',
          checked: sections.tools,
          keepOpen: true,
          onSelect: () => onToggleSection('tools')
        },
        {
          label: 'BQ list strip',
          checked: sections.bqlist,
          keepOpen: true,
          onSelect: () => onToggleSection('bqlist')
        },
        {
          label: '360 views',
          checked: sections.pano,
          keepOpen: true,
          onSelect: () => onToggleSection('pano')
        }
      ]
    },
    { label: 'Object', disabled: true, children: [] },
    { label: 'Text', disabled: true, children: [] },
    { label: 'Arrange', disabled: true, children: [] },
    { sep: true },
    { label: 'Plugins', disabled: true, children: [] },
    { label: 'Widgets', disabled: true, children: [] },
    { label: 'Preferences', disabled: true, children: [] },
    { label: 'Libraries', disabled: true, children: [] },
    { sep: true },
    { label: 'Open in desktop app', disabled: true },
    { label: 'AI balance', disabled: true, children: [] },
    { label: 'Help and account', onSelect: () => modal('settings') }
  ];

  return (
    <div
      className={`apc-navstage${tool === 'bill' && docNavOpen ? ' is-docopen' : ''}`}
      ref={stageRef}
    >
      <aside className="apc-nav" aria-label="Tools">
      <button
        className={`apc-logo${logoOpen ? ' on' : ''}`}
        onClick={() => {
          setLogoOpen(v => !v);
          setUserOpen(false);
        }}
        aria-label="Product menu"
      >
        <LogoMark />
      </button>
      <div className="apc-nav__sep" />
      {TOOLS.map(t => (
        <Hint key={t.id} label={t.hint} side="right">
          <button
            className={`apc-toolbtn${tool === t.id ? ' on' : ''}`}
            onClick={() => onTool(t.id)}
            onMouseEnter={t.id === 'bill' ? openDocNav : undefined}
            onMouseLeave={t.id === 'bill' ? closeDocNav : undefined}
            aria-label={t.id}
            ref={t.id === 'bill' ? billBtn : undefined}
          >
            <Icon name={t.icon} size={19} />
          </button>
        </Hint>
      ))}
      <div className="apc-nav__spacer" />
      <div className="apc-userwrap" onMouseEnter={openUser} onMouseLeave={closeUser}>
        <button
          className="apc-userbtn"
          aria-label="Account"
          onClick={() => {
            setLogoOpen(false);
            setUserOpen(v => !v);
          }}
        >
          <span className="av">DL</span>
        </button>
        {userOpen && (
          <div className="apc-userpop" onMouseEnter={openUser} onMouseLeave={closeUser}>
            <div className="apc-userpop__head">
              <div className="av">DL</div>
              <div style={{ minWidth: 0 }}>
                <div className="nm">Dicky Lam</div>
                <div className="mail">lamchunkit1999@gmail.com</div>
              </div>
            </div>
            <button className="apc-userpop__wide">
              Manage plan <Icon name="chevron-right" size={15} />
            </button>
            <div className="apc-userpop__credits">
              Credits <span className="bar" />
            </div>
            <div className="apc-userpop__line" />
            <button className="apc-userpop__row" disabled>
              <Icon name="building-2" size={17} /> Enterprise
            </button>
            <button className="apc-userpop__row" disabled>
              <Icon name="download" size={17} /> Downloads
            </button>
            <button className="apc-userpop__row" disabled>
              <Icon name="star" size={17} /> Favorites
            </button>
            <button
              className="apc-userpop__row"
              onClick={() => {
                setUserOpen(false);
                onModal('settings');
              }}
            >
              <Icon name="settings" size={17} /> Project settings
            </button>
            <button className="apc-userpop__row" disabled>
              <Icon name="help-circle" size={17} /> Help
            </button>
            <button className="apc-userpop__row" disabled>
              <Icon name="log-out" size={17} /> Sign out
            </button>
          </div>
        )}
      </div>

      {logoOpen && (
        <>
          <div className="apc-scrim" onClick={() => setLogoOpen(false)} />
          <div className="apc-logomenu">
            <MenuList items={menu} onClose={closeLogo} />
          </div>
        </>
      )}
      </aside>

      {tool === 'bill' && docNavOpen && (
        <nav
          className="apc-subnav"
          style={{ top: billTop - 4 }}
          onMouseEnter={openDocNav}
          onMouseLeave={closeDocNav}
          aria-label="Document Management submodules"
        >
          <Hint label="Pricing document" side="right">
            <button
              className={`apc-toolbtn${docTool === 'pricing' ? ' on' : ''}`}
              onClick={() => onDocTool('pricing')}
              aria-label="Pricing document"
            >
              <Icon name="pricing-document" size={19} />
            </button>
          </Hint>
          <Hint label="Invoice / DN" side="right">
            <button
              className={`apc-toolbtn${docTool === 'invoice' ? ' on' : ''}`}
              onClick={() => onDocTool('invoice')}
              aria-label="Invoice / DN"
            >
              <Icon name="invoice-dn" size={19} />
            </button>
          </Hint>
        </nav>
      )}


    </div>
  );
}

