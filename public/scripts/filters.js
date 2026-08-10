export function initFilters(railId, gridId) {
  const rail = document.getElementById(railId);
  const grid = document.getElementById(gridId);
  if (!rail || !grid) return;

  let emptyMsg = grid.parentElement.querySelector('.filter-empty');
  if (!emptyMsg) {
    emptyMsg = document.createElement('p');
    emptyMsg.className = 'filter-empty';
    emptyMsg.style.color = 'var(--ink-faint)';
    emptyMsg.style.padding = '24px 0';
    emptyMsg.textContent = 'No prompts match these filters.';
    emptyMsg.hidden = true;
    grid.after(emptyMsg);
  }

  function checkedValues(group) {
    return Array.from(rail.querySelectorAll(`[data-filter-group="${group}"] input[type="checkbox"]:checked`)).map(i => i.value);
  }

  function apply() {
    const models = checkedValues('model');
    const complexities = checkedValues('complexity');
    const chainRadio = rail.querySelector('[data-filter-group="chain"] input:checked');
    const chainOnly = chainRadio && chainRadio.value === 'true';

    const cards = Array.from(grid.children);
    let visibleCount = 0;
    for (const card of cards) {
      const cardModels = (card.dataset.model || '').split(',').filter(Boolean);
      const matchesModel = models.length === 0 || models.some(m => cardModels.includes(m));
      const matchesComplexity = complexities.length === 0 || complexities.includes(card.dataset.complexity);
      const matchesChain = !chainOnly || card.dataset.chain === 'true';
      const visible = matchesModel && matchesComplexity && matchesChain;
      card.hidden = !visible;
      if (visible) visibleCount++;
    }

    const sortValue = rail.querySelector('.filter-sort')?.value || 'newest';
    const sorted = cards.slice().sort((a, b) => {
      if (sortValue === 'az') return a.dataset.title.localeCompare(b.dataset.title);
      return new Date(b.dataset.updated || 0) - new Date(a.dataset.updated || 0);
    });
    sorted.forEach(card => grid.appendChild(card));

    emptyMsg.hidden = visibleCount !== 0;
  }

  rail.addEventListener('change', apply);
  apply();
}
