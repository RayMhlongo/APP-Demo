export function createNav(navRoot, screenRoot, onChange) {
  const screens = [...screenRoot.querySelectorAll('.screen')];
  const navBtns = [...navRoot.querySelectorAll('.nav-btn')];

  function activate(screen) {
    screens.forEach((el) => el.classList.toggle('is-active', el.dataset.screen === screen));
    navBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.nav === screen));
    if (onChange) onChange(screen);
  }

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.nav));
  });

  return { activate };
}
