/* Data store with two back ends behind the same load() / save() calls:
   - Local: one JSON document in this browser (IndexedDB). Used on GitHub Pages, a file share or a plain web server.
   - Shared: when the page is published as a Claude artifact with the `db` capability, each record is a document
     in the artifact's shared database, so every tester sees the same live data.
   To move to NAAMII's own server later, add a third back end here; the screens only call load(), save() and audit(). */
(function () {
  var DB = 'naamii-ams', STORE = 'kv', KEY = 'state';
  var COLL = ['assets', 'projects', 'locations', 'categories', 'movements', 'maintenance', 'disposals'];
  var hosted = !!(window.claude && typeof window.claude.use === 'function');
  var env = { hosted: hosted, shared: false, readOnly: false, slow: false, downloads: null, profileName: '' };
  var cloud = null, synced = { config: {} }, chain = {}, inFlight = {}, pendingDeletes = [], fullSync = false;
  var myAudit = [], myAuditWritten = 0, auditPart = 0, sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), othersAudit = [];
  COLL.forEach(function (c) { synced[c] = {}; });

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
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function idKey(c) { return c === 'projects' || c === 'locations' || c === 'categories' ? 'code' : 'id'; }
  /* Document ids may only hold letters, digits and a few symbols: encode everything else. */
  function enc(id) {
    return String(id).replace(/[^A-Za-z0-9_-]/g, function (ch) { return '~' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4); }) || '~0000';
  }
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  /* ---------- local back end ---------- */
  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function localLoad() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var req = db.transaction(STORE).objectStore(STORE).get(KEY);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () {
      try { return JSON.parse(localStorage.getItem('naamii-ams-state') || 'null'); } catch (e) { return null; }
    }).then(function (saved) { store.state = store.normalise(saved || blank()); });
  }
  function localSave() {
    var snapshot = clone(store.state);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(snapshot, KEY);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () {
      try { localStorage.setItem('naamii-ams-state', JSON.stringify(snapshot)); } catch (e) { /* storage unavailable */ }
    });
  }

  /* ---------- shared back end ---------- */
  function changed() { if (store.onRemoteChange) store.onRemoteChange(); }
  function applyCollection(c, snap) {
    var k = idKey(c), seen = {}, incoming = {};
    snap.docs.forEach(function (d) { var data = clone(d.data() || {}); seen[d.id] = true; incoming[d.id] = data; synced[c][d.id] = stable(data); });
    var out = [];
    store.state[c].forEach(function (r) {
      var id = enc(r[k]);
      if (incoming[id]) { out.push(incoming[id]); delete incoming[id]; }
      else if (synced[c][id] !== undefined && !seen[id] && !inFlight[c + '/' + id]) delete synced[c][id];   // removed by someone else
      else out.push(r);                                                                                    // not yet saved from here
    });
    Object.keys(incoming).forEach(function (id) { out.push(incoming[id]); });
    store.state[c] = out;
  }
  function applyConfig(snap) {
    snap.docs.forEach(function (d) {
      var data = clone(d.data() || {});
      if (d.id === 'settings') { store.state.settings = data; store.normalise(store.state); env.initialised = true; }
      if (d.id === 'meta') store.state.meta = data;
      synced.config[d.id] = stable(d.id === 'settings' ? store.state.settings : data);
    });
  }
  function applyAudit(snap) {
    othersAudit = [];
    snap.docs.forEach(function (d) {
      if (d.id.indexOf(sessionId) === 0) return;
      ((d.data() || {}).entries || []).forEach(function (e) { othersAudit.push(clone(e)); });
    });
    rebuildAudit();
  }
  function rebuildAudit() {
    store.state.audit = othersAudit.concat(myAudit).sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; });
  }
  function cloudStart(db) {
    store.state = blank();
    return new Promise(function (resolve) {
      var keys = COLL.concat(['config', 'audit']), first = {}, pending = keys.length, finished = false;
      var finish = function () {
        if (finished) return; finished = true; clearTimeout(timer);
        if (env.initialised) COLL.forEach(function (c) {            // drop built-in defaults once real data exists
          var k = idKey(c); store.state[c] = store.state[c].filter(function (r) { return synced[c][enc(r[k])] !== undefined; });
        });
        resolve();
      };
      var timer = setTimeout(function () { env.slow = true; finish(); }, 10000);
      var got = function (key, snap) {
        if (snap.metadata && snap.metadata.fromCache === false && env.slow) env.slow = false;
        if (!first[key]) { first[key] = true; if (--pending === 0) finish(); }
        if (finished) changed();
      };
      var fail = function (e) { if (e && e.code === 'revoked') env.readOnly = true; env.slow = true; finish(); changed(); };
      COLL.forEach(function (c) { db.collection(c).onSnapshot(function (snap) { applyCollection(c, snap); got(c, snap); }, fail); });
      db.collection('config').onSnapshot(function (snap) { applyConfig(snap); got('config', snap); }, fail);
      db.collection('audit').onSnapshot(function (snap) { applyAudit(snap); got('audit', snap); }, fail);
    });
  }
  function writeFailed(path, e) {
    var parts = path.split('/');
    if (synced[parts[0]]) delete synced[parts[0]][parts[1]];           // so the next save tries again
    if (parts[0] === 'audit') myAuditWritten = 0;
    var code = e && e.code;
    if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') env.readOnly = true;
    if (store.onWriteError) store.onWriteError(code === 'quota_exceeded' ? 'The shared database is full. Remove old records or move to the server version.'
      : env.readOnly ? 'You have view-only access to this page, so your changes are not saved. Ask the owner for Contributor access.'
        : 'A change could not be saved to the shared database. It will be retried on your next change.');
  }
  /* One write at a time per document; a transient failure is retried once. */
  function queue(path, op) {
    inFlight[path] = (inFlight[path] || 0) + 1;
    var run = function () { return op(cloud.doc(path)); };
    chain[path] = (chain[path] || Promise.resolve()).then(run).catch(function (e) {
      if (e && e.code === 'unavailable') return new Promise(function (r) { setTimeout(r, 600 + Math.random() * 600); }).then(run);
      throw e;
    }).catch(function (e) { writeFailed(path, e); }).then(function () { inFlight[path]--; });
    return chain[path];
  }
  function cloudSave() {
    var s = store.state, jobs = [];
    COLL.forEach(function (c) {
      var k = idKey(c), present = {};
      s[c].forEach(function (r) {
        var id = enc(r[k]), body = clone(r), j = stable(body); present[id] = true;
        if (synced[c][id] !== j) { synced[c][id] = j; jobs.push(queue(c + '/' + id, function (ref) { return ref.set(body); })); }
      });
      if (fullSync) Object.keys(synced[c]).forEach(function (id) {
        if (!present[id]) { delete synced[c][id]; jobs.push(queue(c + '/' + id, function (ref) { return ref.delete(); })); }
      });
    });
    fullSync = false;
    pendingDeletes.splice(0).forEach(function (p) {
      delete synced[p.c][p.id]; jobs.push(queue(p.c + '/' + p.id, function (ref) { return ref.delete(); }));
    });
    [['settings', s.settings], ['meta', s.meta]].forEach(function (x) {
      var body = clone(x[1]), j = stable(body);
      if (synced.config[x[0]] !== j) { synced.config[x[0]] = j; jobs.push(queue('config/' + x[0], function (ref) { return ref.set(body); })); }
    });
    if (myAudit.length !== myAuditWritten) {
      if (myAudit.length - auditPart * 500 > 500) auditPart++;         // keep each log document small
      var entries = myAudit.slice(auditPart * 500); myAuditWritten = myAudit.length;
      jobs.push(queue('audit/' + sessionId + '-' + auditPart, function (ref) { return ref.set({ entries: entries }); }));
    }
    return Promise.all(jobs);
  }

  var store = {
    state: null,
    user: null,
    env: env,
    onRemoteChange: null,
    onWriteError: null,

    load: function () {
      try { store.user = JSON.parse(localStorage.getItem('naamii-ams-user') || 'null'); } catch (e) { store.user = null; }
      if (!hosted) return localLoad();
      var use = function (name) { return Promise.resolve().then(function () { return window.claude.use(name); }).catch(function () { return null; }); };
      return Promise.all([use('db'), use('downloads'), use('user')]).then(function (caps) {
        env.downloads = caps[1];
        var who = caps[2] && caps[2].me ? Promise.resolve().then(function () { return caps[2].me(); }).catch(function () { return null; }) : Promise.resolve(null);
        return who.then(function (me) {
          env.profileName = me && typeof me.name === 'string' ? me.name : '';
          if (!caps[0]) return localLoad();
          cloud = caps[0]; env.shared = true;
          return cloudStart(cloud);
        });
      });
    },

    /* Fill in anything missing so older saved data and imported backups keep working. */
    normalise: function (s) {
      var b = blank();
      Object.keys(b).forEach(function (k) { if (s[k] == null) s[k] = b[k]; });
      Object.keys(b.settings).forEach(function (k) { if (s.settings[k] == null) s.settings[k] = b.settings[k]; });
      return s;
    },

    save: function () { return env.shared ? cloudSave() : localSave(); },

    /* Swap in a whole new data set (demo data, restore, clear). In shared mode the audit trail is kept. */
    replaceState: function (next) {
      next = store.normalise(next);
      if (env.shared) { fullSync = true; next.audit = store.state.audit; }
      store.state = next;
    },
    replaceList: function (list) { store.state[list] = []; if (env.shared) fullSync = true; },
    remove: function (list, id) {
      var k = idKey(list);
      store.state[list] = store.state[list].filter(function (r) { return r[k] !== id; });
      if (env.shared) pendingDeletes.push({ c: list, id: enc(id) });
    },

    setUser: function (u) { store.user = u; try { localStorage.setItem('naamii-ams-user', JSON.stringify(u)); } catch (e) { /* not remembered */ } },
    can: function (perm) { return !!store.user && (AMS.PERMISSIONS[store.user.role] || []).indexOf(perm) >= 0; },

    audit: function (action, entity, id, detail) {
      var entry = {
        at: new Date().toISOString(), user: store.user ? store.user.name : '', role: store.user ? AMS.ROLES[store.user.role] : '',
        action: action, entity: entity, id: id || '', detail: detail || ''
      };
      if (env.shared) { myAudit.push(entry); rebuildAudit(); return; }
      store.state.audit.push(entry);
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

  /* Hand a generated file to the person: the artifact's download prompt when hosted in Claude, a normal browser download otherwise. */
  AMS.saveFile = function (filename, blob) {
    if (hosted) {
      if (!env.downloads) return Promise.reject({ code: 'unavailable' });
      return env.downloads.save({ filename: filename, data: blob });
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    return Promise.resolve({ status: 'saved' });
  };

  AMS.store = store;
  AMS.blankState = blank;
})();
