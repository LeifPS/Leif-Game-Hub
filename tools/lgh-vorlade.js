/* Spielstand aus dem Spiele-Hub einspielen (muss vor dem Spielcode laufen). Der Hub hängt den gespeicherten Stand als #lgh=<Base64url(JSON)> an die Adresse. */
(function () {
  try {
    var h = location.hash;
    if (h.indexOf('#lgh=') !== 0) return;
    var t = h.slice(5).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var s = atob(t), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    var o = JSON.parse(new TextDecoder().decode(u));
    if (o && o.d && typeof o.d === 'object') for (var k in o.d) if (Object.prototype.hasOwnProperty.call(o.d, k)) localStorage.setItem(k, String(o.d[k]));
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { }
})();
