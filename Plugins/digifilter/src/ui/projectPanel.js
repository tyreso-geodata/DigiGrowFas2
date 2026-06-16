/**
 * projectPanel.js
 *
 * FIX P4: Module-level mutable variables (_activeTab, _listEl, _onProjectClick)
 * replaced with a factory pattern. State is now scoped to the object returned
 * by createProjectPanel() rather than living at module scope, so multiple
 * independent panel instances (or hot reloads) cannot corrupt each other.
 *
 * The three exported functions (renderProjects, setActiveProjectUI,
 * updateProjectCardCounts) are kept for backwards compatibility — they delegate
 * to the default panel instance created on first import, which matches the
 * existing single-instance usage in digifilter.js.
 */

const TABS = [
  { value: 'pagande',   label: 'Pågående'  },
  { value: 'pausade',   label: 'Pausade'   },
  { value: 'avslutade', label: 'Avslutade' }
];

// ─── Factory ──────────────────────────────────────────────────────────────

/**
 * Creates a self-contained project panel instance.
 * All mutable state is scoped to the returned object.
 */
export function createProjectPanel() {
  let activeTab      = 'pagande';
  let listEl         = null;
  let onProjectClick = null;

  // ── Public API ─────────────────────────────────────────────────────────

  function renderProjects(el, onClick) {
    listEl         = el;
    onProjectClick = onClick;

    const projects = window.PROJECTS_CONFIG || [];

    if (projects.length === 0) {
      console.warn('No projects configured. Please define window.PROJECTS_CONFIG in index.html');
      listEl.innerHTML =
        '<p style="padding: 20px; text-align: center; color: #64748b;">Inga projekt konfigurerade</p>';
      return;
    }

    _renderTabs();
    _renderList();
  }

  function setActiveProjectUI(projektNr) {
    document.querySelectorAll('.project-item, .subproject-item').forEach(item => {
      item.classList.toggle('active', parseInt(item.dataset.id) === parseInt(projektNr));
    });
  }

  function updateProjectCardCounts(projektNr, featureCounts) {
    const projectCard = document.querySelector(`.project-item[data-id="${projektNr}"]`);
    if (!projectCard) return;

    projectCard.querySelector('.feature-counts')?.remove();

    const total = Object.values(featureCounts).reduce((sum, n) => sum + n, 0);
    if (total === 0) return;

    const countsDiv = document.createElement('div');
    countsDiv.className = 'feature-counts';
    countsDiv.innerHTML = `
      <span class="feature-count-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        ${total} Ärenden
      </span>
    `;

    projectCard.querySelector('.project-info').appendChild(countsDiv);
  }

  // ── Internal ───────────────────────────────────────────────────────────

  function _renderTabs() {
    // Guard: if a tab bar already exists for this listEl's parent, skip.
    if (listEl.parentElement.querySelector('#project-status-tabs')) return;

    const tabBar = document.createElement('div');
    tabBar.id        = 'project-status-tabs';
    tabBar.className = 'project-status-tabs';
    listEl.parentElement.insertBefore(tabBar, listEl);

    tabBar.innerHTML = TABS.map(tab => `
      <button
        class="project-status-tab${tab.value === activeTab ? ' active' : ''}"
        data-tab="${tab.value}">
        ${tab.label}
      </button>
    `).join('');

    tabBar.querySelectorAll('.project-status-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        tabBar.querySelectorAll('.project-status-tab').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === activeTab)
        );
        _renderList();
      });
    });
  }

  function _renderList() {
    const all      = window.PROJECTS_CONFIG || [];
    const projects = all.filter(p => p.status === activeTab);

    if (projects.length === 0) {
      listEl.innerHTML = `
        <p style="padding: 24px 16px; text-align: center; color: #64748b; font-size: 13px;">
          Inga projekt i denna kategori
        </p>`;
      return;
    }

    listEl.innerHTML = projects.map(project => {
      const hasSubprojects = project.subprojects?.length > 0;
      const subHTML = hasSubprojects
        ? `<div class="subproject-toggle" data-id="${project.id}">
            <svg class="subproject-toggle-icon" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <span>${project.subprojects.length} delprojekt</span>
          </div>
          <div class="subproject-list collapsed" id="subprojects-${project.id}">
            ${project.subprojects.map(sub => `
              <div class="subproject-item" data-id="${sub.id}">${sub.name}</div>
            `).join('')}
          </div>`
        : '';

      return `
        <div class="project-item" data-id="${project.id}">
          <img src="${project.image}" alt="${project.name}" class="project-thumbnail"/>
          <div class="project-info">
            <div class="project-name">${project.name}</div>
            <div class="project-meta">
              <span>Projektledare: ${project.projectmanager}</span>
            </div>
          </div>
        </div>
        ${subHTML}
      `;
    }).join('');

    listEl.querySelectorAll('.project-item').forEach(item => {
      item.addEventListener('click', () => {
        onProjectClick(parseInt(item.dataset.id, 10));
      });
    });

    listEl.querySelectorAll('.subproject-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        onProjectClick(parseInt(item.dataset.id, 10));
      });
    });

    listEl.querySelectorAll('.subproject-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const id   = toggle.dataset.id;
        const list = document.getElementById(`subprojects-${id}`);
        const isCollapsed = list.classList.toggle('collapsed');
        toggle.classList.toggle('open', !isCollapsed);
      });
    });
  }

  return { renderProjects, setActiveProjectUI, updateProjectCardCounts };
}

// ─── Default instance (backwards-compatible exports) ─────────────────────
//
// digifilter.js imports { renderProjects, setActiveProjectUI, updateProjectCardCounts }
// directly. We expose them from a single shared default instance so existing
// call sites require zero changes.

const _defaultPanel = createProjectPanel();

export const renderProjects          = (...args) => _defaultPanel.renderProjects(...args);
export const setActiveProjectUI      = (...args) => _defaultPanel.setActiveProjectUI(...args);
export const updateProjectCardCounts = (...args) => _defaultPanel.updateProjectCardCounts(...args);