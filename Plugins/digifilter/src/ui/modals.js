import CONFIG from '../config';
import { makeDraggable } from '../mapControls';
import { fetchRelatedFeatures } from '../wfsClient';
import { formatDate } from './dateUtils';

export function closeAllModals() {
  document.querySelectorAll('.detail-modal').forEach(modal => modal.remove());
}

/**
 * Creates a draggable modal and returns { modal, body }.
 * @param {string} title
 * @param {Object} [opts]
 * @param {string} [opts.extraClass]
 * @param {string} [opts.bodyStyle]
 */
export function createModal(title, { extraClass = '', bodyStyle = '' } = {}) {
  closeAllModals();

  const modal = document.createElement('div');
  modal.className = `detail-modal${extraClass ? ` ${extraClass}` : ''} visible`;
  modal.id = `modal-${Date.now()}`;
  modal.innerHTML = `
    <div class="detail-modal-content">
      <div class="detail-modal-header">
        <h2 class="detail-modal-title">${title}</h2>
        <button class="close-btn detail-close-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="detail-modal-body"${bodyStyle ? ` style="${bodyStyle}"` : ''}></div>
    </div>
  `;

  document.body.appendChild(modal);

  const header   = modal.querySelector('.detail-modal-header');
  const body     = modal.querySelector('.detail-modal-body');
  const closeBtn = modal.querySelector('.detail-close-btn');

  closeBtn.addEventListener('click', () => modal.remove());
  makeDraggable(modal, header);

  return { modal, body };
}

// ─── Feature detail ────────────────────────────────────────────────────────

function renderRelatedFeatureHTML(feature, config) {
  const props = feature.properties;

  if (config.promoteAttribs?.length > 0) {
    const promoteConfig = config.promoteAttribs[0];
    if (promoteConfig.html) {
      let html = promoteConfig.html;
      Object.keys(props).forEach(key => {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), props[key] || '');
      });
      return html;
    }
  }

  const featureTitle = config.featureTitle ? props[config.featureTitle] : '';
  return `
    <div style="padding:8px;background:#f5f5f5;border-radius:6px;margin-bottom:8px;">
      <strong>${featureTitle || 'Relaterad post'}</strong><br>
      ${Object.entries(props)
        .filter(([k]) => !k.includes('geom') && k !== 'geometry')
        .map(([k, v]) => `<small>${k}: ${v}</small>`)
        .join('<br>')}
    </div>
  `;
}

export async function showFeatureDetail(layerName, featureProps, viewer) {
  const attrs = CONFIG.ARENDE_ATTRS;
  const title = featureProps[attrs.title] || featureProps.namn || featureProps.name || 'Detaljer';
  const { body } = createModal(title);

  body.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner"></div></div>';

  // FIX: derive labelMap from CONFIG.ARENDE_ATTRS so it stays in sync with
  // whatever attribute names were passed to initConfig(). Previously this was
  // a hardcoded map of raw Swedish field names that diverged silently when
  // the config changed.
  const excludeFields = new Set([
    'geom', 'geometry', 'the_geom', 'geom_wkt',
    attrs.id ? String(attrs.id).toLowerCase() : ''
  ].filter(Boolean));

  const labelMap = Object.fromEntries(
    Object.entries({
      [attrs.type]:         'Ärendetyp',
      [attrs.diarieNumber]: 'Diarienummer',
      [attrs.title]:        'Rubrik',
      [attrs.created]:      'Skapad',
      [attrs.property]:     'Fastighet',
    }).filter(([key]) => Boolean(key))
  );

  let html = '';
  Object.entries(featureProps)
    .filter(([key]) => !excludeFields.has(key.toLowerCase()))
    .forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        const label = labelMap[key]
          ?? labelMap[key.toLowerCase()]
          ?? key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Format anything that looks like a date string (YYYY-MM-DD…)
        const displayValue = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
          ? formatDate(value)
          : value;

        html += `
          <div class="detail-field">
            <div class="detail-field-label">${label}</div>
            <div class="detail-field-value">${displayValue}</div>
          </div>
        `;
      }
    });

  const relatedFeatures = await fetchRelatedFeatures(layerName, featureProps, viewer);

  if (relatedFeatures.length > 0) {
    html += `<div class="detail-related-section">`;
    relatedFeatures.forEach(({ config, features }) => {
      html += `
        <div class="detail-related-title">Handlingar (${features.length})</div>
        <div class="detail-related-items">
      `;
      features.forEach(feature => { html += renderRelatedFeatureHTML(feature, config); });
      html += `</div>`;
    });
    html += `</div>`;
  }

  body.innerHTML = html;
}