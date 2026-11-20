import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import type { ProjectRecord, ProjectStandard } from '../lib/projects';

export interface NewProjectInput {
  name: string;
  number: string;
  description: string;
  standard: ProjectStandard;
}

export function ProjectHome({
  projects,
  userName,
  onCreate,
  onOpen
}: {
  projects: ProjectRecord[];
  userName: string;
  onCreate: (project: NewProjectInput) => void;
  onOpen: (project: ProjectRecord) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [standard, setStandard] = useState<ProjectStandard>('HKSMM4');
  const [error, setError] = useState<string | null>(null);

  const openForm = () => {
    setName('');
    setNumber('');
    setDescription('');
    setStandard('HKSMM4');
    setError(null);
    setFormOpen(true);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !number.trim()) {
      setError('Project name and project number are required.');
      return;
    }
    onCreate({
      name: name.trim(),
      number: number.trim(),
      description: description.trim(),
      standard
    });
    setFormOpen(false);
  };

  return (
    <div className="apc-home">
      <div className="apc-home__shell">
        <aside className="apc-home__side">
          <div className="apc-home__brand">
            <span className="apc-home__logo">
              <Icon name="layout-grid" size={16} />
            </span>
            <b>AI Progress Checking</b>
          </div>
          <button className="apc-home__create" onClick={openForm}>
            <span aria-hidden>+</span>
            Create project
          </button>
        </aside>

        <main className="apc-home__main">
          <header className="apc-home__hello">
            <h1>Hello {userName}</h1>
            <p>Select a project to continue.</p>
          </header>

          <div className="apc-home__tabs">
            <button className="apc-home__tab on">Project</button>
          </div>

          <div className="apc-home__content">
            <div className="apc-home__bar">
              <h2>Projects</h2>
              <span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
            </div>

            <table className="apc-home__table">
              <thead>
                <tr>
                  <th className="apc-home__type">Type</th>
                  <th>Name</th>
                  <th>Number</th>
                  <th>Standard</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {projects.map(project => (
                  <tr key={project.id} onClick={() => onOpen(project)}>
                    <td className="apc-home__type">
                      <span className="apc-home__projecticon">
                        <Icon name="building-2" size={16} />
                      </span>
                    </td>
                    <td>
                      <div className="apc-home__projectname">
                        <b>{project.name}</b>
                        <small>{project.description || 'No description'}</small>
                      </div>
                    </td>
                    <td className="apc-home__mono">{project.number}</td>
                    <td>
                      <span className={`apc-home__standard${project.standard === 'CESMM' ? ' cesmm' : ''}`}>
                        {project.standard}
                      </span>
                    </td>
                    <td className="apc-home__open">
                      <Icon name="chevron-right" size={15} />
                    </td>
                  </tr>
                ))}
                {!projects.length && (
                  <tr>
                    <td colSpan={5} className="apc-home__empty">
                      No projects yet. Create your first project.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="apc-home__foot">
              Showing 1–{projects.length} of {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </div>
          </div>
        </main>
      </div>

      {formOpen && (
        <div className="apc-home__scrim" onClick={() => setFormOpen(false)}>
          <form className="apc-home__form" onClick={event => event.stopPropagation()} onSubmit={submit}>
            <div className="apc-home__formhead">
              <div>
                <b>Create project</b>
                <span>Set up a new project workspace.</span>
              </div>
              <button type="button" className="apc-iconbtn" onClick={() => setFormOpen(false)} aria-label="Close">
                <Icon name="x" size={15} />
              </button>
            </div>

            <div className="apc-home__fields">
              <label>
                <span>Project Name</span>
                <input value={name} onChange={event => setName(event.target.value)} placeholder="Enter project name" autoFocus />
              </label>
              <label>
                <span>Project Number</span>
                <input value={number} onChange={event => setNumber(event.target.value)} placeholder="Enter project number" />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  placeholder="Brief project description"
                  rows={3}
                />
              </label>
              <label>
                <span>Standard</span>
                <select value={standard} onChange={event => setStandard(event.target.value as ProjectStandard)}>
                  <option value="HKSMM4">HKSMM4</option>
                  <option value="CESMM">CESMM</option>
                </select>
              </label>
              {error && <div className="apc-home__error">{error}</div>}
            </div>

            <div className="apc-home__formfoot">
              <button type="button" className="apc-home__cancel" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="apc-home__submit">
                Create project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
