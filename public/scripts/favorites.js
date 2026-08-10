const KEY = 'prompt-library:favorites';

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function isFavorite(slug) {
  return getFavorites().includes(slug);
}

export function toggleFavorite(slug) {
  const current = getFavorites();
  const idx = current.indexOf(slug);
  if (idx === -1) current.push(slug);
  else current.splice(idx, 1);
  localStorage.setItem(KEY, JSON.stringify(current));
  updateNavCount();
  document.dispatchEvent(new CustomEvent('favorites:changed', { detail: { favorites: current } }));
  return current.includes(slug);
}

export function exportFavorites() {
  const data = JSON.stringify(getFavorites(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'prompt-library-favorites.json';
  a.click();
  URL.revokeObjectURL(url);
}

function updateNavCount() {
  const el = document.getElementById('nav-fav-count');
  if (el) el.textContent = `☆ ${getFavorites().length}`;
}

function initStars() {
  document.querySelectorAll('[data-fav-slug]').forEach(btn => {
    const slug = btn.getAttribute('data-fav-slug');
    const active = isFavorite(slug);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nowActive = toggleFavorite(slug);
      btn.classList.toggle('is-active', nowActive);
      btn.setAttribute('aria-pressed', String(nowActive));
    });
  });
}

function initCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.getAttribute('data-copy-target');
      const el = document.getElementById(targetId);
      const text = el ? (el.dataset.rawText || el.textContent) : '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard unavailable, ignore
      }
      const original = btn.innerHTML;
      btn.classList.add('is-active');
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('is-active');
      }, 2000);
    });
  });
}

updateNavCount();
document.addEventListener('DOMContentLoaded', () => {
  initStars();
  initCopyButtons();
});
