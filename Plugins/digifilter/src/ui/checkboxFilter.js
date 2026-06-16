/**
 * Builds a checkbox filter dropdown and wires up all listeners.
 *
 * @param {Object}      opts
 * @param {HTMLElement} opts.menuEl        - The dropdown menu container element
 * @param {string[]}    opts.items         - Sorted array of unique values to render
 * @param {string}      opts.cssPrefix     - e.g. 'filter' or 'handlingar-filter'
 * @param {string}      opts.selectAllId   - ID for the "select all" checkbox
 * @param {string}      opts.checkboxClass - CSS class applied to each item checkbox
 * @param {Set}         opts.stateSet      - The state Set to add/remove values from
 * @param {Function}    opts.onRender      - Called after any checkbox change to re-render the list
 * @param {Function}    opts.updateBtnText - Called to update the filter button label
 */
export function buildCheckboxFilter({
  menuEl,
  items,
  cssPrefix,
  selectAllId,
  checkboxClass,
  stateSet,
  onRender,
  updateBtnText
}) {
  menuEl.innerHTML = '';

  // "Select all" row
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = `${cssPrefix}-option select-all`;
  selectAllDiv.innerHTML = `
    <input type="checkbox" id="${selectAllId}"/>
    <label for="${selectAllId}">Välj alla</label>
  `;
  menuEl.appendChild(selectAllDiv);

  // One row per item
  items.forEach(item => {
    const id = `${cssPrefix}-${item.replace(/\s+/g, '-')}`;
    const div = document.createElement('div');
    div.className = `${cssPrefix}-option`;
    div.innerHTML = `
      <input type="checkbox" id="${id}" value="${item}" class="${checkboxClass}"/>
      <label for="${id}">${item}</label>
    `;
    menuEl.appendChild(div);
  });

  // FIX: query within menuEl, not the whole document, so multiple concurrent
  // dropdown instances with different IDs can never collide.
  const selectAllCheckbox = menuEl.querySelector(`#${selectAllId}`);
  const checkboxes        = menuEl.querySelectorAll(`.${checkboxClass}`);

  selectAllCheckbox?.addEventListener('change', (e) => {
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
      e.target.checked ? stateSet.add(cb.value) : stateSet.delete(cb.value);
    });
    updateBtnText();
    onRender();
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', (e) => {
      e.target.checked ? stateSet.add(e.target.value) : stateSet.delete(e.target.value);
      if (!e.target.checked && selectAllCheckbox) selectAllCheckbox.checked = false;
      updateBtnText();
      onRender();
    });
  });
}