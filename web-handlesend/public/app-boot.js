/* Runs before first paint: the home-screen app boots on its dark splash instead of the site's pearl loader. */
(function () {
  try {
    var standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (standalone && !/^\/app(\/|$)/.test(location.pathname) && !/^\/capture\//.test(location.pathname)) location.replace('/app/');
    if (standalone || /^\/app(\/|$)/.test(location.pathname)) {
      document.documentElement.setAttribute('data-app', '1');
      var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', '#111216');
    }
  } catch (e) { /* never block boot */ }
})();
