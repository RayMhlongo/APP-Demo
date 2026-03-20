export function createNav(navRoot, screenRoot, onChange) {
  const screens = [...screenRoot.querySelectorAll('.screen')];
  const navBtns = [...navRoot.querySelectorAll('.nav-btn')];

  function activate(screen) {
    screens.forEach((el) => {
      const isActive = el.dataset.screen === screen;
      el.classList.toggle('is-active', isActive);
      if (isActive) {
        el.classList.remove('is-entering');
        void el.offsetWidth;
        el.classList.add('is-entering');
      } else {
        el.classList.remove('is-entering');
      }
    });

    navBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.nav === screen));
    if (onChange) onChange(screen);
  }

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.nav));
  });

  return { activate };
}
