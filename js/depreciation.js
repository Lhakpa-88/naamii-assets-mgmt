/* Depreciation and fiscal-year calculations. Pure functions, no DOM — also run under Node for tests.
   Rule applied throughout: only assets whose title is with NAAMII are capitalised and depreciated.
   Funder- or partner-owned assets are memo records (expensed to the project when bought). */
(function (root) {
  var ITA_RATES = { A: 0.05, B: 0.25, C: 0.20, D: 0.15 };
  var DAY = 86400000;

  function toMs(iso) { var p = String(iso).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function toIso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(iso, n) { return toIso(toMs(iso) + n * DAY); }
  function daysBetween(a, b) { return Math.round((toMs(b) - toMs(a)) / DAY); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  function fyStart(year, s) { return year + '-' + pad(s.fyStartMonth) + '-' + pad(s.fyStartDay); }
  function fyEnd(year, s) { return addDays(fyStart(year + 1, s), -1); }
  function fyOf(iso, s) { var y = +String(iso).slice(0, 4); return iso >= fyStart(y, s) ? y : y - 1; }
  /* Label in AD and the corresponding Bikram Sambat year, e.g. 2026/27 (BS 2083/84). */
  function fyLabel(year) {
    var bs = year + 57;
    return year + '/' + String(year + 1).slice(2) + ' (BS ' + bs + '/' + String(bs + 1).slice(2) + ')';
  }

  function depBase(a) { return a.depBaseValue !== '' && a.depBaseValue != null ? num(a.depBaseValue) : num(a.cost); }
  function depStart(a) { return a.depStartDate || a.acquisitionDate || ''; }

  function isCapitalised(a, s) {
    return a.ownership === 'NAAMII' && depBase(a) > 0 && depBase(a) >= num(s.capThreshold);
  }
  function treatment(a, s) {
    if (a.ownership !== 'NAAMII') return 'Expensed to project (memo record)';
    if (!isCapitalised(a, s)) return 'Expensed (below capitalisation threshold)';
    return 'Capitalised';
  }

  /* Date on which each asset left the books: completed disposal/handover. */
  function exitDates(disposals) {
    var m = {};
    (disposals || []).forEach(function (d) {
      if (d.status === 'Completed' && d.completedDate) m[d.assetId] = d.completedDate;
    });
    return m;
  }

  /* Straight-line accumulated depreciation up to and including asOf (daily pro-rata, 365-day year). */
  function slAccumulated(a, asOf, exitDate) {
    var start = depStart(a), life = num(a.usefulLifeYears);
    if (!start || life <= 0) return 0;
    var end = exitDate && exitDate < asOf ? exitDate : asOf;
    if (end < start) return 0;
    var depreciable = Math.max(0, depBase(a) - num(a.residualValue));
    var days = daysBetween(start, end) + 1;
    return round2(Math.min(depreciable, depreciable * days / (life * 365)));
  }
  function netBookValue(a, asOf, exitDate) { return round2(depBase(a) - slAccumulated(a, asOf, exitDate)); }

  /* Fixed asset schedule (books) for one fiscal year. */
  function slSchedule(assets, disposals, s, year) {
    var start = fyStart(year, s), end = fyEnd(year, s), exits = exitDates(disposals), rows = [];
    assets.forEach(function (a) {
      if (!isCapitalised(a, s)) return;
      var ds = depStart(a), ex = exits[a.id];
      if (!ds || ds > end) return;
      if (ex && ex < start) return;
      var openingAcc = ds < start ? slAccumulated(a, addDays(start, -1), ex) : 0;
      var closingAcc = slAccumulated(a, end, ex);
      var disposedInYear = !!(ex && ex <= end);
      rows.push({
        id: a.id, name: a.name, categoryCode: a.categoryCode, depStart: ds,
        base: depBase(a), life: num(a.usefulLifeYears), residual: num(a.residualValue),
        addition: ds >= start, openingAcc: openingAcc,
        depForYear: round2(closingAcc - openingAcc), closingAcc: closingAcc,
        nbv: disposedInYear ? 0 : round2(depBase(a) - closingAcc),
        nbvAtDisposal: disposedInYear ? round2(depBase(a) - closingAcc) : null,
        disposedOn: disposedInYear ? ex : ''
      });
    });
    return rows;
  }

  /* Portion of cost absorbed into the pool in the year of purchase — ITA 2058 Sch. 2 s.2(5):
     to end of Poush 3/3, Magh–Chaitra 2/3, Baisakh–year end 1/3; the balance is added next year. */
  function additionTier(iso, s) {
    var y = fyOf(iso, s);
    if (iso <= (y + 1) + '-' + s.tier1End) return 3;
    if (iso <= (y + 1) + '-' + s.tier2End) return 2;
    return 1;
  }

  /* Pooled tax depreciation working (Blocks A–D diminishing balance, Block E straight-line) up to `year`. */
  function itaSchedule(assets, disposals, s, year) {
    var cap = assets.filter(function (a) { return isCapitalised(a, s) && depStart(a); });
    var byId = {}; cap.forEach(function (a) { byId[a.id] = a; });
    var openingFy = s.itaOpeningFy !== '' && s.itaOpeningFy != null ? +s.itaOpeningFy : null;
    var firstFy = openingFy;
    if (firstFy == null) {
      cap.forEach(function (a) { var f = fyOf(depStart(a), s); if (firstFy == null || f < firstFy) firstFy = f; });
      if (firstFy == null) firstFy = year;
    }
    var open = { A: 0, B: 0, C: 0, D: 0 }, carry = { A: 0, B: 0, C: 0, D: 0 }, result = null;
    if (openingFy != null) ['A', 'B', 'C', 'D'].forEach(function (b) { open[b] = num((s.itaOpening || {})[b]); });

    for (var fy = Math.min(firstFy, year); fy <= year; fy++) {
      var blocks = [];
      ['A', 'B', 'C', 'D'].forEach(function (b) {
        var addCost = 0, absorbed = 0, deferred = 0, proceeds = 0;
        cap.forEach(function (a) {
          if (a.itaBlock !== b || fyOf(depStart(a), s) !== fy) return;
          if (openingFy != null && fyOf(depStart(a), s) < openingFy) return;
          var t = additionTier(depStart(a), s), c = depBase(a);
          addCost += c; absorbed += c * t / 3; deferred += c * (3 - t) / 3;
        });
        (disposals || []).forEach(function (d) {
          var a = byId[d.assetId];
          if (!a || a.itaBlock !== b || d.status !== 'Completed' || !d.completedDate) return;
          if (fyOf(d.completedDate, s) === fy) proceeds += num(d.proceeds);
        });
        var gross = open[b] + carry[b] + absorbed;
        var base = Math.max(0, gross - proceeds);
        var excess = Math.max(0, proceeds - gross);           // s.4(1): excess proceeds are income
        var dep = base * ITA_RATES[b];
        if (base - dep < 2000) dep = base;                     // s.2(6): write off small balances
        blocks.push({
          block: b, rate: ITA_RATES[b], opening: round2(open[b]), carryIn: round2(carry[b]),
          additionsCost: round2(addCost), absorbed: round2(absorbed), deferredOut: round2(deferred),
          proceeds: round2(proceeds), base: round2(base), excess: round2(excess),
          depreciation: round2(dep), closing: round2(base - dep)
        });
        open[b] = base - dep; carry[b] = deferred;
      });
      result = { fy: fy, blocks: blocks };
    }

    var exits = exitDates(disposals);
    result.blockE = cap.filter(function (a) { return a.itaBlock === 'E'; }).map(function (a) {
      var life = Math.max(0.5, Math.round(num(a.usefulLifeYears) * 2) / 2);   // nearest half year, s.3(1)
      var startFy = fyOf(depStart(a), s), yearsBefore = year - startFy, annual = depBase(a) / life;
      var ex = exits[a.id], gone = ex && fyOf(ex, s) < year;
      var openingAcc = Math.min(depBase(a), Math.max(0, yearsBefore) * annual);
      var dep = yearsBefore < 0 || gone ? 0 : Math.min(annual, depBase(a) - openingAcc);
      return { id: a.id, name: a.name, cost: depBase(a), life: life, opening: round2(depBase(a) - openingAcc),
        depreciation: round2(dep), closing: round2(depBase(a) - openingAcc - dep) };
    }).filter(function (r) { return r.opening > 0 || r.depreciation > 0; });
    return result;
  }

  var api = {
    ITA_RATES: ITA_RATES, toMs: toMs, toIso: toIso, addDays: addDays, daysBetween: daysBetween, round2: round2, num: num,
    fyStart: fyStart, fyEnd: fyEnd, fyOf: fyOf, fyLabel: fyLabel, depBase: depBase, depStart: depStart,
    isCapitalised: isCapitalised, treatment: treatment, exitDates: exitDates,
    slAccumulated: slAccumulated, netBookValue: netBookValue, slSchedule: slSchedule,
    additionTier: additionTier, itaSchedule: itaSchedule
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.AMS = root.AMS || {}; root.AMS.dep = api; }
})(typeof window !== 'undefined' ? window : globalThis);
