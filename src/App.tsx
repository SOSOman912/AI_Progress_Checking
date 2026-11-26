import { useEffect, useState } from 'react';
import { ToolRail, type DocTool, type ModalId, type ToolId } from './components/Shell';
import {
  FilesPanel,
  PageStub,
  SettingsPanel,
  ViewsPanel,
  type Sections
} from './components/Panels';
import { MeasurementLibrary } from './views/MeasurementLibrary';
import { DocumentManagement } from './views/DocumentManagement';
import { AiScanning } from './views/AiScanning';
import { BimMapping } from './views/BimMapping';
import { ProjectHome, type NewProjectInput } from './views/ProjectHome';
import { demoData, type ProjectData } from './lib/demo';
import { loadPermissions, withMoneyPermission } from './lib/permissions';
import { loadProjects, saveProjects, type ProjectRecord } from './lib/projects';

type AppRoute = 'home' | ToolId;

const ACTIVE_PROJECT_KEY = 'apc.active-project.v1';
const ROUTES: ToolId[] = ['library', 'mapping', 'data', 'bill', 'review'];

function readRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === 'home') return 'home';
  if (hash === 'model') return 'mapping';
  return ROUTES.includes(hash as ToolId) ? (hash as ToolId) : 'home';
}

export default function App() {
  const [permissions] = useState(loadPermissions);
  const [data, setData] = useState<ProjectData>(() => withMoneyPermission(demoData, permissions.canViewMoney));
  const [projects, setProjects] = useState<ProjectRecord[]>(loadProjects);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(() => {
    try {
      const id = window.localStorage.getItem(ACTIVE_PROJECT_KEY);
      return id ? projects.find(project => project.id === id) ?? null : null;
    } catch {
      return null;
    }
  });
  const [route, setRoute] = useState<AppRoute>(readRoute);
  const [docTool, setDocTool] = useState<DocTool>('pricing');
  const [docHomeKey, setDocHomeKey] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState('n3');
  const [modal, setModal] = useState<ModalId>(null);
  const [sections, setSections] = useState<Sections>({
    browser: true,
    tools: true,
    bqlist: true,
    pano: false
  });
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  const [programmeView, setProgrammeView] = useState(true);
  const [drawingSheet, setDrawingSheet] = useState<string | null>(null);
  const [lastDrawing, setLastDrawing] = useState<string | null>(null);
  const [infoLine, setInfoLine] = useState<string | null>(null);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#/home');
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    try {
      if (activeProject) {
        window.localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject.id);
      } else {
        window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
      }
    } catch {
      return;
    }
  }, [activeProject]);

  const go = (next: ToolId) => {
    setModal(null);
    if (readRoute() === next) setRoute(next);
    else window.location.hash = '/' + next;
  };

  const createProject = (project: NewProjectInput) => {
    setProjects(prev => [
      {
        ...project,
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now()
      },
      ...prev
    ]);
  };

  const goHome = () => {
    setModal(null);
    setRoute('home');
    if (window.location.hash !== '#/home') window.location.hash = '/home';
  };

  const openProject = (project: ProjectRecord) => {
    setActiveProject(project);
    setData(current => ({
      ...current,
      project: {
        ...current.project,
        name: project.name,
        contract: project.number,
        standard: project.standard
      }
    }));
    setDocTool('pricing');
    setDocHomeKey(key => key + 1);
    go('bill');
  };

  const toggle = (key: keyof Sections) => setSections(s => ({ ...s, [key]: !s[key] }));

  const toggleWindow = (key: 'badge' | 'props' | 'bqDetails' | 'drawing' | 'programme') => {
    if (key === 'badge') setBadgeOpen(v => !v);
    if (key === 'props') setPropsOpen(v => !v);
    if (key === 'bqDetails') {
      if (infoLine) setInfoLine(null);
      else {
        setSections(s => ({ ...s, bqlist: true }));
        setInfoLine(activeLine);
      }
    }
    if (key === 'drawing') setDrawingSheet(v => (v ? null : lastDrawing));
    if (key === 'programme') setProgrammeView(v => !v);
  };

  const openDrawing = (id: string) => {
    setDrawingSheet(id);
    setLastDrawing(id);
  };

  const showBadge = () => {
    setModal(null);
    go('mapping');
    setBadgeOpen(true);
  };
  const showProps = () => {
    setModal(null);
    go('mapping');
    setPropsOpen(true);
  };

  const importFile = (name: string) => {
    setData(d => ({
      ...d,
      files: [...d.files, { id: 'f-' + Date.now(), name, count: 0, drawings: [] }]
    }));
  };

  const exportBill = () => {
    const blob = new Blob([JSON.stringify(data.bill, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bill.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const editQty = (id: string, value: number | null) => {
    setData(d => ({
      ...d,
      bill: {
        ...d.bill,
        lines: d.bill.lines.map(l =>
          l.id === id ? { ...l, override: value, state: value == null ? 'calculated' : 'override' } : l
        )
      }
    }));
  };

  const editRate = (id: string, value: number | null) => {
    if (!permissions.canViewMoney) return;
    setData(d => ({
      ...d,
      bill: {
        ...d.bill,
        lines: d.bill.lines.map(l => (l.id === id ? { ...l, rate: value } : l))
      }
    }));
  };

  if (route === 'home') {
    return (
      <ProjectHome
        projects={projects}
        userName="Dicky"
        onCreate={createProject}
        onOpen={openProject}
      />
    );
  }

  return (
    <div className="apc-app">
      <ToolRail
        tool={route}
        sections={sections}
        onTool={go}
        onModal={setModal}
        onToggleSection={toggle}
        onToggleWindow={toggleWindow}
        windows={{
          badge: badgeOpen,
          props: propsOpen,
          bqDetails: !!infoLine && sections.bqlist,
          drawing: !!drawingSheet,
          programme: programmeView
        }}
        onExport={exportBill}
        docTool={docTool}
        onDocTool={tool => {
          setDocTool(tool);
          if (tool === 'pricing') setDocHomeKey(key => key + 1);
        }}
        onHome={goHome}
      />

      <div className="apc-main">
        {route === 'library' ? (
          <MeasurementLibrary
            key={`library-${activeProject?.id ?? 'unassigned'}`}
            projectId={activeProject?.id}
          />
        ) : route === 'bill' ? (
          <DocumentManagement
            key={`${docHomeKey}-${activeProject?.id ?? 'unassigned'}`}
            mode={docTool}
            necOption={activeProject?.necOption}
            standard={activeProject?.standard}
            projectId={activeProject?.id}
          />
        ) : route === 'data' ? (
          <AiScanning
            key={`data-${activeProject?.id ?? 'unassigned'}`}
            projectName={data.project.name}
            projectNumber={data.project.contract}
            projectId={activeProject?.id}
            showProgramme={programmeView}
            onCloseProgramme={() => setProgrammeView(false)}
            onToggleProgramme={() => setProgrammeView(value => !value)}
          />
        ) : route === 'mapping' ? (
          <BimMapping
            key={`mapping-${activeProject?.id ?? 'unassigned'}`}
            projectName={data.project.name}
            projectNumber={data.project.contract}
            standard={data.project.standard}
            projectId={activeProject?.id}
            showProgramme={programmeView}
            onCloseProgramme={() => setProgrammeView(false)}
            onToggleProgramme={() => setProgrammeView(value => !value)}
            necOption={activeProject?.necOption}
            modelView={{
              data,
              active,
              setActive,
              activeLine,
              setActiveLine,
              showBrowser: sections.browser,
              onCloseBrowser: () => toggle('browser'),
              showTools: sections.tools,
              showBqList: sections.bqlist,
              onHideBqList: () => toggle('bqlist'),
              showBadge: badgeOpen,
              onCloseBadge: () => setBadgeOpen(false),
              showProps: propsOpen,
              onCloseProps: () => setPropsOpen(false),
              infoLine,
              setInfoLine,
              showPano: sections.pano,
              onShowProps: () => setPropsOpen(true),
              drawingSheet,
              onOpenDrawing: openDrawing,
              onCloseDrawing: () => setDrawingSheet(null),
              onQtyChange: editQty,
              onRateChange: editRate,
              showMoney: permissions.canViewMoney
            }}
          />
        ) : (
          <PageStub />
        )}
      </div>

      {modal === 'files' && (
        <FilesPanel data={data} onClose={() => setModal(null)} onImport={importFile} onExport={exportBill} />
      )}
      {modal === 'views' && (
        <ViewsPanel
          sections={sections}
          onToggle={toggle}
          onShowBadge={showBadge}
          onShowProps={showProps}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'settings' && <SettingsPanel project={data.project} onClose={() => setModal(null)} />}
    </div>
  );
}
