// DOM-Translate-Helper für Chrome-Extensions.
//
// Scannt beim Laden eines Dokuments nach data-i18n-*-Attributen und
// ersetzt die Inhalte durch die übersetzten Texte aus chrome.i18n.
//
// Unterstützte Attribute:
//   data-i18n              -> element.textContent
//   data-i18n-html         -> element.innerHTML (nur für vertrauenswürdige Nachrichten)
//   data-i18n-placeholder  -> element.placeholder
//   data-i18n-title        -> element.title
//   data-i18n-aria-label   -> element.getAttribute('aria-label')

function i18n(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

(function () {
  try {
    document.documentElement.lang = chrome.i18n.getUILanguage();
  } catch (_e) {
    /* ignorieren */
  }

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    // Sicher: der Inhalt stammt aus _locales/*.json der Erweiterung,
    // nicht aus Nutzereingaben
    var msg = chrome.i18n.getMessage(el.dataset.i18nHtml);
    if (msg) el.innerHTML = msg;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    var msg = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
    var msg = chrome.i18n.getMessage(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
    var msg = chrome.i18n.getMessage(el.dataset.i18nAriaLabel);
    if (msg) el.setAttribute('aria-label', msg);
  });
})();
