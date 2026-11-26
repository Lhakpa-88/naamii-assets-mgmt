/* Excel import and export (ExcelJS, bundled in /vendor so no internet connection is needed). */
(function () {
  var dep = AMS.dep, store = AMS.store;
  var BRAND = { dark: 'FF454D59', red: 'FFDB0505', light: 'FFF1F2F4' };

  var SETTING_KEYS = ['orgName', 'idPrefix', 'capThreshold', 'fyStartMonth', 'fyStartDay', 'tier1End', 'tier2End', 'itaOpeningFy',
    'itaOpeningA', 'itaOpeningB', 'itaOpeningC', 'itaOpeningD'];
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function isoToDate(iso) { return iso ? new Date(dep.toMs(iso)) : null; }

  function cellValue(v) {
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if (v.result !== undefined) return cellValue(v.result);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if (v.text !== undefined) return v.text;
      if (v.error) return '';
      return '';
    }
    return v;
  }

  function parseDate(v) {
    if (v === '' || v == null) return '';
    if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) return check(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) return check(+m[3], +m[2], +m[1]);   // DD/MM/YYYY
    return null;
    function check(y, mo, d) {
      var dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
      return dt.toISOString().slice(0, 10);
    }
  }
  function parseNumber(v) {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/[, ]/g, '').replace(/^(npr|rs\.?)/i, ''));
    return isFinite(n) ? n : null;
  }
  function matchOption(v, list) {
    var w = norm(v);
    for (var i = 0; i < list.length; i++) if (norm(list[i]) === w) return list[i];
    return null;
  }

  function styleHeader(ws, n) {
    var row = ws.getRow(1);
    row.height = 30;
    for (var c = 1; c <= n; c++) {
      var cell = row.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.dark } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (n) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: n } };
  }

  function addDataSheet(wb, def, rows, extras) {
    var ws = wb.addWorksheet(def.name);
    var cols = def.fields.map(function (f) {
      return { header: f.label, key: f.key, width: f.type === 'textarea' ? 36 : Math.max(14, f.label.length + 4),
        style: f.type === 'date' ? { numFmt: 'yyyy-mm-dd' } : f.type === 'number' ? { numFmt: '#,##0.00' } : {} };
    });
    (extras || []).forEach(function (e) { cols.push({ header: e.label, key: e.key, width: 22, style: e.number ? { numFmt: '#,##0.00' } : {} }); });
    ws.columns = cols;
    rows.forEach(function (r) {
      var o = {};
      def.fields.forEach(function (f) {
        var v = r[f.key];
        o[f.key] = f.type === 'date' ? isoToDate(v) : (f.type === 'number' && v !== '' && v != null ? Number(v) : (v == null ? '' : v));
      });
      (extras || []).forEach(function (e) { o[e.key] = e.value(r); });
      ws.addRow(o);
    });
    styleHeader(ws, cols.length);
    return ws;
  }

  function addTableSheet(wb, name, headers, rows, moneyFrom) {
    var ws = wb.addWorksheet(name);
    ws.addRow(headers);
    rows.forEach(function (r) { ws.addRow(r); });
    headers.forEach(function (h, i) {
      var col = ws.getColumn(i + 1);
      col.width = Math.max(14, String(h).length + 4);
      if (moneyFrom != null && i >= moneyFrom) col.numFmt = '#,##0.00';
    });
    styleHeader(ws, headers.length);
    return ws;
  }

  function download(wb, filename) {
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
  }

  function assetExtras(asOf) {
    var s = store.state, exits = dep.exitDates(s.disposals);
    return [
      { key: '_treatment', label: 'Accounting Treatment (calculated)', value: function (a) { return dep.treatment(a, s.settings); } },
      { key: '_acc', label: 'Accum. Depreciation SL (calculated)', number: true,
        value: function (a) { return dep.isCapitalised(a, s.settings) ? dep.slAccumulated(a, asOf, exits[a.id]) : ''; } },
      { key: '_nbv', label: 'Net Book Value (calculated)', number: true,
        value: function (a) { return dep.isCapitalised(a, s.settings) ? (exits[a.id] ? 0 : dep.netBookValue(a, asOf)) : ''; } }
    ];
  }

  var excel = {
    /* Full workbook: every register plus the depreciation schedules. Re-importable. */
    buildWorkbook: function (opts) {
      opts = opts || {};
      var s = store.state, today = new Date().toISOString().slice(0, 10), fy = dep.fyOf(today, s.settings);
      var wb = new ExcelJS.Workbook();
      wb.creator = 'NAAMII Asset Management System'; wb.created = new Date();

      var info = wb.addWorksheet('Read Me');
      info.getColumn(1).width = 110;
      [[s.settings.orgName + ' — Asset Management System export'],
        ['Exported on ' + today + (store.user ? ' by ' + store.user.name + ' (' + AMS.ROLES[store.user.role] + ')' : '')],
        [''],
        ['This workbook is the shared master copy. Edit the Projects, Locations, Categories and Assets sheets and import the file back through Data > Import from Excel.'],
        ['Columns marked "(calculated)" and the schedule sheets are produced by the system and are ignored on import.'],
        ['Depreciation is calculated only for assets whose ownership is NAAMII. Funder- and partner-owned assets are memo records, expensed to the project when bought.'],
        ['The ITA Blocks sheet is a working paper under Income Tax Act 2058, Schedule 2. Have it reviewed against the audited tax computation before filing.']
      ].forEach(function (r) { info.addRow(r); });
      info.getRow(1).font = { bold: true, size: 14, color: { argb: BRAND.red } };
      info.eachRow(function (r) { r.alignment = { wrapText: true, vertical: 'top' }; });

      AMS.SHEETS.forEach(function (def) {
        var rows = opts.assets && def.key === 'assets' ? opts.assets : s[def.key];
        addDataSheet(wb, def, rows, def.key === 'assets' ? assetExtras(today) : null);
      });

      var sl = dep.slSchedule(s.assets, s.disposals, s.settings, fy);
      addTableSheet(wb, 'FA Schedule (Books)',
        ['Asset ID', 'Asset Name', 'Category', 'Dep. Start', 'Life (Yrs)', 'Depreciable Value', 'Residual Value',
          'Opening Accum. Dep.', 'Depreciation FY ' + dep.fyLabel(fy), 'Closing Accum. Dep.', 'Net Book Value', 'Disposed On'],
        sl.map(function (r) { return [r.id, r.name, r.categoryCode, r.depStart, r.life, r.base, r.residual, r.openingAcc, r.depForYear, r.closingAcc, r.nbv, r.disposedOn]; }), 5);

      var ita = dep.itaSchedule(s.assets, s.disposals, s.settings, fy);
      var itaRows = ita.blocks.map(function (b) {
        return ['Block ' + b.block, b.rate, b.opening, b.carryIn, b.additionsCost, b.absorbed, b.proceeds, b.base, b.depreciation, b.closing, b.deferredOut, b.excess];
      });
      ita.blockE.forEach(function (e) { itaRows.push(['Block E — ' + e.id + ' ' + e.name, '', e.opening, '', '', '', '', e.opening, e.depreciation, e.closing, '', '']); });
      var ws = addTableSheet(wb, 'ITA Blocks FY ' + String(fy) + '-' + String(fy + 1).slice(2),
        ['Block', 'Rate', 'Opening Base', 'Brought-Forward Additions', 'Additions at Cost', 'Additions Absorbed This Year',
          'Disposal Proceeds', 'Depreciation Base', 'Depreciation', 'Closing Base', 'Additions Deferred to Next Year', 'Excess Proceeds (Income)'],
        itaRows, 2);
      ws.getColumn(2).numFmt = '0%';

      if (!opts.assets) {
        var z = s.settings;
        addTableSheet(wb, 'Settings', ['Setting', 'Value'], SETTING_KEYS.map(function (k) {
          return [k, k.indexOf('itaOpening') === 0 && k.length === 11 ? z.itaOpening[k.slice(10)] : z[k]];
        }));
        addTableSheet(wb, 'Audit Log', ['When', 'User', 'Role', 'Action', 'Record Type', 'Record ID', 'Detail'],
          s.audit.map(function (a) { return [a.at, a.user, a.role, a.action, a.entity, a.id, a.detail]; }));
      }
      return wb;
    },

    exportAll: function () {
      var today = new Date().toISOString().slice(0, 10);
      return download(excel.buildWorkbook(), 'NAAMII_Asset_Register_' + today + '.xlsx').then(function () {
        store.state.meta.lastExportAt = new Date().toISOString();
        store.audit('Export', 'Workbook', '', 'Full register exported to Excel');
        return store.save();
      });
    },
    exportAssets: function (assets) {
      return download(excel.buildWorkbook({ assets: assets }), 'NAAMII_Asset_List_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    },

    /* Blank entry template with drop-down lists, for bulk data entry in Excel. */
    template: function () {
      var s = store.state, wb = new ExcelJS.Workbook();
      var guide = wb.addWorksheet('Instructions');
      guide.getColumn(1).width = 32; guide.getColumn(2).width = 90;
      guide.addRow(['NAAMII asset import template']); guide.getRow(1).font = { bold: true, size: 14, color: { argb: BRAND.red } };
      guide.addRow(['How to use', 'Fill the Assets sheet (one row per asset), save, then use Data > Import from Excel. Do not rename the sheets or the header row.']);
      guide.addRow(['Asset ID', 'Leave blank for new assets — the system assigns the next number. Keep the ID to update an existing asset.']);
      guide.addRow(['Dates', 'Use YYYY-MM-DD or a normal Excel date.']);
      guide.addRow(['Ownership', 'NAAMII = title is with NAAMII (capitalised and depreciated). Funder / Partner = memo record, no depreciation.']);
      guide.addRow(['Codes', 'Project, Location and Category codes must exist in the system or in the matching sheet of this file.']);
      guide.addRow(['', '']);
      guide.addRow(['Column', 'Required / allowed values']); guide.getRow(8).font = { bold: true };
      AMS.ASSET_FIELDS.forEach(function (f) {
        var note = (f.required ? 'Required. ' : 'Optional. ') +
          (f.type === 'select' ? 'One of: ' + AMS.OPTIONS[f.options].join(' | ') : f.type === 'ref' ? 'A code from the ' + f.ref + ' list.' : f.type === 'date' ? 'Date.' : f.type === 'number' ? 'Number.' : 'Text.') +
          (f.help ? ' ' + f.help + '.' : '');
        guide.addRow([f.label, note]);
      });
      guide.eachRow(function (r) { r.alignment = { wrapText: true, vertical: 'top' }; });

      AMS.SHEETS.forEach(function (def) {
        if (['projects', 'locations', 'categories', 'assets'].indexOf(def.key) < 0) return;
        var ws = addDataSheet(wb, def, def.key === 'assets' ? [] : s[def.key]);
        if (def.key !== 'assets') return;
        def.fields.forEach(function (f, i) {
          var list = f.type === 'select' ? AMS.OPTIONS[f.options]
            : f.type === 'ref' ? s[f.ref].map(function (r) { return r.code; }) : null;
          if (!list || !list.length) return;
          var formula = '"' + list.join(',') + '"';
          if (formula.length > 250) return;                        // Excel limit for in-cell lists
          for (var r = 2; r <= 1001; r++) {
            ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: f.type === 'select' };
          }
        });
      });
      return download(wb, 'NAAMII_Asset_Import_Template.xlsx');
    },

    /* Read a workbook and validate it. Nothing is saved until apply() is called. */
    parse: function (arrayBuffer) {
      var wb = new ExcelJS.Workbook();
      return wb.xlsx.load(arrayBuffer).then(function () {
        var s = store.state, result = { sheets: [], errors: [], data: {} };
        var known = {};
        ['projects', 'locations', 'categories'].forEach(function (k) {
          known[k] = {}; s[k].forEach(function (r) { known[k][norm(r.code)] = r.code; });
        });

        AMS.SHEETS.forEach(function (def) {
          var ws = wb.worksheets.filter(function (w) { return norm(w.name) === norm(def.name); })[0];
          if (!ws) return;
          var colMap = {};
          ws.getRow(1).eachCell(function (cell, col) {
            var h = norm(cellValue(cell.value));
            def.fields.forEach(function (f) { if (norm(f.label) === h || norm(f.key) === h) colMap[f.key] = col; });
          });
          var missing = def.fields.filter(function (f) { return f.required && !colMap[f.key]; }).map(function (f) { return f.label; });
          if (missing.length) { result.errors.push({ sheet: def.name, row: 1, message: 'Missing column(s): ' + missing.join(', ') }); return; }

          var rows = [], seen = {}, added = 0, updated = 0, skipped = 0;
          for (var r = 2; r <= ws.rowCount; r++) {
            var row = ws.getRow(r), rec = {}, errs = [], empty = true;
            def.fields.forEach(function (f) {
              if (!colMap[f.key]) return;
              var raw = cellValue(row.getCell(colMap[f.key]).value);
              if (typeof raw === 'string') raw = raw.trim();
              if (raw !== '' && raw != null) empty = false;
              var v = raw;
              if (f.type === 'date') { v = parseDate(raw); if (v === null) { errs.push(f.label + ': "' + raw + '" is not a valid date'); v = ''; } }
              else if (f.type === 'number') { v = parseNumber(raw); if (v === null) { errs.push(f.label + ': "' + raw + '" is not a number'); v = ''; } }
              else if (f.type === 'select' && raw !== '') {
                v = matchOption(raw, AMS.OPTIONS[f.options]);
                if (v === null) { errs.push(f.label + ': "' + raw + '" is not an allowed value'); v = ''; }
              } else if (f.type === 'ref' && raw !== '') {
                v = known[f.ref][norm(raw)];
                if (!v) { errs.push(f.label + ': code "' + raw + '" is not in ' + f.ref); v = ''; }
              } else v = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw == null ? '' : raw);
              rec[f.key] = v;
            });
            if (empty) continue;
            def.fields.forEach(function (f) {
              if (f.required && (rec[f.key] === '' || rec[f.key] == null) && !errs.some(function (e) { return e.indexOf(f.label + ':') === 0; })) errs.push(f.label + ' is required');
            });
            var id = rec[def.idKey];
            if (id && seen[norm(id)]) errs.push(def.fields[0].label + ' "' + id + '" appears more than once in this sheet');
            if (def.key !== 'assets' && known[def.key] && id) known[def.key][norm(id)] = id;   // masters become valid refs
            if (['movements', 'maintenance', 'disposals'].indexOf(def.key) >= 0 && rec.assetId) {
              var inFile = (result.data.assets || []).some(function (a) { return norm(a.id) === norm(rec.assetId); });
              if (!inFile && !store.find('assets', rec.assetId)) errs.push('Asset ID "' + rec.assetId + '" not found');
            }
            if (errs.length) { skipped++; errs.forEach(function (m) { result.errors.push({ sheet: def.name, row: r, message: m }); }); continue; }
            if (id) seen[norm(id)] = true;
            if (id && store.find(def.key, id, def.idKey)) updated++; else added++;
            rows.push(rec);
          }
          result.data[def.key] = rows;
          result.sheets.push({ name: def.name, key: def.key, added: added, updated: updated, skipped: skipped });
        });
        var zs = wb.worksheets.filter(function (w) { return norm(w.name) === 'settings'; })[0];
        if (zs && store.can('setup.edit')) {
          var found = {}, count = 0;
          zs.eachRow(function (row, i) {
            var k = String(cellValue(row.getCell(1).value)).trim(), v = cellValue(row.getCell(2).value);
            if (i > 1 && SETTING_KEYS.indexOf(k) >= 0) { found[k] = v; count++; }
          });
          if (count) { result.settings = found; result.sheets.push({ name: 'Settings', key: 'settings', added: 0, updated: count, skipped: 0 }); }
        }
        if (!result.sheets.length && !result.errors.length) result.errors.push({ sheet: '-', row: 0, message: 'No recognised sheets found. Expected sheet names: ' + AMS.SHEETS.map(function (d) { return d.name; }).join(', ') });
        return result;
      });
    },

    /* mode 'merge': update matching IDs and add new ones. mode 'replace': the file replaces each sheet it contains. */
    apply: function (parsed, mode) {
      var s = store.state, now = new Date().toISOString();
      AMS.SHEETS.forEach(function (def) {
        var rows = parsed.data[def.key];
        if (!rows) return;
        if (mode === 'replace') s[def.key] = [];
        rows.forEach(function (rec) {
          if (def.key === 'assets') {
            if (!rec.id) rec.id = store.assetId(rec.categoryCode);
            var cat = store.find('categories', rec.categoryCode, 'code');
            if (rec.ownership === 'NAAMII' && cat) {
              if (!rec.itaBlock) rec.itaBlock = cat.itaBlock || '';
              if (rec.usefulLifeYears === '' || rec.usefulLifeYears == null) rec.usefulLifeYears = cat.usefulLifeYears || '';
            }
          } else if (!rec[def.idKey]) {
            rec.id = store.seqId(def.key, { movements: 'MOV', maintenance: 'MNT', disposals: 'DSP' }[def.key], 5);
          }
          var existing = store.find(def.key, rec[def.idKey], def.idKey);
          rec.updatedAt = now;
          if (existing) Object.keys(rec).forEach(function (k) { existing[k] = rec[k]; });
          else { rec.createdAt = now; s[def.key].push(rec); }
        });
      });
      if (parsed.settings) {
        var z = s.settings, f = parsed.settings, mmdd = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
        if (f.orgName) z.orgName = String(f.orgName);
        if (f.idPrefix) z.idPrefix = String(f.idPrefix).toUpperCase();
        if (parseNumber(f.capThreshold) >= 0 && f.capThreshold !== '') z.capThreshold = parseNumber(f.capThreshold);
        if (+f.fyStartMonth >= 1 && +f.fyStartMonth <= 12) z.fyStartMonth = +f.fyStartMonth;
        if (+f.fyStartDay >= 1 && +f.fyStartDay <= 28) z.fyStartDay = +f.fyStartDay;
        if (mmdd.test(f.tier1End)) z.tier1End = f.tier1End;
        if (mmdd.test(f.tier2End)) z.tier2End = f.tier2End;
        if (f.itaOpeningFy !== undefined) z.itaOpeningFy = f.itaOpeningFy === '' || f.itaOpeningFy == null ? '' : +f.itaOpeningFy;
        ['A', 'B', 'C', 'D'].forEach(function (b) { var v = parseNumber(f['itaOpening' + b]); if (typeof v === 'number') z.itaOpening[b] = v; });
      }
      store.audit('Import', 'Workbook', '', (mode === 'replace' ? 'Replace: ' : 'Merge: ') +
        parsed.sheets.map(function (x) { return x.name + ' +' + x.added + ' / ~' + x.updated + ' / skipped ' + x.skipped; }).join('; '));
      return store.save();
    }
  };

  AMS.excel = excel;
})();
