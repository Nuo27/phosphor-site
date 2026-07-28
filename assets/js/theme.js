(function () {
  var KEY = 'theme';
  var stored = localStorage.getItem(KEY);
  var prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = stored || (prefersDark ? 'dark' : 'dark');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (localStorage.getItem(KEY)) return;
    document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
  });
  window.toggleTheme = function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
  };
})();
