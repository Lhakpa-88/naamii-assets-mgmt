/* Data store: one JSON document kept in the browser (IndexedDB), with an audit trail.
   The Excel workbook exported from the Data page is the shared master copy between users.
   To move to a server later, replace load() and save() with API calls — nothing else depends on IndexedDB. */
(function () {
  var DB = 'naamii-ams', STORE = 'kv', KEY = 'state';

  function blank() {
    return {
      meta: { version: 1, createdAt: new Date().toISOString(), lastExportAt: '' },
      settings: JSON.parse(JSON.stringify(AMS.DEFAULT_SETTINGS)),
      assets: [], projects: [],
      locations: JSON.parse(JSON.stringify(AMS.DEFAULT_LOCATIONS)),
      categories: JSON.parse(JSON.stringify(AMS.DEFAULT_CATEGORIES)),
      movements: [], maintenance: [], disposals: [], audit: []
    };
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  var store = {
    state: null,
    user: null,

    load: function () {
      try { store.user = JSON.parse(localStorage.getItem('naamii-ams-user') || 'null'); } catch (e) { store.user = null; }
      return openDb().then(function (db) {
        return new Promise(function (resolve) {
          var req = db.transaction(STORE).objectStore(STORE).get(KEY);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(null); };
        });
      }).catch(function () {
        try { return JSON.parse(localStorage.getItem('naamii-ams-state') || 'null'); } catch (e) { return null; }
      }).then(function (saved) {
        store.state = store.normalise(saved || blank());
      });
    },

    /* Fill in anything missing so older saved data and imported backups keep working. */
    normalise: function (s) {
      var b = blank();
      Object.keys(b).forEach(function (k) { if (s[k] == null) s[k] = b[k]; });
      Object.keys(b.settings).forEach(function (k) { if (s.settings[k] == null) s.settings[k] = b.settings[k]; });
      return s;
    },

    save: function () {
      var snapshot = JSON.parse(JSON.stringify(store.state));
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(snapshot, KEY);
          tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
        });
      }).catch(function () {
        try { localStorage.setItem('naamii-ams-state', JSON.stringify(snapshot)); } catch (e) { /* storage full */ }
      });
    },

    setUser: function (u) { store.user = u; localStorage.setItem('naamii-ams-user', JSON.stringify(u)); },
    can: function (perm) { return !!store.user && (AMS.PERMISSIONS[store.user.role] || []).indexOf(perm) >= 0; },
    reset: function () { store.state = blank(); return store.save(); },

    audit: function (action, entity, id, detail) {
      store.state.audit.push({
        at: new Date().toISOString(), user: store.user ? store.user.name : '', role: store.user ? AMS.ROLES[store.user.role] : '',
        action: action, entity: entity, id: id || '', detail: detail || ''
      });
      if (store.state.audit.length > 5000) store.state.audit.splice(0, store.state.audit.length - 5000);
    },

    find: function (list, id, key) {
      key = key || 'id';
      var want = String(id == null ? '' : id).toLowerCase();
      return store.state[list].filter(function (r) { return String(r[key]).toLowerCase() === want; })[0] || null;
    },

    seqId: function (list, prefix, width) {
      var max = 0;
      store.state[list].forEach(function (r) {
        var id = String(r.id || '');
        if (id.toUpperCase().indexOf(prefix.toUpperCase() + '-') !== 0) return;
        var n = parseInt(id.slice(prefix.length + 1), 10);
        if (isFinite(n) && n > max) max = n;
      });
      var s = String(max + 1); while (s.length < (width || 4)) s = '0' + s;
      return prefix + '-' + s;
    },
    assetId: function (categoryCode) {
      return store.seqId('assets', store.state.settings.idPrefix + '-' + (categoryCode || 'OTH'), 4);
    },

    addMovement: function (m) {
      m.id = m.id || store.seqId('movements', 'MOV', 5);
      m.by = m.by || (store.user ? store.user.name : '');
      store.state.movements.push(m);
      return m;
    }
  };

  AMS.store = store;
  AMS.blankState = blank;
})();
