const topics = document.querySelector('.help-topics');
const tabs = [...topics.querySelectorAll('a')];
const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
const sideNavigation = matchMedia('(min-width: 920px)');

function updateOrientation() {
  topics.setAttribute('aria-orientation', sideNavigation.matches ? 'vertical' : 'horizontal');
}

function showTab(index) {
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[position].hidden = !selected;
  });
}

function syncWithAddress() {
  const index = tabs.findIndex(tab => tab.hash === location.hash);
  showTab(Math.max(index, 0));
}

function activateTab(index) {
  const { hash } = tabs[index];
  if (location.hash !== hash) history.pushState(null, '', hash);
  showTab(index);
  const panel = panels[index];
  if (panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
}

topics.setAttribute('role', 'tablist');
updateOrientation();
sideNavigation.addEventListener('change', updateOrientation);
tabs.forEach((tab, index) => {
  const panel = panels[index];
  tab.id = `tab-${panel.id}`;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', panel.id);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.tabIndex = 0;

  tab.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    activateTab(index);
  });

  tab.addEventListener('keydown', event => {
    let next;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        if (sideNavigation.matches !== (event.key === 'ArrowUp')) return;
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        if (sideNavigation.matches !== (event.key === 'ArrowDown')) return;
        next = (index + 1) % tabs.length;
        break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      case ' ': next = index; break;
      default: return;
    }
    event.preventDefault();
    activateTab(next);
    tabs[next].focus();
  });
});

syncWithAddress();
window.addEventListener('popstate', syncWithAddress);
window.addEventListener('hashchange', syncWithAddress);
