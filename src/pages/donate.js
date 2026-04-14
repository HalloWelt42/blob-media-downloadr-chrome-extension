// Spendenseite: initialisiert Ko-fi-Link, QR-Codes und Kopier-Knöpfe.

function initDonations() {
  if (DONATE_CONFIG.kofi) {
    var kofiBtn = document.getElementById('kofi-btn');
    if (kofiBtn) kofiBtn.href = DONATE_CONFIG.kofi;
  }

  var coins = ['btc', 'doge', 'eth'];
  coins.forEach(function (coin) {
    var cfg = DONATE_CONFIG[coin];
    if (cfg && cfg.address) {
      var addrEl = document.getElementById(coin + '-address');
      if (addrEl) addrEl.textContent = cfg.address;
      if (cfg.qr) {
        var qrEl = document.getElementById(coin + '-qr');
        if (qrEl) {
          var img = document.createElement('img');
          img.src = cfg.qr;
          img.alt = coin.toUpperCase() + ' QR';
          qrEl.textContent = '';
          qrEl.appendChild(img);
        }
      }
    }
  });
}

// Tab-Wechsel
document.querySelectorAll('.crypto-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.crypto-tab').forEach(function (t) {
      t.classList.remove('active');
    });
    document.querySelectorAll('.crypto-content').forEach(function (c) {
      c.classList.remove('active');
    });
    tab.classList.add('active');
    var content = document.getElementById('crypto-' + tab.dataset.crypto);
    if (content) content.classList.add('active');
  });
});

// Kopier-Knöpfe
document.querySelectorAll('.copy-btn[data-coin]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var coin = btn.dataset.coin;
    var addrEl = document.getElementById(coin + '-address');
    var address = addrEl ? addrEl.textContent : '';
    if (!address) return;
    navigator.clipboard
      .writeText(address)
      .then(function () {
        var textEl = btn.querySelector('.copy-text');
        if (!textEl) return;
        var original = textEl.textContent;
        textEl.textContent = i18n('donateCopied');
        setTimeout(function () {
          textEl.textContent = original;
        }, 2000);
      })
      .catch(function () {
        /* ignorieren, falls Clipboard blockiert */
      });
  });
});

initDonations();
