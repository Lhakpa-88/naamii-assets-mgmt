/* User interface: routing, screens, forms and workflows. */
(function () {
  var S = AMS.store, D = AMS.dep, O = AMS.OPTIONS;
  var main = document.getElementById('main'), modal = document.getElementById('modal');
  var filters = { q: '', project: '', category: '', ownership: '', status: 'active', location: '', mine: null };
  var listFilter = { maintenance: 'open', disposals: 'all' };
  var depFy = null, pendingImport = null;

  /* ---------- helpers ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function money(n) {
    if (n === '' || n == null || !isFinite(Number(n))) return '';
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function today() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function st() { return S.state; }
  function nameOf(list, code) { var r = S.find(list, code, 'code'); return r ? r.name : (code || ''); }
  function isExited(a) { return AMS.EXITED.indexOf(a.status) >= 0; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }
  function badge(text) {
    var cls = { 'In use': 'ok', 'In store': '', 'Under maintenance': 'warn', 'Damaged': 'bad', 'Lost / stolen': 'bad',
      'Handed over': 'off', 'Returned to funder': 'off', 'Disposed': 'off', 'NAAMII': 'own',
      'Open': 'warn', 'In progress': 'warn', 'Completed': 'ok', 'Beyond repair': 'bad',
      'Proposed': 'warn', 'Approved': 'ok', 'Rejected': 'off', 'Active': 'ok', 'Closed': 'off' }[text] || '';
    return text ? '<span class="badge ' + cls + '">' + esc(text) + '</span>' : '';
  }
  function table(headers, rows, emptyText) {
    var h = '<div class="table-wrap"><table><thead><tr>' + headers.map(function (x) {
      var numeric = typeof x === 'object';
      return '<th' + (numeric ? ' class="num"' : '') + '>' + esc(numeric ? x.t : x) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="empty" colspan="' + headers.length + '">' + esc(emptyText || 'Nothing to show yet.') + '</td></tr>';
    return h + rows.join('') + '</tbody></table></div>';
  }
  function tr(cells, attrs) {
    return '<tr ' + (attrs || '') + '>' + cells.map(function (c) {
      return c && typeof c === 'object' ? '<td class="num">' + c.n + '</td>' : '<td>' + (c == null ? '' : c) + '</td>';
    }).join('') + '</tr>';
  }
  function n(v) { return { n: money(v) }; }
  function optionList(list, selected, blank) {
    return (blank ? '<option value="">' + esc(blank === true ? '' : blank) + '</option>' : '') + list.map(function (o) {
      var v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected == null ? '' : selected) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }
  function refOptions(list) { return st()[list].map(function (r) { return { v: r.code, l: r.code + ' — ' + r.name }; }); }
  function assetOptions(includeExited) {
    return st().assets.filter(function (a) { return includeExited || !isExited(a); }).map(function (a) { return { v: a.id, l: a.id + ' — ' + a.name }; });
  }

  /* ---------- generic form ---------- */
  function fieldHtml(f, v) {
    var id = 'f_' + f.key, req = f.required ? ' required' : '', input;
    if (f.type === 'ref') input = '<select id="' + id + '" name="' + f.key + '"' + req + '>' + optionList(refOptions(f.ref), v, true) + '</select>';
    else if (f.type === 'select') input = '<select id="' + id + '" name="' + f.key + '"' + req + '>' + optionList(f.list || O[f.options], v, !f.required || !v) + '</select>';
    else if (f.type === 'asset') input = '<select id="' + id + '" name="' + f.key + '"' + req + '>' + optionList(assetOptions(), v, 'Select an asset') + '</select>';
    else if (f.type === 'textarea') input = '<textarea id="' + id + '" name="' + f.key + '"' + req + '>' + esc(v) + '</textarea>';
    else input = '<input id="' + id + '" name="' + f.key + '" type="' + (f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text') + '"' +
      (f.type === 'number' ? ' step="any" min="0"' : '') + ' value="' + esc(v) + '"' + req + (f.readonly ? ' readonly' : '') + '>';
    return '<div class="f' + (f.type === 'textarea' ? ' wide' : '') + '" data-field="' + f.key + '"><label for="' + id + '">' + esc(f.label) +
      (f.required ? ' <i>*</i>' : '') + '</label>' + input + (f.help ? '<small>' + esc(f.help) + '</small>' : '') + '</div>';
  }
  function formHtml(fields, values) {
    var groups = [], by = {};
    fields.forEach(function (f) { var g = f.group || ''; if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(f); });
    return groups.map(function (g) {
      var inner = '<div class="grid">' + by[g].map(function (f) { return fieldHtml(f, values[f.key]); }).join('') + '</div>';
      return g ? '<fieldset data-group="' + esc(g) + '"><legend>' + esc(g) + '</legend>' + inner + '</fieldset>' : inner;
    }).join('');
  }
  function readForm(form, fields) {
    var out = {};
    fields.forEach(function (f) {
      var el = form.elements[f.key]; if (!el) return;
      var v = el.value.trim();
      out[f.key] = f.type === 'number' ? (v === '' ? '' : Number(v)) : v;
    });
    return out;
  }
  /* onSubmit returns an error message to keep the dialog open, or nothing to save and close. */
  function openModal(title, body, onSubmit, okLabel) {
    modal.innerHTML = '<form method="dialog" novalidate><div class="m-head">' + esc(title) + '</div><div class="m-body">' + body + '</div>' +
      '<div class="m-foot"><span class="m-err" role="alert"></span><button type="button" class="btn" data-close>Cancel</button>' +
      (onSubmit ? '<button type="submit" class="btn primary">' + esc(okLabel || 'Save') + '</button>' : '') + '</div></form>';
    var form = modal.querySelector('form');
    modal.querySelector('[data-close]').onclick = function () { modal.close(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var bad = form.querySelector(':invalid');
      if (bad) { modal.querySelector('.m-err').textContent = 'Please complete the required fields.'; bad.focus(); return; }
      var err = onSubmit(form);
      if (err) { modal.querySelector('.m-err').textContent = err; return; }
      modal.close(); S.save(); render();
    };
    if (!modal.open) modal.showModal();
    return form;
  }
  function confirmModal(title, message, fn, okLabel) {
    openModal(title, '<p>' + esc(message) + '</p>', function () { fn(); }, okLabel || 'Confirm');
  }

  /* ---------- user ---------- */
  function userModal() {
    var u = S.user || { name: '', role: 'logistics' };
    openModal('Who is using the system?', '<p class="sub">Your name is stamped on every record you add or change. Screens adapt to your role.</p><div class="grid">' +
      fieldHtml({ key: 'name', label: 'Your name', type: 'text', required: true }, u.name) +
      fieldHtml({ key: 'role', label: 'Role', type: 'select', required: true,
        list: Object.keys(AMS.ROLES).map(function (k) { return { v: k, l: AMS.ROLES[k] }; }) }, u.role) + '</div>',
    function (form) {
      S.setUser({ name: form.elements.name.value.trim(), role: form.elements.role.value });
      filters.mine = null;
    }, 'Continue');
    if (!S.user) modal.querySelector('[data-close]').style.display = 'none';
  }
  function myProjects() {
    if (!S.user) return [];
    var me = S.user.name.trim().toLowerCase();
    return st().projects.filter(function (p) { return (p.manager || '').trim().toLowerCase() === me; }).map(function (p) { return p.code; });
  }

  /* ---------- asset form ---------- */
  function assetModal(id, preset) {
    var existing = id ? S.find('assets', id) : null;
    var v = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({ status: 'In use', condition: 'Good', acquisitionMode: 'Purchased',
      fundingType: 'Unrestricted / core', ownership: 'NAAMII', endOfProjectTerm: 'Not applicable', acquisitionDate: today() }, preset || {});
    var fields = AMS.ASSET_FIELDS.map(function (f) { return f.key === 'id' && existing ? Object.assign({}, f, { readonly: true, help: '' }) : f; });
    var form = openModal(existing ? 'Edit asset ' + existing.id : 'Register a new asset',
      '<div class="note" id="treat-note"></div>' + formHtml(fields, v), function (form) {
        var rec = readForm(form, AMS.ASSET_FIELDS), now = new Date().toISOString();
        if (rec.ownership === 'NAAMII') {
          var cat = S.find('categories', rec.categoryCode, 'code') || {};
          if (!rec.itaBlock) rec.itaBlock = cat.itaBlock || '';
          if (rec.usefulLifeYears === '') rec.usefulLifeYears = cat.usefulLifeYears || '';
          if (D.depBase(rec) > 0 && !(rec.usefulLifeYears > 0)) return 'Useful life is needed for a NAAMII-owned asset.';
        }
        if (rec.depStartDate && rec.depStartDate < rec.acquisitionDate) return 'Depreciation cannot start before the acquisition date.';
        if (existing) {
          if (rec.locationCode !== existing.locationCode || rec.custodian !== existing.custodian) {
            S.addMovement({ assetId: existing.id, date: today(), type: 'Custody / location change', fromLocation: existing.locationCode, toLocation: rec.locationCode,
              fromCustodian: existing.custodian, toCustodian: rec.custodian, details: 'Changed through the asset form', ref: '' });
          }
          var changed = AMS.ASSET_FIELDS.filter(function (f) { return String(existing[f.key] == null ? '' : existing[f.key]) !== String(rec[f.key]); }).map(function (f) { return f.label; });
          Object.assign(existing, rec, { updatedAt: now });
          S.audit('Update', 'Asset', existing.id, changed.length ? 'Changed: ' + changed.join(', ') : 'No field changes');
        } else {
          if (rec.id && S.find('assets', rec.id)) return 'Asset ID ' + rec.id + ' is already in use.';
          if (!rec.id) rec.id = S.assetId(rec.categoryCode);
          rec.createdAt = rec.updatedAt = now; rec.createdBy = S.user.name;
          st().assets.push(rec);
          if (rec.acquisitionMode !== 'Purchased') {
            S.addMovement({ assetId: rec.id, date: rec.acquisitionDate, type: 'Received in', fromLocation: '', toLocation: rec.locationCode,
              fromCustodian: rec.receivedFrom, toCustodian: rec.custodian, details: rec.acquisitionMode + (rec.receivedFrom ? ' — ' + rec.receivedFrom : ''), ref: rec.agreementRef });
          }
          S.audit('Create', 'Asset', rec.id, rec.name + ' — ' + D.treatment(rec, st().settings));
          toast('Asset ' + rec.id + ' registered.');
          location.hash = '#/asset/' + encodeURIComponent(rec.id);
        }
      });

    function sync() {
      var own = form.elements.ownership.value, depSet = form.querySelector('fieldset[data-group^="Depreciation"]');
      depSet.style.display = own === 'NAAMII' ? '' : 'none';
      form.querySelector('[data-field=receivedFrom]').style.display = form.elements.acquisitionMode.value === 'Purchased' ? 'none' : '';
      var note = form.querySelector('#treat-note');
      note.className = 'note' + (own === 'NAAMII' ? '' : ' warn');
      note.textContent = own === 'NAAMII'
        ? 'Title is with NAAMII: the asset is capitalised and depreciated from the start date below.'
        : 'Title is with the ' + (own === 'Funder' ? 'funder' : 'partner / third party') + ': the purchase is charged to the project as an expense. The asset is kept here as a memo record and is not depreciated.';
    }
    form.elements.projectCode.addEventListener('change', function () {
      var p = S.find('projects', this.value, 'code');
      if (p) {
        form.elements.fundingType.value = p.fundingType || form.elements.fundingType.value;
        form.elements.funder.value = p.funder || '';
        if (p.defaultOwnership) form.elements.ownership.value = p.defaultOwnership;
        if (p.assetTerm) form.elements.endOfProjectTerm.value = p.assetTerm;
        if (p.agreementRef) form.elements.agreementRef.value = p.agreementRef;
      }
      sync();
    });
    form.elements.categoryCode.addEventListener('change', function () {
      var c = S.find('categories', this.value, 'code');
      if (c) { form.elements.itaBlock.value = c.itaBlock || ''; form.elements.usefulLifeYears.value = c.usefulLifeYears || ''; }
    });
    form.elements.ownership.addEventListener('change', sync);
    form.elements.acquisitionMode.addEventListener('change', sync);
    sync();
  }

  /* ---------- workflows on an asset ---------- */
  function moveModal(assetId) {
    var fields = [
      { key: 'assetId', label: 'Asset', type: 'asset', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'toLocation', label: 'New location', type: 'ref', ref: 'locations' },
      { key: 'toCustodian', label: 'New custodian', type: 'text' },
      { key: 'status', label: 'Status after move', type: 'select', list: ['In use', 'In store'], required: true },
      { key: 'ref', label: 'Handover / gate pass ref', type: 'text' },
      { key: 'details', label: 'Details', type: 'textarea' }
    ];
    var a0 = assetId ? S.find('assets', assetId) : null;
    openModal('Record a transfer or movement', formHtml(fields, { assetId: assetId || '', date: today(), status: a0 && a0.status === 'In store' ? 'In store' : 'In use',
      toLocation: a0 ? a0.locationCode : '', toCustodian: a0 ? a0.custodian : '' }), function (form) {
      var r = readForm(form, fields), a = S.find('assets', r.assetId);
      if (!a) return 'Select an asset.';
      if (r.toLocation === (a.locationCode || '') && r.toCustodian === (a.custodian || '') && r.status === a.status) return 'Nothing has changed — update the location, custodian or status.';
      S.addMovement({ assetId: a.id, date: r.date, type: 'Custody / location change', fromLocation: a.locationCode, toLocation: r.toLocation,
        fromCustodian: a.custodian, toCustodian: r.toCustodian, details: r.details + (r.status !== a.status ? ' [Status: ' + a.status + ' → ' + r.status + ']' : ''), ref: r.ref });
      a.locationCode = r.toLocation; a.custodian = r.toCustodian; a.status = r.status; a.updatedAt = new Date().toISOString();
      S.audit('Move', 'Asset', a.id, 'To ' + (r.toLocation || '-') + ' / ' + (r.toCustodian || '-'));
    });
  }

  function verifyModal(assetId) {
    var a = S.find('assets', assetId);
    var fields = [
      { key: 'date', label: 'Verification date', type: 'date', required: true },
      { key: 'found', label: 'Result', type: 'select', list: ['Found at recorded location', 'Found elsewhere', 'Not found'], required: true },
      { key: 'condition', label: 'Condition', type: 'select', options: 'condition', required: true },
      { key: 'details', label: 'Remarks', type: 'textarea' }
    ];
    openModal('Physical verification — ' + a.id, formHtml(fields, { date: today(), found: 'Found at recorded location', condition: a.condition || 'Good' }), function (form) {
      var r = readForm(form, fields);
      S.addMovement({ assetId: a.id, date: r.date, type: 'Physical verification', fromLocation: a.locationCode, toLocation: a.locationCode,
        fromCustodian: a.custodian, toCustodian: a.custodian, details: r.found + '; condition ' + r.condition + (r.details ? '. ' + r.details : ''), ref: '' });
      a.lastVerifiedDate = r.date; a.condition = r.condition; a.updatedAt = new Date().toISOString();
      S.audit('Verify', 'Asset', a.id, r.found);
    });
  }

  function titleModal(assetId) {
    var a = S.find('assets', assetId), cat = S.find('categories', a.categoryCode, 'code') || {};
    var fields = [
      { key: 'date', label: 'Date title passes to NAAMII', type: 'date', required: true },
      { key: 'value', label: 'Take-on value (NPR)', type: 'number', required: true,
        help: 'The purchase was already expensed to the project. Enter the value at which NAAMII brings the asset onto its books (nil, nominal or fair value) as per the accounting policy and auditor advice' },
      { key: 'usefulLifeYears', label: 'Remaining useful life (years)', type: 'number', required: true },
      { key: 'itaBlock', label: 'ITA block', type: 'select', options: 'itaBlock', required: true },
      { key: 'ref', label: 'Funder letter / agreement clause', type: 'text', required: true },
      { key: 'details', label: 'Remarks', type: 'textarea' }
    ];
    openModal('Transfer title to NAAMII — ' + a.id,
      '<div class="note">Use this when the funder confirms that ownership vests in NAAMII (usually at project close). From this date the asset is treated as NAAMII-owned and depreciation starts on the take-on value.</div>' +
      formHtml(fields, { date: today(), value: '', usefulLifeYears: cat.usefulLifeYears || '', itaBlock: cat.itaBlock || 'D' }), function (form) {
        var r = readForm(form, fields);
        if (r.date < a.acquisitionDate) return 'The transfer date cannot be before the acquisition date.';
        if (r.value > 0 && !(r.usefulLifeYears > 0)) return 'Enter the remaining useful life.';
        S.addMovement({ assetId: a.id, date: r.date, type: 'Title transfer to NAAMII', fromLocation: a.locationCode, toLocation: a.locationCode, fromCustodian: a.custodian, toCustodian: a.custodian,
          details: 'Ownership: ' + a.ownership + ' → NAAMII. Take-on value NPR ' + money(r.value) + (r.details ? '. ' + r.details : ''), ref: r.ref });
        Object.assign(a, { ownership: 'NAAMII', depStartDate: r.date, depBaseValue: r.value, usefulLifeYears: r.usefulLifeYears, residualValue: 0, itaBlock: r.itaBlock, updatedAt: new Date().toISOString() });
        S.audit('Title transfer', 'Asset', a.id, 'Now NAAMII-owned; take-on value ' + money(r.value) + '; ref ' + r.ref);
      }, 'Transfer title');
  }

  function maintenanceModal(assetId) {
    var fields = [
      { key: 'assetId', label: 'Asset', type: 'asset', required: true },
      { key: 'reportedDate', label: 'Date reported', type: 'date', required: true },
      { key: 'type', label: 'Type', type: 'select', options: 'maintenanceType', required: true },
      { key: 'assetStatus', label: 'Set asset status to', type: 'select', list: ['Under maintenance', 'Damaged', 'Lost / stolen', 'No change'], required: true },
      { key: 'issue', label: 'Issue / work needed', type: 'textarea', required: true },
      { key: 'serviceProvider', label: 'Service provider', type: 'text' },
      { key: 'cost', label: 'Estimated cost (NPR)', type: 'number' },
      { key: 'chargedTo', label: 'Charge cost to project', type: 'ref', ref: 'projects' }
    ];
    var form = openModal('Report maintenance or damage', formHtml(fields, { assetId: assetId || '', reportedDate: today(), type: 'Repair', assetStatus: 'Under maintenance' }), function (form) {
      var r = readForm(form, fields), a = S.find('assets', r.assetId);
      if (!a) return 'Select an asset.';
      var rec = { id: S.seqId('maintenance', 'MNT', 5), assetId: a.id, reportedDate: r.reportedDate, type: r.type, issue: r.issue, reportedBy: S.user.name,
        serviceProvider: r.serviceProvider, cost: r.cost, chargedTo: r.chargedTo, status: 'Open', completedDate: '', remarks: '', prevStatus: a.status };
      st().maintenance.push(rec);
      if (r.assetStatus !== 'No change') { a.status = r.assetStatus; if (r.assetStatus === 'Damaged') a.condition = 'Not working'; a.updatedAt = new Date().toISOString(); }
      S.audit('Create', 'Maintenance', rec.id, a.id + ' — ' + r.type);
    });
    form.elements.type.addEventListener('change', function () {
      form.elements.assetStatus.value = { 'Repair': 'Under maintenance', 'Damage report': 'Damaged' }[this.value] || 'No change';
    });
  }

  function maintenanceUpdateModal(id) {
    var m = S.find('maintenance', id), a = S.find('assets', m.assetId);
    var fields = [
      { key: 'status', label: 'Status', type: 'select', options: 'maintenanceStatus', required: true },
      { key: 'completedDate', label: 'Completed date', type: 'date' },
      { key: 'serviceProvider', label: 'Service provider', type: 'text' },
      { key: 'cost', label: 'Actual cost (NPR)', type: 'number' },
      { key: 'chargedTo', label: 'Charge cost to project', type: 'ref', ref: 'projects' },
      { key: 'assetStatus', label: 'Asset status after this update', type: 'select', list: ['In use', 'In store', 'Under maintenance', 'Damaged'], required: true },
      { key: 'remarks', label: 'Work done / remarks', type: 'textarea' }
    ];
    var back = ['In use', 'In store'].indexOf(m.prevStatus) >= 0 ? m.prevStatus : 'In use';
    var form = openModal('Update ' + m.id + ' — ' + m.assetId, '<div class="note">' + esc(m.issue) + '</div>' +
      formHtml(fields, Object.assign({}, m, { assetStatus: a ? a.status : 'In use' })), function (form) {
      var r = readForm(form, fields);
      if (r.status === 'Completed' && !r.completedDate) return 'Enter the completed date.';
      if (r.completedDate && r.completedDate < m.reportedDate) return 'Completed date cannot be before the reported date.';
      Object.assign(m, { status: r.status, completedDate: r.completedDate, serviceProvider: r.serviceProvider, cost: r.cost, chargedTo: r.chargedTo, remarks: r.remarks });
      if (a && !isExited(a)) {
        a.status = r.assetStatus;
        if (r.status === 'Completed') a.condition = 'Good';
        if (r.status === 'Beyond repair') a.condition = 'Not working';
        a.updatedAt = new Date().toISOString();
      }
      S.audit('Update', 'Maintenance', m.id, r.status + (r.cost !== '' ? '; cost ' + money(r.cost) : ''));
      if (r.status === 'Beyond repair') toast('Marked beyond repair. Propose a disposal from the asset page when ready.');
    });
    form.elements.status.addEventListener('change', function () {
      form.elements.assetStatus.value = this.value === 'Completed' ? back : this.value === 'Beyond repair' ? 'Damaged' : form.elements.assetStatus.value;
      if (this.value === 'Completed' && !form.elements.completedDate.value) form.elements.completedDate.value = today();
    });
  }

  function openDisposal(assetId) {
    return st().disposals.filter(function (d) { return d.assetId === assetId && (d.status === 'Proposed' || d.status === 'Approved'); })[0];
  }
  function disposalModal(assetId) {
    var fields = [
      { key: 'assetId', label: 'Asset', type: 'asset', required: true },
      { key: 'method', label: 'Method', type: 'select', options: 'disposalMethod', required: true },
      { key: 'proposedDate', label: 'Date proposed', type: 'date', required: true },
      { key: 'recipient', label: 'Intended buyer / recipient', type: 'text', help: 'Organisation receiving a donation, handover or return; leave blank for auction or scrap' },
      { key: 'funderApprovalRef', label: 'Funder instruction / approval ref', type: 'text', help: 'Needed before approval when title is not with NAAMII' },
      { key: 'reason', label: 'Reason', type: 'textarea', required: true }
    ];
    openModal('Propose disposal or handover', '<div class="note">Auction, donation and scrap remove the asset permanently. Handover and return are for assets a funder asks NAAMII to pass on or give back. Every proposal needs Administration approval.</div>' +
      formHtml(fields, { assetId: assetId || '', proposedDate: today(), method: '' }), function (form) {
      var r = readForm(form, fields), a = S.find('assets', r.assetId);
      if (!a) return 'Select an asset.';
      if (openDisposal(a.id)) return 'This asset already has an open proposal (' + openDisposal(a.id).id + ').';
      if (r.method === 'Return to funder' && a.ownership === 'NAAMII') return 'This asset is NAAMII-owned, so it cannot be returned to a funder. Choose another method.';
      var rec = Object.assign({ id: S.seqId('disposals', 'DSP', 5), status: 'Proposed', proposedBy: S.user.name, approvedBy: '', approvedDate: '', completedDate: '',
        proceeds: '', disposalCost: '', bookValueAtDisposal: '', gainLoss: '', documentRef: '', remarks: '' }, r);
      st().disposals.push(rec);
      S.audit('Propose', 'Disposal', rec.id, a.id + ' — ' + r.method);
      toast('Proposal ' + rec.id + ' sent for approval.');
    }, 'Submit proposal');
  }

  function approveModal(id, approve) {
    var d = S.find('disposals', id), a = S.find('assets', d.assetId) || {}, needRef = a.ownership !== 'NAAMII';
    var fields = approve ? [
      { key: 'approvedDate', label: 'Approval date', type: 'date', required: true },
      { key: 'funderApprovalRef', label: 'Funder / owner written approval ref' + (needRef ? ' (required)' : ''), type: 'text' },
      { key: 'remarks', label: 'Approval remarks', type: 'textarea' }
    ] : [{ key: 'remarks', label: 'Reason for rejection', type: 'textarea', required: true }];
    openModal((approve ? 'Approve ' : 'Reject ') + d.id, '<p><strong>' + esc(d.assetId) + ' — ' + esc(a.name) + '</strong><br>' + esc(d.method) + ' · proposed by ' + esc(d.proposedBy) + ' · ' + esc(d.reason) + '</p>' +
      (approve && needRef ? '<div class="note warn">Title is with the ' + esc(a.ownership === 'Funder' ? 'funder (' + (a.funder || 'not recorded') + ')' : 'partner') + '. Record their written approval or instruction before approving.</div>' : '') +
      formHtml(fields, { approvedDate: today(), funderApprovalRef: d.funderApprovalRef, remarks: '' }), function (form) {
      var r = readForm(form, fields);
      if (approve) {
        if (needRef && !r.funderApprovalRef) return 'Enter the funder / owner approval reference first.';
        if (r.approvedDate < d.proposedDate) return 'Approval date cannot be before the proposal date.';
        Object.assign(d, { status: 'Approved', approvedBy: S.user.name, approvedDate: r.approvedDate, funderApprovalRef: r.funderApprovalRef, remarks: r.remarks });
      } else Object.assign(d, { status: 'Rejected', approvedBy: S.user.name, approvedDate: today(), remarks: r.remarks });
      S.audit(approve ? 'Approve' : 'Reject', 'Disposal', d.id, d.assetId + ' — ' + d.method);
    }, approve ? 'Approve' : 'Reject');
  }

  function completeModal(id) {
    var d = S.find('disposals', id), a = S.find('assets', d.assetId), cap = D.isCapitalised(a, st().settings);
    var needRecipient = ['Auction', 'Donation', 'Handover to third party', 'Return to funder'].indexOf(d.method) >= 0;
    var fields = [
      { key: 'completedDate', label: 'Date completed', type: 'date', required: true },
      { key: 'recipient', label: d.method === 'Auction' ? 'Buyer' : d.method === 'Scrap' ? 'Scrap dealer (if sold)' : 'Recipient organisation', type: 'text', required: needRecipient },
      { key: 'proceeds', label: 'Proceeds received (NPR)', type: 'number', help: 'Auction or scrap sale amount; leave blank if none' },
      { key: 'disposalCost', label: 'Cost of disposal (NPR)', type: 'number' },
      { key: 'documentRef', label: 'Document ref', type: 'text', required: true, help: 'Auction record, donation letter, handover certificate or scrap note' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' }
    ];
    openModal('Complete ' + d.id + ' — ' + d.method, '<p><strong>' + esc(a.id) + ' — ' + esc(a.name) + '</strong></p>' +
      (cap ? '<div class="note">NAAMII-owned asset: the system will work out the book value on the completion date and the gain or loss.</div>'
        : '<div class="note warn">Memo asset (title not with NAAMII): no gain or loss is booked. Any sale proceeds belong to the owner unless the agreement says otherwise.</div>') +
      formHtml(fields, { completedDate: today(), recipient: d.recipient, proceeds: '', disposalCost: '', documentRef: '', remarks: d.remarks }), function (form) {
      var r = readForm(form, fields);
      if (r.completedDate < d.approvedDate) return 'Completion date cannot be before the approval date.';
      var nbv = cap ? D.netBookValue(a, r.completedDate) : '';
      Object.assign(d, r, { status: 'Completed', bookValueAtDisposal: nbv,
        gainLoss: cap ? D.round2(D.num(r.proceeds) - D.num(r.disposalCost) - nbv) : '' });
      a.status = AMS.EXIT_STATUS_BY_METHOD[d.method]; a.updatedAt = new Date().toISOString();
      S.addMovement({ assetId: a.id, date: r.completedDate, type: 'Status change', fromLocation: a.locationCode, toLocation: '', fromCustodian: a.custodian, toCustodian: r.recipient,
        details: d.method + ' completed (' + d.id + ')', ref: r.documentRef });
      S.audit('Complete', 'Disposal', d.id, a.id + ' — ' + d.method + (cap ? '; NBV ' + money(nbv) + '; gain/(loss) ' + money(d.gainLoss) : ''));
    }, 'Mark completed');
  }

  /* ---------- masters ---------- */
  var MASTER = {
    projects: { fields: AMS.PROJECT_FIELDS, label: 'project', perm: 'project.edit', usedBy: function (c) { return st().assets.some(function (a) { return a.projectCode === c; }); } },
    locations: { fields: AMS.LOCATION_FIELDS, label: 'location', perm: 'setup.edit', usedBy: function (c) { return st().assets.some(function (a) { return a.locationCode === c; }); } },
    categories: { fields: AMS.CATEGORY_FIELDS, label: 'category', perm: 'setup.edit', usedBy: function (c) { return st().assets.some(function (a) { return a.categoryCode === c; }); } }
  };
  function masterModal(list, code) {
    var def = MASTER[list], existing = code ? S.find(list, code, 'code') : null;
    var fields = def.fields.map(function (f) { return f.key === 'code' && existing ? Object.assign({}, f, { readonly: true }) : f; });
    var defaults = list === 'projects' ? { status: 'Active', fundingType: 'Restricted grant', defaultOwnership: 'Funder', assetTerm: 'To be confirmed' } : {};
    openModal((existing ? 'Edit ' : 'Add ') + def.label, formHtml(fields, existing || defaults), function (form) {
      var r = readForm(form, def.fields);
      r.code = r.code.toUpperCase().replace(/\s+/g, '-');
      if (!existing && S.find(list, r.code, 'code')) return 'Code ' + r.code + ' already exists.';
      if (r.startDate && r.endDate && r.endDate < r.startDate) return 'End date cannot be before the start date.';
      if (existing) Object.assign(existing, r); else st()[list].push(r);
      S.audit(existing ? 'Update' : 'Create', def.label, r.code, r.name);
    });
  }
  function masterDelete(list, code) {
    var def = MASTER[list];
    if (def.usedBy(code)) { toast('This ' + def.label + ' is used by assets and cannot be deleted.'); return; }
    confirmModal('Delete ' + def.label, 'Delete ' + code + '? This cannot be undone.', function () {
      st()[list] = st()[list].filter(function (r) { return r.code !== code; });
      S.audit('Delete', def.label, code, '');
    }, 'Delete');
  }

  /* ---------- views ---------- */
  function alerts() {
    var s = st(), t = today(), out = [];
    s.projects.forEach(function (p) {
      var ended = p.status === 'Closed' || (p.endDate && p.endDate < t);
      if (!ended) return;
      var pending = s.assets.filter(function (a) { return a.projectCode === p.code && a.ownership !== 'NAAMII' && !isExited(a) && !openDisposal(a.id); });
      if (pending.length) out.push({ html: '<strong>' + esc(p.code) + '</strong> has ended and ' + pending.length + ' funder/partner-owned asset(s) still await a decision (title transfer, handover or return). <a href="#/assets" data-action="filter-project" data-id="' + esc(p.code) + '">View</a>' });
    });
    var prop = s.disposals.filter(function (d) { return d.status === 'Proposed'; }).length;
    if (prop) out.push({ html: prop + ' disposal / handover proposal(s) awaiting Administration approval. <a href="#/disposals">Review</a>' });
    var appr = s.disposals.filter(function (d) { return d.status === 'Approved'; }).length;
    if (appr) out.push({ html: appr + ' approved disposal(s) not yet completed. <a href="#/disposals">Open</a>' });
    var old = s.maintenance.filter(function (m) { return (m.status === 'Open' || m.status === 'In progress') && D.daysBetween(m.reportedDate, t) > 30; }).length;
    if (old) out.push({ html: old + ' maintenance job(s) open for more than 30 days. <a href="#/maintenance">Open</a>' });
    var war = s.assets.filter(function (a) { return !isExited(a) && a.warrantyExpiry && a.warrantyExpiry >= t && D.daysBetween(t, a.warrantyExpiry) <= 60; });
    if (war.length) out.push({ info: true, html: 'Warranty ends within 60 days: ' + war.map(function (a) { return '<a href="#/asset/' + encodeURIComponent(a.id) + '">' + esc(a.id) + '</a>'; }).join(', ') });
    var unv = s.assets.filter(function (a) { return !isExited(a) && (!a.lastVerifiedDate || D.daysBetween(a.lastVerifiedDate, t) > 365); }).length;
    if (unv) out.push({ info: true, html: unv + ' active asset(s) have no physical verification in the last 12 months.' });
    return out;
  }

  function viewDashboard() {
    var s = st(), t = today(), active = s.assets.filter(function (a) { return !isExited(a); });
    var owned = active.filter(function (a) { return D.isCapitalised(a, s.settings); });
    var memo = active.filter(function (a) { return a.ownership !== 'NAAMII'; });
    var sum = function (list, fn) { return list.reduce(function (x, a) { return x + D.num(fn(a)); }, 0); };
    var attention = active.filter(function (a) { return ['Under maintenance', 'Damaged', 'Lost / stolen'].indexOf(a.status) >= 0; });
    var group = function (key, labels) {
      return labels.map(function (l) {
        var g = active.filter(function (a) { return a[key] === l; });
        return tr([esc(l), { n: g.length }, n(sum(g, function (a) { return a.cost; }))]);
      });
    };
    var al = alerts();
    return '<h1>Dashboard</h1><p class="sub">Assets in NAAMII custody as at ' + t + '. Exited assets (disposed, handed over, returned) are excluded.</p>' +
      '<div class="cards">' +
      '<div class="card"><div class="k">Assets in custody</div><div class="v">' + active.length + '</div><div class="n">Cost NPR ' + money(sum(active, function (a) { return a.cost; })) + '</div></div>' +
      '<div class="card"><div class="k">NAAMII-owned, capitalised</div><div class="v">' + owned.length + '</div><div class="n">Net book value NPR ' + money(sum(owned, function (a) { return D.netBookValue(a, t); })) + '</div></div>' +
      '<div class="card"><div class="k">Funder / partner-owned</div><div class="v">' + memo.length + '</div><div class="n">Memo cost NPR ' + money(sum(memo, function (a) { return a.cost; })) + ' · not depreciated</div></div>' +
      '<div class="card"><div class="k">Needs attention</div><div class="v">' + attention.length + '</div><div class="n">Under maintenance, damaged or lost</div></div>' +
      '</div>' +
      '<h2>Action items</h2><div class="panel">' + (al.length ? '<ul class="alerts">' + al.map(function (x) { return '<li' + (x.info ? ' class="info"' : '') + '>' + x.html + '</li>'; }).join('') + '</ul>' : 'Nothing needs attention right now.') + '</div>' +
      '<div class="cols"><div><h2>By funding type</h2>' + table(['Funding type', { t: 'Assets' }, { t: 'Cost (NPR)' }], group('fundingType', O.fundingType)) + '</div>' +
      '<div><h2>By ownership</h2>' + table(['Title held by', { t: 'Assets' }, { t: 'Cost (NPR)' }], group('ownership', O.ownership)) + '</div>' +
      '<div><h2>By status</h2>' + table(['Status', { t: 'Assets' }, { t: 'Cost (NPR)' }], O.status.map(function (l) {
        var g = s.assets.filter(function (a) { return a.status === l; });
        return tr([badge(l), { n: g.length }, n(sum(g, function (a) { return a.cost; }))]);
      })) + '</div></div>';
  }

  function filteredAssets() {
    var f = filters, q = f.q.trim().toLowerCase(), mine = myProjects();
    if (f.mine == null) f.mine = S.user.role === 'pm' && mine.length > 0;
    return st().assets.filter(function (a) {
      if (f.status === 'active' ? isExited(a) : f.status === 'exited' ? !isExited(a) : f.status && a.status !== f.status) return false;
      if (f.project === '(core)' ? a.projectCode : f.project && a.projectCode !== f.project) return false;
      if (f.category && a.categoryCode !== f.category) return false;
      if (f.ownership && a.ownership !== f.ownership) return false;
      if (f.location && a.locationCode !== f.location) return false;
      if (f.mine && mine.indexOf(a.projectCode) < 0) return false;
      if (q && [a.id, a.name, a.serialNo, a.makeModel, a.custodian, a.funder, a.vendor, a.invoiceNo].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function viewAssets() {
    var f = filters, list = filteredAssets(), mine = myProjects();
    var sel = function (key, opts, blank) { return '<select data-filter="' + key + '" aria-label="' + esc(blank) + '">' + optionList(opts, f[key], blank) + '</select>'; };
    var statusOpts = [{ v: 'active', l: 'In custody (all)' }, { v: 'exited', l: 'Exited (all)' }].concat(O.status);
    return '<h1>Asset Register</h1><p class="sub">Every asset in NAAMII custody, whoever holds the title. ' + list.length + ' of ' + st().assets.length + ' shown.</p>' +
      '<div class="bar"><input type="search" data-filter="q" placeholder="Search ID, name, serial, custodian" value="' + esc(f.q) + '" aria-label="Search assets">' +
      sel('project', [{ v: '(core)', l: 'Core / no project' }].concat(refOptions('projects')), 'All projects') +
      sel('category', refOptions('categories'), 'All categories') + sel('ownership', O.ownership, 'All ownership') +
      sel('location', refOptions('locations'), 'All locations') + sel('status', statusOpts, 'Any status') +
      (mine.length ? '<label><input type="checkbox" data-filter="mine"' + (f.mine ? ' checked' : '') + '> My projects only</label>' : '') +
      '<span class="grow"></span>' +
      (S.can('data.export') ? '<button class="btn" data-action="export-list">Export this list</button>' : '') +
      (S.can('asset.edit') ? '<button class="btn primary" data-action="asset-new">Register asset</button>' : '') + '</div>' +
      table(['Asset ID', 'Name', 'Category', 'Project', 'Title', 'Location', 'Custodian', 'Status', { t: 'Cost (NPR)' }], list.map(function (a) {
        return tr([esc(a.id), esc(a.name), esc(a.categoryCode), esc(a.projectCode || 'Core'), badge(a.ownership), esc(nameOf('locations', a.locationCode)), esc(a.custodian), badge(a.status), n(a.cost)],
          'class="link" tabindex="0" data-action="open-asset" data-id="' + esc(a.id) + '"');
      }), st().assets.length ? 'No assets match these filters.' : 'No assets yet. Register the first asset, or import your Excel register from Import / Export.');
  }

  function viewAsset(id) {
    var s = st(), a = S.find('assets', id);
    if (!a) return '<h1>Asset not found</h1><p><a href="#/assets">Back to the register</a></p>';
    var cap = D.isCapitalised(a, s.settings), t = today(), exit = D.exitDates(s.disposals)[a.id], open = openDisposal(a.id);
    var p = S.find('projects', a.projectCode, 'code');
    var cell = function (label, value) { return '<div><span>' + esc(label) + '</span>' + (value || '—') + '</div>'; };
    var acts = [];
    if (!isExited(a)) {
      if (S.can('asset.edit')) acts.push('<button class="btn" data-action="asset-edit" data-id="' + esc(a.id) + '">Edit</button>');
      if (S.can('movement.add')) acts.push('<button class="btn" data-action="move" data-id="' + esc(a.id) + '">Move / reassign</button>');
      if (S.can('verify')) acts.push('<button class="btn" data-action="verify" data-id="' + esc(a.id) + '">Verify</button>');
      if (S.can('maintenance.add')) acts.push('<button class="btn" data-action="maint-new" data-id="' + esc(a.id) + '">Report maintenance / damage</button>');
      if (S.can('title.transfer') && a.ownership !== 'NAAMII') acts.push('<button class="btn dark" data-action="title" data-id="' + esc(a.id) + '">Transfer title to NAAMII</button>');
      if (S.can('disposal.propose') && !open) acts.push('<button class="btn" data-action="disp-new" data-id="' + esc(a.id) + '">Propose disposal / handover</button>');
    }
    acts.push('<button class="btn" data-action="print">Print</button>');

    var accounting = cap
      ? '<div class="detail">' + cell('Treatment', 'Capitalised — NAAMII fixed asset') + cell('Depreciable value', 'NPR ' + money(D.depBase(a))) + cell('Depreciation start', esc(D.depStart(a))) +
        cell('Useful life', esc(a.usefulLifeYears) + ' years, straight-line') + cell('Accumulated depreciation', 'NPR ' + money(D.slAccumulated(a, t, exit))) +
        cell('Net book value today', 'NPR ' + money(exit ? 0 : D.netBookValue(a, t))) + cell('ITA block', esc(a.itaBlock ? 'Block ' + a.itaBlock : '')) + '</div>'
      : '<div class="note' + (a.ownership !== 'NAAMII' ? ' warn' : '') + '">' + esc(D.treatment(a, s.settings)) + '. ' +
        (a.ownership !== 'NAAMII' ? 'Title is with the ' + esc(a.ownership === 'Funder' ? 'funder' + (a.funder ? ' (' + a.funder + ')' : '') : 'partner / third party') +
          '. The cost sits in the expenses of ' + esc(a.projectCode || 'the project') + '; no depreciation is calculated and the asset stays out of the fixed asset schedule.' : '') + '</div>';

    var hist = s.movements.filter(function (m) { return m.assetId === a.id; }).map(function (m) {
      return { d: m.date, row: tr([esc(m.date), esc(m.type), esc([m.fromLocation, m.fromCustodian].filter(Boolean).join(' / ')) + ' → ' + esc([m.toLocation, m.toCustodian].filter(Boolean).join(' / ')), esc(m.details), esc(m.ref), esc(m.by)]) };
    }).concat(s.maintenance.filter(function (m) { return m.assetId === a.id; }).map(function (m) {
      return { d: m.reportedDate, row: tr([esc(m.reportedDate), 'Maintenance: ' + esc(m.type) + ' ' + badge(m.status), '', esc(m.issue) + (m.remarks ? ' — ' + esc(m.remarks) : '') + (m.cost !== '' && m.cost != null ? ' (NPR ' + money(m.cost) + ')' : ''), esc(m.id), esc(m.reportedBy)]) };
    })).concat(s.disposals.filter(function (d) { return d.assetId === a.id; }).map(function (d) {
      return { d: d.proposedDate, row: tr([esc(d.proposedDate), 'Disposal: ' + esc(d.method) + ' ' + badge(d.status), esc(d.recipient ? '→ ' + d.recipient : ''), esc(d.reason), '<a href="#/disposal/' + encodeURIComponent(d.id) + '">' + esc(d.id) + '</a>', esc(d.proposedBy)]) };
    })).sort(function (x, y) { return x.d < y.d ? 1 : -1; });

    return '<div class="bar no-print"><a href="#/assets">← Asset Register</a><span class="grow"></span>' + acts.join('') + '</div>' +
      '<h1>' + esc(a.id) + ' — ' + esc(a.name) + '</h1><p class="sub">' + badge(a.status) + ' ' + badge(a.ownership) + ' ' + esc(nameOf('categories', a.categoryCode)) + '</p>' +
      (open ? '<div class="note warn">Disposal proposal <a href="#/disposals">' + esc(open.id) + '</a> (' + esc(open.method) + ') is ' + esc(open.status.toLowerCase()) + '.</div>' : '') +
      '<h2>Identification</h2><div class="panel detail">' + cell('Make / model', esc(a.makeModel)) + cell('Serial no', esc(a.serialNo)) + cell('Condition', esc(a.condition)) +
      cell('Location', esc(nameOf('locations', a.locationCode))) + cell('Custodian', esc(a.custodian)) + cell('Last verified', esc(a.lastVerifiedDate)) + cell('Warranty expiry', esc(a.warrantyExpiry)) + cell('Description', esc(a.description)) + '</div>' +
      '<h2>Funding and ownership</h2><div class="panel detail">' + cell('Project', esc(a.projectCode ? a.projectCode + (p ? ' — ' + p.name : '') : 'Core / operations')) + cell('Funding type', esc(a.fundingType)) + cell('Funder', esc(a.funder)) +
      cell('Title held by', esc(a.ownership)) + cell('End-of-project term', esc(a.endOfProjectTerm)) + cell('Agreement ref', esc(a.agreementRef)) + '</div>' +
      '<h2>Acquisition</h2><div class="panel detail">' + cell('Mode', esc(a.acquisitionMode)) + cell('Date', esc(a.acquisitionDate)) + cell('Cost', a.cost !== '' && a.cost != null ? 'NPR ' + money(a.cost) : '') + cell('Vendor', esc(a.vendor)) +
      cell('Invoice no', esc(a.invoiceNo)) + cell('PO no', esc(a.poNo)) + cell('Received from', esc(a.receivedFrom)) + cell('Notes', esc(a.notes)) + '</div>' +
      '<h2>Accounting treatment</h2><div class="panel">' + accounting + '</div>' +
      '<h2>History</h2>' + table(['Date', 'Event', 'From → To', 'Details', 'Ref', 'By'], hist.map(function (h) { return h.row; }), 'No movements, maintenance or disposal recorded yet.');
  }

  function viewMovements() {
    var rows = st().movements.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); }).map(function (m) {
      var a = S.find('assets', m.assetId) || {};
      return tr([esc(m.date), '<a href="#/asset/' + encodeURIComponent(m.assetId) + '">' + esc(m.assetId) + '</a><br>' + esc(a.name), esc(m.type),
        esc([nameOf('locations', m.fromLocation), m.fromCustodian].filter(Boolean).join(' / ')), esc([nameOf('locations', m.toLocation), m.toCustodian].filter(Boolean).join(' / ')), esc(m.details), esc(m.ref), esc(m.by)]);
    });
    return '<h1>Transfers and Movements</h1><p class="sub">Custody and location changes, items received from partners, title transfers and physical verifications.</p>' +
      '<div class="bar"><span class="grow"></span>' + (S.can('asset.edit') ? '<button class="btn" data-action="asset-receive">Receive asset from a partner</button>' : '') +
      (S.can('movement.add') ? '<button class="btn primary" data-action="move">Record movement</button>' : '') + '</div>' +
      table(['Date', 'Asset', 'Type', 'From', 'To', 'Details', 'Ref', 'By'], rows, 'No movements recorded yet.');
  }

  function viewMaintenance() {
    var f = listFilter.maintenance;
    var rows = st().maintenance.filter(function (m) { return f === 'all' || (m.status === 'Open' || m.status === 'In progress'); })
      .sort(function (a, b) { return a.reportedDate < b.reportedDate ? 1 : -1; }).map(function (m) {
        var a = S.find('assets', m.assetId) || {};
        return tr([esc(m.id), '<a href="#/asset/' + encodeURIComponent(m.assetId) + '">' + esc(m.assetId) + '</a><br>' + esc(a.name), esc(m.reportedDate), esc(m.type), esc(m.issue), esc(m.serviceProvider), n(m.cost), esc(m.chargedTo), badge(m.status),
          S.can('maintenance.update') && m.status !== 'Completed' ? '<button class="btn small" data-action="maint-update" data-id="' + esc(m.id) + '">Update</button>' : esc(m.completedDate)]);
      });
    return '<h1>Maintenance and Damage</h1><p class="sub">Repairs, damage reports, servicing and calibration. Opening a job can move the asset to Under maintenance or Damaged; closing it returns the asset to use.</p>' +
      '<div class="bar"><select data-list-filter="maintenance" aria-label="Show">' + optionList([{ v: 'open', l: 'Open jobs' }, { v: 'all', l: 'All jobs' }], f) + '</select><span class="grow"></span>' +
      (S.can('maintenance.add') ? '<button class="btn primary" data-action="maint-new">Report maintenance / damage</button>' : '') + '</div>' +
      table(['Job', 'Asset', 'Reported', 'Type', 'Issue', 'Service provider', { t: 'Cost (NPR)' }, 'Charged to', 'Status', ''], rows, f === 'open' ? 'No open jobs.' : 'No maintenance recorded yet.');
  }

  function viewDisposals() {
    var f = listFilter.disposals;
    var rows = st().disposals.filter(function (d) { return f === 'all' || d.status === f; }).sort(function (a, b) { return a.proposedDate < b.proposedDate ? 1 : -1; }).map(function (d) {
      var a = S.find('assets', d.assetId) || {}, act = [];
      if (d.status === 'Proposed' && S.can('disposal.approve')) act.push('<button class="btn small primary" data-action="disp-approve" data-id="' + esc(d.id) + '">Approve</button>', '<button class="btn small" data-action="disp-reject" data-id="' + esc(d.id) + '">Reject</button>');
      if (d.status === 'Approved' && S.can('disposal.complete')) act.push('<button class="btn small primary" data-action="disp-complete" data-id="' + esc(d.id) + '">Complete</button>');
      act.push('<a class="btn small" href="#/disposal/' + encodeURIComponent(d.id) + '">Note</a>');
      return tr([esc(d.id), '<a href="#/asset/' + encodeURIComponent(d.assetId) + '">' + esc(d.assetId) + '</a><br>' + esc(a.name), badge(a.ownership), esc(d.method), esc(d.proposedDate) + '<br>' + esc(d.proposedBy), esc(d.recipient), n(d.proceeds), n(d.bookValueAtDisposal), n(d.gainLoss), badge(d.status), act.join(' ')]);
    });
    return '<h1>Disposal and Handover</h1><p class="sub">Auction, donation and scrap; plus handover to a third party or return to the funder at project close. Flow: proposed → approved by Administration → completed.</p>' +
      '<div class="bar"><select data-list-filter="disposals" aria-label="Show">' + optionList([{ v: 'all', l: 'All' }].concat(O.disposalStatus), f) + '</select><span class="grow"></span>' +
      (S.can('disposal.propose') ? '<button class="btn primary" data-action="disp-new">Propose disposal / handover</button>' : '') + '</div>' +
      table(['Ref', 'Asset', 'Title', 'Method', 'Proposed', 'Buyer / recipient', { t: 'Proceeds' }, { t: 'Book value' }, { t: 'Gain / (loss)' }, 'Status', ''], rows, 'No disposals or handovers recorded yet.');
  }

  function viewDisposalNote(id) {
    var d = S.find('disposals', id); if (!d) return '<h1>Record not found</h1>';
    var a = S.find('assets', d.assetId) || {}, cell = function (l, v) { return '<div><span>' + esc(l) + '</span>' + (v || '—') + '</div>'; };
    return '<div class="bar no-print"><a href="#/disposals">← Disposal and Handover</a><span class="grow"></span><button class="btn" data-action="print">Print</button></div>' +
      '<h1>' + esc(st().settings.orgName) + ' — Asset ' + esc(d.method === 'Handover to third party' || d.method === 'Return to funder' ? 'Handover' : 'Disposal') + ' Note</h1><p class="sub">' + esc(d.id) + ' · ' + badge(d.status) + '</p>' +
      '<div class="panel detail">' + cell('Asset ID', esc(a.id)) + cell('Asset name', esc(a.name)) + cell('Make / model', esc(a.makeModel)) + cell('Serial no', esc(a.serialNo)) + cell('Project', esc(a.projectCode || 'Core')) + cell('Title held by', esc(a.ownership) + (a.funder ? ' — ' + esc(a.funder) : '')) +
      cell('Acquired', esc(a.acquisitionDate)) + cell('Original cost', 'NPR ' + money(a.cost)) + cell('Condition', esc(a.condition)) + '</div>' +
      '<div class="panel detail">' + cell('Method', esc(d.method)) + cell('Reason', esc(d.reason)) + cell('Proposed', esc(d.proposedDate) + ' by ' + esc(d.proposedBy)) + cell('Funder approval ref', esc(d.funderApprovalRef)) +
      cell('Approved', d.approvedDate ? esc(d.approvedDate) + ' by ' + esc(d.approvedBy) : '') + cell('Completed', esc(d.completedDate)) + cell('Buyer / recipient', esc(d.recipient)) +
      cell('Proceeds', d.proceeds !== '' && d.proceeds != null ? 'NPR ' + money(d.proceeds) : '') + cell('Book value at disposal', d.bookValueAtDisposal !== '' ? 'NPR ' + money(d.bookValueAtDisposal) : 'Not applicable (memo asset)') +
      cell('Gain / (loss)', d.gainLoss !== '' ? 'NPR ' + money(d.gainLoss) : '') + cell('Document ref', esc(d.documentRef)) + cell('Remarks', esc(d.remarks)) + '</div>' +
      '<div class="sign"><div>Handed over by (NAAMII)<br>Name, signature, date</div><div>Received by<br>Name, signature, date</div><div>Approved by<br>Name, signature, date</div></div>';
  }

  function viewProjects() {
    var s = st(), t = today();
    var rows = s.projects.map(function (p) {
      var list = s.assets.filter(function (a) { return a.projectCode === p.code; }), active = list.filter(function (a) { return !isExited(a); });
      var pending = active.filter(function (a) { return a.ownership !== 'NAAMII'; }).length, ended = p.status === 'Closed' || (p.endDate && p.endDate < t);
      return tr([esc(p.code), esc(p.name), esc(p.funder), esc(p.fundingType), esc(p.defaultOwnership), esc(p.assetTerm), esc(p.endDate), esc(p.manager), badge(p.status),
        { n: '<a href="#/assets" data-action="filter-project" data-id="' + esc(p.code) + '">' + active.length + '</a>' },
        ended && pending ? '<span class="badge warn">' + pending + ' to settle</span>' : '',
        S.can('project.edit') ? '<button class="btn small" data-action="master-edit" data-list="projects" data-id="' + esc(p.code) + '">Edit</button> <button class="btn small" data-action="master-del" data-list="projects" data-id="' + esc(p.code) + '">Delete</button>' : '']);
    });
    return '<h1>Projects</h1><p class="sub">Each project carries its funding type and the asset terms of its agreement. New assets under a project pick these up automatically.</p>' +
      '<div class="bar"><span class="grow"></span>' + (S.can('project.edit') ? '<button class="btn primary" data-action="master-new" data-list="projects">Add project</button>' : '') + '</div>' +
      table(['Code', 'Project', 'Funder', 'Funding type', 'Asset title', 'End-of-project term', 'End date', 'Manager', 'Status', { t: 'Assets held' }, 'Close-out', ''], rows, 'No projects yet. Add your grants and contracts here, or import them from Excel.');
  }

  function viewDepreciation() {
    var s = st(), cur = D.fyOf(today(), s.settings), minFy = cur;
    s.assets.forEach(function (a) { if (D.isCapitalised(a, s.settings) && D.depStart(a)) minFy = Math.min(minFy, D.fyOf(D.depStart(a), s.settings)); });
    if (depFy == null) depFy = cur;
    var years = []; for (var y = cur + 1; y >= minFy; y--) years.push({ v: y, l: 'FY ' + D.fyLabel(y) });
    var sl = D.slSchedule(s.assets, s.disposals, s.settings, depFy), ita = D.itaSchedule(s.assets, s.disposals, s.settings, depFy);
    var tot = { base: 0, open: 0, dep: 0, close: 0, nbv: 0 };
    var slRows = sl.map(function (r) {
      tot.base += r.base; tot.open += r.openingAcc; tot.dep += r.depForYear; tot.close += r.closingAcc; tot.nbv += r.nbv;
      return tr(['<a href="#/asset/' + encodeURIComponent(r.id) + '">' + esc(r.id) + '</a>', esc(r.name) + (r.addition ? ' <span class="badge">Addition</span>' : '') + (r.disposedOn ? ' <span class="badge off">Disposed ' + esc(r.disposedOn) + '</span>' : ''),
        esc(r.categoryCode), esc(r.depStart), { n: r.life }, n(r.base), n(r.openingAcc), n(r.depForYear), n(r.closingAcc), n(r.nbv)]);
    });
    if (sl.length) slRows.push(tr(['Total', '', '', '', '', n(tot.base), n(tot.open), n(tot.dep), n(tot.close), n(tot.nbv)], 'class="total"'));
    var itaTot = 0, itaRows = ita.blocks.map(function (b) {
      itaTot += b.depreciation;
      return tr(['Block ' + b.block + '<br><small>' + esc(AMS.ITA_BLOCK_DESC[b.block]) + '</small>', { n: (b.rate * 100) + '%' }, n(b.opening), n(b.carryIn), n(b.absorbed), n(b.proceeds), n(b.base), n(b.depreciation), n(b.closing), n(b.deferredOut), n(b.excess)]);
    });
    ita.blockE.forEach(function (e) { itaTot += e.depreciation; itaRows.push(tr(['Block E — ' + esc(e.id) + '<br><small>' + esc(e.name) + ', ' + e.life + ' yrs</small>', { n: 'SL' }, n(e.opening), '', '', '', n(e.opening), n(e.depreciation), n(e.closing), '', ''])); });
    itaRows.push(tr(['Total tax depreciation', '', '', '', '', '', '', n(itaTot), '', '', ''], 'class="total"'));
    var memo = s.assets.filter(function (a) { return a.ownership !== 'NAAMII' && !isExited(a); });
    return '<h1>Depreciation</h1><p class="sub">Only assets whose title is with NAAMII appear here. ' + memo.length + ' funder / partner-owned asset(s) (memo cost NPR ' +
      money(memo.reduce(function (x, a) { return x + D.num(a.cost); }, 0)) + ') are excluded: they were expensed to their projects.</p>' +
      '<div class="bar"><label>Fiscal year <select data-dep-fy>' + optionList(years, depFy) + '</select></label><span class="grow"></span><button class="btn" data-action="print">Print</button></div>' +
      '<h2>Fixed asset schedule — books (straight-line)</h2>' +
      table(['Asset ID', 'Asset', 'Cat.', 'Dep. start', { t: 'Life' }, { t: 'Value' }, { t: 'Opening accum.' }, { t: 'Dep. for year' }, { t: 'Closing accum.' }, { t: 'Net book value' }], slRows, 'No NAAMII-owned capitalised assets in this fiscal year.') +
      '<h2>Tax depreciation working — Income Tax Act 2058, Schedule 2 (pooled)</h2>' +
      '<div class="note">Blocks A–D use the diminishing-balance method on the pool. Additions enter the pool in full if bought by the end of Poush, two-thirds from Magh to Chaitra and one-third from Baisakh to year end; the balance is added the following year. Disposal proceeds reduce the pool. ' +
      (s.settings.itaOpeningFy === '' ? 'No opening pool balances are set, so pools are built from the assets registered here — enter your audited opening balances in Setup.' : 'Opening pool balances are taken from Setup as at the start of FY ' + D.fyLabel(+s.settings.itaOpeningFy) + '.') +
      ' Treat this as a working paper and have it reviewed against the audited tax computation.</div>' +
      table(['Block', { t: 'Rate' }, { t: 'Opening base' }, { t: 'B/f additions' }, { t: 'Additions absorbed' }, { t: 'Disposal proceeds' }, { t: 'Dep. base' }, { t: 'Depreciation' }, { t: 'Closing base' }, { t: 'Deferred to next FY' }, { t: 'Excess proceeds' }], itaRows);
  }

  function viewData() {
    var s = st(), last = s.meta.lastExportAt;
    var imp = '';
    if (pendingImport) {
      var p = pendingImport;
      imp = '<h2>Import preview — ' + esc(p.fileName) + '</h2><div class="panel">' +
        table(['Sheet', { t: 'New records' }, { t: 'Updates to existing' }, { t: 'Rows skipped (errors)' }], p.sheets.map(function (x) { return tr([esc(x.name), { n: x.added }, { n: x.updated }, { n: x.skipped }]); }), 'No usable sheets found.') +
        (p.errors.length ? '<h2>Rows that will not be imported (' + p.errors.length + ')</h2>' + table(['Sheet', { t: 'Row' }, 'Problem'], p.errors.slice(0, 200).map(function (e) { return tr([esc(e.sheet), { n: e.row }, esc(e.message)]); })) +
          (p.errors.length > 200 ? '<p class="sub">Showing the first 200.</p>' : '') : '<p>No errors found.</p>') +
        '<div class="bar" style="margin-top:14px"><label><input type="radio" name="impmode" value="merge" checked> Merge — update matching IDs, add new ones, keep everything else</label>' +
        (S.can('data.reset') ? '<label><input type="radio" name="impmode" value="replace"> Replace — each sheet in the file replaces that register</label>' : '') +
        '<span class="grow"></span><button class="btn" data-action="import-cancel">Cancel</button>' +
        (p.sheets.some(function (x) { return x.added + x.updated > 0; }) ? '<button class="btn primary" data-action="import-apply">Import valid rows</button>' : '') + '</div></div>';
    }
    return '<h1>Import / Export</h1><p class="sub">Records are stored in this browser on this computer. The Excel workbook is the shared master copy: export after each working session and keep it in the shared drive.</p>' +
      '<div class="note' + (last ? '' : ' warn') + '">' + (last ? 'Last Excel export from this browser: ' + esc(last.slice(0, 16).replace('T', ' ')) + ' UTC.' : 'No Excel export has been made from this browser yet.') + '</div>' + imp +
      '<div class="cols"><div class="panel"><h2 style="margin-top:0">Export to Excel</h2><p>One workbook with every register (assets, projects, movements, maintenance, disposals), the fixed asset schedule, the ITA block working and the audit log.</p>' +
      (S.can('data.export') ? '<button class="btn primary" data-action="export-all">Export full workbook</button>' : '<em>Not available for your role.</em>') + '</div>' +
      '<div class="panel"><h2 style="margin-top:0">Import from Excel</h2><p>Use the template for bulk entry, or re-import an exported workbook to bring in a colleague’s updates. You see a preview and any errors before anything is saved.</p>' +
      (S.can('data.import') ? '<button class="btn" data-action="template">Download template</button> <label class="btn dark" style="display:inline-block">Choose Excel file<input type="file" id="import-file" accept=".xlsx" hidden></label>' : '<em>Not available for your role.</em>') + '</div>' +
      '<div class="panel"><h2 style="margin-top:0">Backup and reset</h2><p>A backup file holds everything exactly as it is, including settings. Restore replaces all data in this browser.</p>' +
      '<button class="btn" data-action="backup">Download backup (.json)</button> ' +
      (S.can('data.reset') ? '<label class="btn" style="display:inline-block">Restore backup<input type="file" id="restore-file" accept=".json" hidden></label> <button class="btn" data-action="demo">Load demo data</button> <button class="btn" data-action="reset">Clear all data</button>' : '') + '</div></div>';
  }

  function viewSetup() {
    if (!S.can('setup.edit')) return '<h1>Setup</h1><p>Only Administration can change setup.</p>';
    var s = st(), z = s.settings;
    var crud = function (list, headers, cells) {
      return '<div class="bar"><span class="grow"></span><button class="btn" data-action="master-new" data-list="' + list + '">Add ' + MASTER[list].label + '</button></div>' +
        table(headers.concat(['']), s[list].map(function (r) {
          return tr(cells(r).concat(['<button class="btn small" data-action="master-edit" data-list="' + list + '" data-id="' + esc(r.code) + '">Edit</button> <button class="btn small" data-action="master-del" data-list="' + list + '" data-id="' + esc(r.code) + '">Delete</button>']));
        }));
    };
    var f = function (key, label, type, val, help) { return fieldHtml({ key: key, label: label, type: type || 'text', help: help }, val); };
    return '<h1>Setup</h1><p class="sub">Labs and locations, asset categories, and the accounting settings behind the schedules.</p>' +
      '<h2>Labs and locations</h2>' + crud('locations', ['Code', 'Name', 'Type', 'In-charge'], function (r) { return [esc(r.code), esc(r.name), esc(r.type), esc(r.inCharge)]; }) +
      '<h2>Asset categories</h2><div class="note">Useful lives here are starting values. Align them with NAAMII’s approved accounting policy (FMCM) before relying on the book depreciation figures.</div>' +
      crud('categories', ['Code', 'Name', 'ITA block', { t: 'Useful life (yrs)' }], function (r) { return [esc(r.code), esc(r.name), esc(r.itaBlock), { n: esc(r.usefulLifeYears) }]; }) +
      '<h2>Accounting settings</h2><form id="settings-form" class="panel"><div class="grid">' +
      f('orgName', 'Organisation name', 'text', z.orgName) + f('idPrefix', 'Asset ID prefix', 'text', z.idPrefix) +
      f('capThreshold', 'Capitalisation threshold (NPR)', 'number', z.capThreshold, 'NAAMII-owned items costing less are expensed and kept as memo records. 0 = capitalise everything') +
      f('fyStartMonth', 'Fiscal year start — month (1–12)', 'number', z.fyStartMonth) + f('fyStartDay', 'Fiscal year start — day', 'number', z.fyStartDay, 'Shrawan 1 falls on 16 or 17 July') +
      f('tier1End', 'End of Poush (MM-DD)', 'text', z.tier1End, 'Additions up to this date enter the tax pool in full') + f('tier2End', 'End of Chaitra (MM-DD)', 'text', z.tier2End, 'Additions up to this date enter at two-thirds; later ones at one-third') +
      f('itaOpeningFy', 'Opening tax pools as at start of FY (AD start year)', 'number', z.itaOpeningFy, 'e.g. 2026 for FY 2026/27. Leave blank to build pools from registered assets') +
      ['A', 'B', 'C', 'D'].map(function (b) { return f('open' + b, 'Opening base — Block ' + b + ' (NPR)', 'number', z.itaOpening[b]); }).join('') +
      '</div><div class="bar" style="margin:14px 0 0"><span class="grow"></span><button class="btn primary" type="submit">Save settings</button></div></form>';
  }

  function viewAudit() {
    if (!S.can('audit.view')) return '<h1>Audit Log</h1><p>Only Administration can view the audit log.</p>';
    var rows = st().audit.slice(-500).reverse().map(function (a) { return tr([esc(a.at.slice(0, 19).replace('T', ' ')), esc(a.user), esc(a.role), esc(a.action), esc(a.entity), esc(a.id), esc(a.detail)]); });
    return '<h1>Audit Log</h1><p class="sub">Who did what and when (UTC). The latest 500 entries are shown; the full log is in the Excel export.</p>' +
      table(['When', 'User', 'Role', 'Action', 'Record', 'ID', 'Detail'], rows, 'No activity yet.');
  }

  /* ---------- routing ---------- */
  function render() {
    if (!S.user) { main.innerHTML = ''; userModal(); return; }
    var parts = (location.hash || '#/dashboard').slice(2).split('/'), route = parts[0] || 'dashboard', arg = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : '';
    var views = { dashboard: viewDashboard, assets: viewAssets, asset: viewAsset, movements: viewMovements, maintenance: viewMaintenance, disposals: viewDisposals,
      disposal: viewDisposalNote, projects: viewProjects, depreciation: viewDepreciation, data: viewData, setup: viewSetup, audit: viewAudit };
    var active = document.activeElement, keep = active && active.matches && active.matches('[data-filter=q]') ? active.selectionStart : null;
    main.innerHTML = (views[route] || viewDashboard)(arg);
    if (keep != null) { var q = main.querySelector('[data-filter=q]'); if (q) { q.focus(); q.setSelectionRange(keep, keep); } }
    var navKey = { asset: 'assets', disposal: 'disposals' }[route] || route;
    document.querySelectorAll('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.nav === navKey);
      a.style.display = a.dataset.perm && !S.can(a.dataset.perm) ? 'none' : '';
    });
    document.getElementById('who').textContent = S.user.name + ' · ' + AMS.ROLES[S.user.role];
    document.getElementById('version').textContent = 'v' + AMS.VERSION + ' · data stored in this browser';
    var note = document.getElementById('backup-note'), last = st().meta.lastExportAt, changed = st().audit.length ? st().audit[st().audit.length - 1].at : '';
    var due = st().assets.length && (!last || changed > last);
    note.className = 'backup-note' + (due ? ' due' : '');
    note.textContent = due ? 'Changes since the last Excel export — export the workbook to update the shared master.' : last ? 'Excel master up to date (' + last.slice(0, 10) + ').' : '';
  }

  /* ---------- events ---------- */
  var actions = {
    'switch-user': function () { userModal(); },
    'open-asset': function (id) { location.hash = '#/asset/' + encodeURIComponent(id); },
    'asset-new': function () { assetModal(); },
    'asset-receive': function () { assetModal(null, { acquisitionMode: 'Received from partner', fundingType: 'In-kind / transferred in', ownership: 'Funder', endOfProjectTerm: 'To be confirmed', status: 'In store' }); },
    'asset-edit': function (id) { assetModal(id); },
    'move': function (id) { moveModal(id); },
    'verify': function (id) { verifyModal(id); },
    'title': function (id) { titleModal(id); },
    'maint-new': function (id) { maintenanceModal(id); },
    'maint-update': function (id) { maintenanceUpdateModal(id); },
    'disp-new': function (id) { disposalModal(id); },
    'disp-approve': function (id) { approveModal(id, true); },
    'disp-reject': function (id) { approveModal(id, false); },
    'disp-complete': function (id) { completeModal(id); },
    'master-new': function (id, el) { masterModal(el.dataset.list); },
    'master-edit': function (id, el) { masterModal(el.dataset.list, id); },
    'master-del': function (id, el) { masterDelete(el.dataset.list, id); },
    'filter-project': function (id) { filters = { q: '', project: id, category: '', ownership: '', status: 'active', location: '', mine: false }; },
    'print': function () { window.print(); },
    'export-all': function () { AMS.excel.exportAll().then(function () { toast('Workbook exported.'); render(); }); },
    'export-list': function () { AMS.excel.exportAssets(filteredAssets()).then(function () { toast('List exported.'); }); },
    'template': function () { AMS.excel.template(); },
    'import-cancel': function () { pendingImport = null; render(); },
    'import-apply': function () {
      var mode = (document.querySelector('input[name=impmode]:checked') || {}).value || 'merge', p = pendingImport;
      var go = function () { AMS.excel.apply(p, mode).then(function () { pendingImport = null; toast('Import complete.'); render(); }); };
      if (mode === 'replace') confirmModal('Replace registers', 'Each sheet in the file will replace the matching register in this browser. Records not in the file will be removed. Continue?', go, 'Replace');
      else go();
    },
    'backup': function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(st(), null, 1)], { type: 'application/json' }));
      a.download = 'NAAMII_AMS_backup_' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
    },
    'demo': function () {
      confirmModal('Load demo data', 'This replaces everything in this browser with fictional sample records for training. Export your real data first. Continue?', function () {
        S.state = AMS.demoData(); toast('Demo data loaded.');
      }, 'Load demo data');
    },
    'reset': function () {
      confirmModal('Clear all data', 'This permanently removes every record and setting from this browser. Export a backup first. Continue?', function () {
        S.state = AMS.blankState(); S.audit('Reset', 'All data', '', 'All data cleared');
      }, 'Clear everything');
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]'); if (!el) return;
    var fn = actions[el.dataset.action]; if (!fn) return;
    if (el.tagName !== 'A') e.preventDefault();
    fn(el.dataset.id || '', el);
    if (el.dataset.action === 'filter-project') { if (location.hash === '#/assets') render(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-action]')) e.target.click();
  });
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-filter=q]')) { filters.q = e.target.value; render(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-filter]') && t.dataset.filter !== 'q') { filters[t.dataset.filter] = t.type === 'checkbox' ? t.checked : t.value; render(); }
    else if (t.matches('[data-list-filter]')) { listFilter[t.dataset.listFilter] = t.value; render(); }
    else if (t.matches('[data-dep-fy]')) { depFy = +t.value; render(); }
    else if (t.id === 'import-file' && t.files[0]) {
      var file = t.files[0];
      file.arrayBuffer().then(function (buf) { return AMS.excel.parse(buf); }).then(function (res) { res.fileName = file.name; pendingImport = res; render(); })
        .catch(function () { toast('That file could not be read. Please use an .xlsx workbook.'); });
    } else if (t.id === 'restore-file' && t.files[0]) {
      t.files[0].text().then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || !Array.isArray(data.assets) || !data.settings) throw new Error('bad');
        confirmModal('Restore backup', 'This replaces all data in this browser with the backup (' + data.assets.length + ' assets). Continue?', function () {
          S.state = S.normalise(data); S.audit('Restore', 'Backup', '', 'Backup file restored');
        }, 'Restore');
      }).catch(function () { toast('That is not a valid backup file.'); });
    }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    var el = e.target.elements, z = st().settings, mmdd = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    var m = +el.fyStartMonth.value, d = +el.fyStartDay.value;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 28)) return toast('Fiscal year start must be a valid month and a day from 1 to 28.');
    if (!mmdd.test(el.tier1End.value) || !mmdd.test(el.tier2End.value)) return toast('Use MM-DD for the Poush and Chaitra end dates, e.g. 01-14.');
    z.orgName = el.orgName.value.trim() || 'NAAMII'; z.idPrefix = el.idPrefix.value.trim().toUpperCase() || 'NAAMII';
    z.capThreshold = D.num(el.capThreshold.value); z.fyStartMonth = m; z.fyStartDay = d; z.tier1End = el.tier1End.value; z.tier2End = el.tier2End.value;
    z.itaOpeningFy = el.itaOpeningFy.value === '' ? '' : +el.itaOpeningFy.value;
    ['A', 'B', 'C', 'D'].forEach(function (b) { z.itaOpening[b] = D.num(el['open' + b].value); });
    S.audit('Update', 'Settings', '', 'Accounting settings changed');
    S.save(); toast('Settings saved.'); render();
  });
  window.addEventListener('hashchange', render);

  S.load().then(render);
  AMS.render = render;
})();
