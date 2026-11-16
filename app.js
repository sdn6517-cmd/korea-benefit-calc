/*!
 * 한국 혜택 계산소 — 퇴직금(육아휴직 반영) · 실업급여 · 연말정산 · 출산·육아 4종 통합 계산기
 * 기준일: 2026-11-17 (대한민국)
 *
 * 계산 함수는 모두 DOM과 분리되어 있어 tests/run-tests.js(또는 tests/run.py)에서 그대로 검증합니다.
 * 법령·고시 근거는 about.html 의 '계산 기준' 표를 참고하세요.
 */
(function (global) {
  'use strict';

  var MAN = 10000;
  var EOK = 100000000;

  /* ================================================================== *
   * 0. 공통 유틸
   * ================================================================== */

  function toNum(value, fallback) {
    var f = (fallback === undefined) ? 0 : fallback;
    if (value === null || value === undefined || value === '') return f;
    var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : f;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** 천 단위 쉼표 */
  function comma(n) {
    var v = Math.round(n);
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 원 → "1,234만 5,000원" 읽기용 표기 */
  function koWon(won) {
    var v = Math.round(won);
    if (v === 0) return '0원';
    var sign = v < 0 ? '-' : '';
    v = Math.abs(v);
    var eok = Math.floor(v / EOK);
    var man = Math.floor((v % EOK) / MAN);
    var rest = v % MAN;
    var out = [];
    if (eok > 0) out.push(eok + '억');
    if (man > 0) out.push(comma(man) + '만');
    if (rest > 0) out.push(comma(rest));
    return sign + out.join(' ') + '원';
  }

  /** 원 → "1,234만원" (만 단위 반올림) */
  function manWon(won) {
    var v = Math.round(won / MAN);
    if (v === 0) return '0원';
    return comma(v) + '만원';
  }

  /* ---- 날짜 ---- */

  function parseDate(str) {
    if (!str) return null;
    var m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function utc(d) {
    return Date.UTC(d.y, d.m - 1, d.d);
  }

  function addDays(d, n) {
    var t = new Date(utc(d) + n * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  /** 개월 이동(말일 보정) */
  function addMonths(d, n) {
    var total = (d.y * 12 + (d.m - 1)) + n;
    var y = Math.floor(total / 12);
    var m = total % 12;
    if (m < 0) { m += 12; y -= 1; }
    m += 1;
    return { y: y, m: m, d: Math.min(d.d, daysInMonth(y, m)) };
  }

  /** 두 날짜 사이 일수 (b - a) */
  function diffDays(a, b) {
    return Math.round((utc(b) - utc(a)) / 86400000);
  }

  function fmtDate(d) {
    if (!d) return '';
    var mm = d.m < 10 ? '0' + d.m : String(d.m);
    var dd = d.d < 10 ? '0' + d.d : String(d.d);
    return d.y + '.' + mm + '.' + dd;
  }

  /* ================================================================== *
   * 1. 2026~2027 기준 상수 (법령·고시 원문 확인 — about.html 참고)
   * ================================================================== */

  var C = {
    baseDate: '2026-11-17',
    /* 최저임금 (고용노동부 고시) */
    minWage: { 2026: 10320, 2027: 10700 },
    /* 구직급여 */
    ui: {
      2026: { baseCap: 113500, cap: 68100, rate: 0.6, floorRate: 0.8 },
      /* 2027: 상한액 연동 개정안(입법예고) 기준 — 하한액의 103% 수준 */
      2027: { baseCap: 113500, baseCapFactor: 1.374, planCapRate: 1.03, cap: 68100, rate: 0.6, floorRate: 0.8 }
    },
    /* 육아휴직급여 상한(월) — 2025.1.1 이후 개시분, 2026년 동일 */
    leave: {
      generalCaps: [2500000, 2500000, 2500000, 2000000, 2000000, 2000000, 1600000],
      generalRates: [1, 1, 1, 1, 1, 1, 0.8],
      togetherCaps: [2500000, 2500000, 3000000, 3500000, 4000000, 4500000],
      floor: 700000,
      singleParentCap: 3000000
    },
    /* 출산·육아 지원금 — 현행(2026) */
    firstMeet: { 1: 2000000, 2: 3000000, 3: 3000000 },
    parentBenefit: { 0: 1000000, 1: 500000 },
    daycareFee: { 0: 584000, 1: 515000 },
    childAllowance: { metro: 100000, nonmetro: 105000, depop: 110000 },
    voucherBonus: 10000,
    /* 아동수당 지급 연령 상한(만 나이, 2026년 개정 단계 상향) */
    childAllowanceAgeLimit: { 2026: 9, 2027: 10, 2028: 11, 2029: 12, 2030: 13 },
    /* 출산·육아 지원금 — 2027년 예산안 개편(2027.7.1 이후 출생아 적용 예정) */
    reform: {
      grant: { 1: 10000000, 2: 12000000, 3: 15000000 },
      grantDepopBonus: 5000000,
      childBasic: 200000,
      depopBonus: 100000,
      homeCareBonus: 300000,
      months: 156 /* 0~12세 = 156개월 */
    },
    /* 소득세 */
    tax: {
      brackets: [
        [14000000, 0.06, 0],
        [50000000, 0.15, 1260000],
        [88000000, 0.24, 5760000],
        [150000000, 0.35, 15440000],
        [300000000, 0.38, 19940000],
        [500000000, 0.40, 25940000],
        [1000000000, 0.42, 35940000],
        [Infinity, 0.45, 65940000]
      ],
      localRate: 0.10,
      personal: 1500000,
      standardCredit: 130000,
      childCredit: { 1: 250000, 2: 550000, 3: 550000, extra: 400000 },
      birthCredit: { 1: 300000, 2: 500000, 3: 700000 },
      pensionLimit: 9000000,
      rentLimit: 10000000,
      /* 2026년 사용분 신용카드 등 소득공제 */
      card: {
        threshold: 0.25,
        rate: { credit: 0.15, check: 0.30, market: 0.40, transit: 0.40, culture: 0.30 },
        baseLimitLow: 3000000,
        baseLimitHigh: 2500000,
        childBonusLow: 500000,
        childBonusHigh: 250000,
        extraLimitLow: 3000000,
        extraLimitHigh: 2000000
      },
      /* 4대보험 근로자 부담 (2026) */
      insurance: { pension: 0.0475, health: 0.03595, longterm: 0.004724, employ: 0.009, pensionCap: 6590000, pensionFloor: 410000 }
    }
  };

  /* ================================================================== *
   * 2. 퇴직금 — 육아휴직·출산전후휴가 기간 반영
   * ================================================================== */

  /** 재직일수 (입사일~퇴직일, 양 끝 포함) */
  function serviceDays(hire, last) {
    return diffDays(hire, last) + 1;
  }

  /** 기간 목록에서 하루가 제외기간에 속하는지 */
  function isExcludedDay(d, periods) {
    var t = utc(d);
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (!p.start || !p.end) continue;
      if (t >= utc(p.start) && t <= utc(p.end)) return true;
    }
    return false;
  }

  /** [a,b] 구간에서 제외기간에 속하는 일수 */
  function excludedDaysIn(a, b, periods) {
    if (diffDays(a, b) < 0) return 0;
    var n = 0;
    for (var d = a; diffDays(d, b) >= 0; d = addDays(d, 1)) {
      if (isExcludedDay(d, periods)) n++;
    }
    return n;
  }

  /** 특정 날짜를 포함하는 제외기간 */
  function periodAt(d, periods) {
    var t = utc(d);
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (!p.start || !p.end) continue;
      if (t >= utc(p.start) && t <= utc(p.end)) return p;
    }
    return null;
  }

  /**
   * 평균임금 산정을 위한 실제 임금 산정기간
   * - 기본: 퇴직일 이전 3개월
   * - 제외기간이 있으면 그 일수만큼 과거로 늘려 총일수를 복원 (근로기준법 시행령 §2①)
   * - 3개월이 통째로 제외되면 제외기간 최초일을 산정사유 발생일로 보아 그 이전 3개월
   */
  function wageWindow(last, periods) {
    var end = last;
    var guard = 0;
    var start = addDays(addMonths(end, -3), 1);
    var total = diffDays(start, end) + 1;
    var excl = excludedDaysIn(start, end, periods);

    while (total - excl <= 0 && guard++ < 8) {
      var p = periodAt(start, periods) || periodAt(addDays(start, 1), periods);
      if (!p) break;
      end = addDays(p.start, -1);
      start = addDays(addMonths(end, -3), 1);
      total = diffDays(start, end) + 1;
      excl = excludedDaysIn(start, end, periods);
    }

    if (excl > 0) {
      var need = excl;
      var cursor = addDays(start, -1);
      var g2 = 0;
      while (need > 0 && g2++ < 800) {
        if (!isExcludedDay(cursor, periods)) { need--; start = cursor; }
        cursor = addDays(cursor, -1);
      }
    }

    var daysTotal = diffDays(start, end) + 1;
    var daysExcluded = excludedDaysIn(start, end, periods);
    return {
      start: start,
      end: end,
      days: daysTotal,
      excluded: daysExcluded,
      included: daysTotal - daysExcluded
    };
  }

  /** 월 소정근로시간 (주 40시간 → 209시간) */
  function monthlyHours(weeklyHours) {
    var h = clamp(toNum(weeklyHours, 40), 1, 68);
    return Math.round((h + h / 5) * 365 / 12 / 7);
  }

  /** 1일 통상임금 */
  function dailyOrdinaryWage(monthlyWage, weeklyHours) {
    var hours = monthlyHours(weeklyHours);
    return Math.floor(toNum(monthlyWage) / hours * 8);
  }

  /**
   * 퇴직금 계산
   * @param {{hire:string,last:string,base:number,fixed:number,variable:number,
   *          bonus:number,leavePay:number,ordinary:number,weeklyHours:number,
   *          unusedDays:number,periods:Array}} o
   */
  function calcSeverance(o) {
    o = o || {};
    var hire = parseDate(o.hire);
    var last = parseDate(o.last);
    var weeklyHours = clamp(toNum(o.weeklyHours, 40), 1, 68);

    var base = Math.max(0, toNum(o.base));
    var fixed = Math.max(0, toNum(o.fixed));
    var variable = Math.max(0, toNum(o.variable));
    var bonus = Math.max(0, toNum(o.bonus));
    var leavePay = Math.max(0, toNum(o.leavePay));
    var ordinary = Math.max(0, toNum(o.ordinary));
    var unusedDays = clamp(toNum(o.unusedDays), 0, 60);

    var periods = [];
    (o.periods || []).forEach(function (p) {
      var s = parseDate(p.start);
      var e = parseDate(p.end);
      if (s && e && diffDays(s, e) >= 0) periods.push({ type: p.type || 'parental', start: s, end: e });
    });

    var days = 0, months = 0, years = 0;
    var win = null;
    if (hire && last && diffDays(hire, last) >= 0) {
      days = serviceDays(hire, last);
      var mo = (last.y - hire.y) * 12 + (last.m - hire.m);
      if (last.d < hire.d) mo -= 1;
      months = Math.max(0, mo);
      years = Math.floor(months / 12);
      win = wageWindow(last, periods);
    }

    /* 3개월 임금총액 — 제외일은 임금이 없는 것으로 보고 그 일수만큼 산정기간을 늘림 */
    var monthlyWage = base + fixed;
    var wageBase = 0;
    var leaveDaysInWindow = 0;
    if (win) {
      for (var d = win.start; diffDays(d, win.end) >= 0; d = addDays(d, 1)) {
        if (isExcludedDay(d, periods)) { leaveDaysInWindow++; continue; }
        wageBase += monthlyWage / daysInMonth(d.y, d.m);
      }
    }
    var includeRatio = win && win.days > 0 ? win.included / win.days : 0;
    var variablePart = variable * includeRatio;
    var bonusPart = bonus * 3 / 12;
    var leavePart = leavePay * 3 / 12;
    var avgSum = wageBase + variablePart + bonusPart + leavePart;
    var dayAvg = win && win.included > 0 ? Math.floor(avgSum / win.included) : 0;

    var dailyOrd = dailyOrdinaryWage(ordinary, weeklyHours);
    var applied = Math.max(dayAvg, dailyOrd);
    var basis = (dailyOrd > dayAvg) ? '통상임금' : '평균임금';

    var eligible = days >= 365;
    var severance = eligible ? Math.round(applied * 30 * days / 365) : 0;
    var leaveAllowance = Math.floor(dailyOrd * unusedDays);

    return {
      serviceDays: days,
      serviceMonths: months,
      serviceYears: years,
      window: win ? { start: fmtDate(win.start), end: fmtDate(win.end), days: win.days, excluded: win.excluded, included: win.included } : null,
      wageBase: Math.round(wageBase),
      monthlyWage: monthlyWage,
      variablePart: Math.round(variablePart),
      bonusPart: Math.round(bonusPart),
      leavePart: Math.round(leavePart),
      avgSum: Math.round(avgSum),
      dayAvg: dayAvg,
      dailyOrdinary: dailyOrd,
      applied: applied,
      basis: basis,
      eligible: eligible,
      severance: severance,
      leaveAllowance: leaveAllowance,
      accruedDays: 0,
      unusedDays: unusedDays,
      total: severance + leaveAllowance,
      weeklyHours: weeklyHours,
      monthlyHours: monthlyHours(weeklyHours),
      leaveDays: periods.reduce(function (s, p) { return s + (diffDays(p.start, p.end) + 1); }, 0),
      leaveDaysInWindow: leaveDaysInWindow
    };
  }

  /* ================================================================== *
   * 3. 실업급여(구직급여)
   * ================================================================== */

  /** 소정급여일수 (고용보험법 §50 별표1) */
  function benefitDays(age, insMonths, disabled) {
    var a = Math.max(0, Math.round(toNum(age)));
    var m = Math.max(0, toNum(insMonths));
    var senior = (a >= 50) || !!disabled;
    if (m < 12) return 120;
    if (m < 36) return senior ? 180 : 150;
    if (m < 60) return senior ? 210 : 180;
    if (m < 120) return senior ? 240 : 210;
    return senior ? 270 : 240;
  }

  /** 만 나이 (기준일 현재) */
  function fullAge(birth, at) {
    if (!birth || !at) return 0;
    var a = at.y - birth.y;
    if (at.m < birth.m || (at.m === birth.m && at.d < birth.d)) a -= 1;
    return Math.max(0, a);
  }

  /**
   * 구직급여 계산
   * @param {{last:string,birth:string,insYears:number,insMonths:number,disabled:boolean,
   *          wage3m:number,hours:number,plan2027:boolean}} o
   */
  function calcUnemployment(o) {
    o = o || {};
    var last = parseDate(o.last) || { y: 2026, m: 11, d: 17 };
    var birth = parseDate(o.birth);
    var year = last.y >= 2027 ? 2027 : 2026;
    var minWage = C.minWage[year] || C.minWage[2027];
    var hours = clamp(toNum(o.hours, 8), 1, 8);

    var age = birth ? fullAge(birth, last) : clamp(toNum(o.age, 35), 15, 80);
    var insMonthsTotal = Math.max(0, toNum(o.insYears)) * 12 + Math.max(0, toNum(o.insMonths));
    var wage3m = Math.max(0, toNum(o.wage3m));
    var d3 = clamp(diffDays(addDays(addMonths(last, -3), 1), last) + 1, 28, 93);

    var baseDailyRaw = d3 > 0 ? Math.floor(wage3m / d3) : 0;
    var floorBase = minWage * hours;              /* 최저기초일액 */
    var ui = C.ui[year];
    var baseCap;
    if (year === 2027 && o.plan2027) {
      baseCap = Math.floor(minWage * 8 * ui.baseCapFactor);   /* 입법예고 개정안 */
    } else {
      baseCap = ui.baseCap;
    }
    var baseDaily = Math.max(baseDailyRaw, floorBase);
    baseDaily = Math.min(baseDaily, baseCap);

    var raw60 = Math.floor(baseDaily * ui.rate);
    var floorPay = Math.floor(floorBase * ui.floorRate);
    var capPay = Math.floor(baseCap * ui.rate);
    var daily = Math.max(raw60, floorPay);

    var applied;
    if (raw60 >= floorPay && baseDailyRaw <= baseCap) applied = '기초일액의 60%';
    else if (raw60 >= floorPay) applied = '상한액';
    else applied = '하한액';
    if (floorPay > capPay) applied = '하한액(상한 역전)';

    var days = benefitDays(age, insMonthsTotal, o.disabled);
    return {
      year: year,
      minWage: minWage,
      age: age,
      hours: hours,
      insMonths: insMonthsTotal,
      days3m: d3,
      baseDailyRaw: baseDailyRaw,
      floorBase: floorBase,
      baseCap: baseCap,
      baseDaily: baseDaily,
      raw60: raw60,
      floorPay: floorPay,
      capPay: capPay,
      daily: daily,
      applied: applied,
      days: days,
      total: daily * days,
      monthly: daily * 30,
      monthly6: daily * 26,
      senior: (age >= 50) || !!o.disabled,
      plan2027: !!o.plan2027
    };
  }

  /* ================================================================== *
   * 4. 연말정산 (2026년 귀속 간이 시뮬레이터)
   * ================================================================== */

  /** 근로소득공제 (소득세법 §47) */
  function earnedIncomeDeduction(gross) {
    var g = Math.max(0, toNum(gross));
    var d;
    if (g <= 5000000) d = g * 0.7;
    else if (g <= 15000000) d = 3500000 + (g - 5000000) * 0.4;
    else if (g <= 45000000) d = 7500000 + (g - 15000000) * 0.15;
    else if (g <= 100000000) d = 12000000 + (g - 45000000) * 0.05;
    else d = 14750000 + (g - 100000000) * 0.02;
    return Math.floor(Math.min(d, 20000000));
  }

  /** 산출세액 (소득세법 §55 기본세율) */
  function incomeTax(taxBase) {
    var t = Math.max(0, toNum(taxBase));
    for (var i = 0; i < C.tax.brackets.length; i++) {
      var b = C.tax.brackets[i];
      if (t <= b[0]) return Math.floor(Math.max(0, t * b[1] - b[2]));
    }
    return 0;
  }

  /** 근로소득세액공제 한도 (소득세법 §59②) */
  function earnedTaxCreditLimit(gross) {
    var g = Math.max(0, toNum(gross));
    if (g <= 33000000) return 740000;
    if (g <= 70000000) return Math.max(660000, Math.floor(740000 - (g - 33000000) * 0.008));
    if (g <= 120000000) return Math.max(500000, Math.floor(660000 - (g - 70000000) * 0.5));
    return Math.max(200000, Math.floor(500000 - (g - 120000000) * 0.5));
  }

  /** 근로소득세액공제액 */
  function earnedTaxCredit(calculated, gross) {
    var t = Math.max(0, toNum(calculated));
    var credit = t <= 1300000 ? t * 0.55 : 715000 + (t - 1300000) * 0.3;
    return Math.floor(Math.min(credit, earnedTaxCreditLimit(gross)));
  }

  /** 신용카드 등 소득공제 (조세특례제한법 §126조의2, 2026년 사용분) */
  function cardDeduction(o) {
    var gross = Math.max(0, toNum(o.gross));
    var credit = Math.max(0, toNum(o.credit));
    var check = Math.max(0, toNum(o.check));
    var market = Math.max(0, toNum(o.market));
    var transit = Math.max(0, toNum(o.transit));
    var culture = Math.max(0, toNum(o.culture));
    var children = clamp(Math.round(toNum(o.children)), 0, 9);

    var cfg = C.tax.card;
    var lowIncome = gross <= 70000000;
    var baseLimit = lowIncome ? cfg.baseLimitLow : cfg.baseLimitHigh;
    baseLimit += children >= 2 ? (lowIncome ? cfg.childBonusLow * 2 : cfg.childBonusHigh * 2)
      : children === 1 ? (lowIncome ? cfg.childBonusLow : cfg.childBonusHigh) : 0;
    var extraLimit = lowIncome ? cfg.extraLimitLow : cfg.extraLimitHigh;

    var cultureEligible = lowIncome ? culture : 0;
    var spend = credit + check + market + transit + cultureEligible;
    var threshold = gross * cfg.threshold;
    if (spend <= threshold) {
      return {
        deduction: 0, spend: spend, threshold: threshold,
        baseLimit: baseLimit, extraLimit: extraLimit, raw: 0, extra: 0
      };
    }

    var marketPart = market * cfg.rate.market;
    var transitPart = transit * cfg.rate.transit;
    var culturePart = cultureEligible * cfg.rate.culture;

    /* 공제액 = Σ(사용처별 사용액 × 공제율) − 최저사용금액 × 15% */
    var raw = credit * cfg.rate.credit + check * cfg.rate.check + marketPart + transitPart + culturePart
      - threshold * cfg.rate.credit;
    raw = Math.max(0, raw);

    var overBase = Math.max(0, raw - baseLimit);
    var extraEligible = marketPart + transitPart + culturePart;
    var extra = Math.min(overBase, extraEligible, extraLimit);
    var deduction = Math.min(raw, baseLimit) + extra;

    return {
      deduction: Math.floor(deduction),
      spend: spend,
      threshold: threshold,
      baseLimit: baseLimit,
      extraLimit: extraLimit,
      raw: Math.floor(raw),
      extra: Math.floor(extra)
    };
  }

  /**
   * 연말정산 간이 계산
   * @param {{gross:number,dependents:number,children:number,childTax:number,
   *          birthOrder:number,insurance:number,rent:number,homeless:boolean,
   *          pension:number,cardCredit:number,cardCheck:number,cardMarket:number,
   *          cardTransit:number,cardCulture:number,withheld:number,filed:boolean}} o
   */
  function calcYearend(o) {
    o = o || {};
    var gross = Math.max(0, toNum(o.gross));
    var dependents = clamp(Math.round(toNum(o.dependents)), 0, 10);   /* 본인 제외 */
    var children = clamp(Math.round(toNum(o.children)), 0, 9);
    var childTax = clamp(Math.round(toNum(o.childTax)), 0, children);
    var birthOrder = clamp(Math.round(toNum(o.birthOrder)), 0, 3);
    var homeless = !!o.homeless;
    var rent = Math.max(0, toNum(o.rent));
    var pension = Math.max(0, toNum(o.pension));
    var insurance = Math.max(0, toNum(o.insurance));

    var earnedDed = earnedIncomeDeduction(gross);
    var earnedIncome = Math.max(0, gross - earnedDed);
    var personalDed = C.tax.personal * (1 + dependents + children);
    var card = cardDeduction({
      gross: gross,
      credit: o.cardCredit,
      check: o.cardCheck,
      market: o.cardMarket,
      transit: o.cardTransit,
      culture: o.cardCulture,
      children: children
    });
    var totalDeduction = personalDed + insurance + card.deduction;
    var taxBase = Math.max(0, earnedIncome - totalDeduction);
    var calculated = incomeTax(taxBase);

    /* 세액공제 */
    var creditEarned = earnedTaxCredit(calculated, gross);

    var childCredit = 0;
    if (childTax >= 3) childCredit = C.tax.childCredit[3] + (childTax - 2) * C.tax.childCredit.extra;
    else if (childTax === 2) childCredit = C.tax.childCredit[2];
    else if (childTax === 1) childCredit = C.tax.childCredit[1];

    var birthCredit = birthOrder > 0 ? C.tax.birthCredit[birthOrder] : 0;

    var pensionRate = gross <= 55000000 ? 0.15 : 0.12;
    var pensionBase = Math.min(pension, C.tax.pensionLimit);
    var pensionCredit = Math.floor(pensionBase * pensionRate);

    var rentEligible = homeless && gross <= 80000000;
    var rentRate = gross <= 55000000 ? 0.17 : 0.15;
    var rentBase = rentEligible ? Math.min(rent, C.tax.rentLimit) : 0;
    var rentCredit = Math.floor(rentBase * rentRate);

    /* 표준세액공제는 특별소득공제(보험료)·특별세액공제를 신청하지 않았을 때만 */
    var standardCredit = insurance > 0 ? 0 : C.tax.standardCredit;

    var credits = creditEarned + childCredit + birthCredit + pensionCredit + rentCredit + standardCredit;
    var decided = Math.max(0, calculated - credits);
    var localTax = Math.floor(decided * C.tax.localRate);

    /* 원천징수(기납부) 추정 — 간이세액표 방식: 인적공제 + 연금보험료 + 근로소득세액공제 */
    var withheldModel;
    var wDed = C.tax.personal * (o.filed === false ? 1 : (1 + dependents + children));
    var wBase = Math.max(0, earnedIncome - wDed - insurance);
    var wCalc = incomeTax(wBase);
    var wCredit = earnedTaxCredit(wCalc, gross);
    withheldModel = Math.max(0, wCalc - wCredit);
    var withheld = o.withheld !== undefined && o.withheld !== null && o.withheld !== '' && toNum(o.withheld) >= 0
      ? toNum(o.withheld) : withheldModel;
    var withheldGiven = !(o.withheld === undefined || o.withheld === null || o.withheld === '');

    var refund = withheld - decided;

    return {
      gross: gross,
      earnedDed: earnedDed,
      earnedIncome: earnedIncome,
      personalDed: personalDed,
      insurance: insurance,
      cardDeduction: card.deduction,
      cardInfo: card,
      totalDeduction: totalDeduction,
      taxBase: taxBase,
      calculated: calculated,
      creditEarned: creditEarned,
      childCredit: childCredit,
      birthCredit: birthCredit,
      pensionCredit: pensionCredit,
      rentCredit: rentCredit,
      standardCredit: standardCredit,
      credits: credits,
      decided: decided,
      localTax: localTax,
      totalTax: decided + localTax,
      withheld: withheld,
      withheldModel: withheldModel,
      withheldGiven: withheldGiven,
      refund: refund,
      marginalRate: (function () {
        var extra = incomeTax(taxBase + 1000000) - calculated;
        return extra / 1000000;
      })(),
      deductSaving: Math.floor((personalDed + card.deduction) * ((incomeTax(taxBase + 1000000) - calculated) / 1000000))
    };
  }

  /** 4대보험 근로자 부담 추정 (2026) */
  function insuranceEstimate(monthlyGross) {
    var m = Math.max(0, toNum(monthlyGross));
    var pensionBase = clamp(m, C.tax.insurance.pensionFloor, C.tax.insurance.pensionCap);
    var pension = Math.floor(pensionBase * C.tax.insurance.pension);
    var health = Math.floor(m * C.tax.insurance.health);
    var longterm = Math.floor(health * (C.tax.insurance.longterm / C.tax.insurance.health));
    var employ = Math.floor(m * C.tax.insurance.employ);
    return { pension: pension, health: health, longterm: longterm, employ: employ, monthly: pension + health + longterm + employ, annual: (pension + health + longterm + employ) * 12 };
  }

  /* ================================================================== *
   * 5. 출산·육아 지원금 (현행 2026 / 2027.7 개편안 비교)
   * ================================================================== */

  function firstMeetAmount(order) {
    return C.firstMeet[clamp(Math.round(toNum(order, 1)), 1, 3)];
  }

  function childAllowanceMonthly(region, voucher) {
    var base = C.childAllowance[region];
    if (base === undefined) base = C.childAllowance.metro;
    return base + ((region === 'depop') && voucher ? C.voucherBonus : 0);
  }

  function parentBenefitMonthly(age, care) {
    var a = (Math.round(toNum(age, 0)) === 0) ? 0 : 1;
    var gross = C.parentBenefit[a];
    if (care === 'daycare') return Math.max(0, gross - C.daycareFee[a]);
    return gross;
  }

  function parentBenefitTotal(care) {
    return parentBenefitMonthly(0, care) * 12 + parentBenefitMonthly(1, care) * 12;
  }

  /**
   * 아동수당 누적액 — 지급 연령 상한이 2030년까지 매년 1세씩 오르는 것을 반영
   * @param {number} birthYear
   * @param {number} birthMonth
   * @param {number} monthly
   */
  function childAllowanceTotal(birthYear, birthMonth, monthly) {
    var total = 0, months = 0;
    for (var i = 0; i < 200; i++) {
      var idx = (birthMonth - 1) + i;
      var year = birthYear + Math.floor(idx / 12);
      var age = Math.floor(i / 12);
      var limit = C.childAllowanceAgeLimit[year];
      if (limit === undefined) limit = 13;
      if (age >= limit) break;
      total += monthly;
      months++;
    }
    return { total: total, months: months };
  }

  /** 육아휴직급여 한 달치 */
  function leavePayMonth(wage, month, mode) {
    var m = Math.max(1, Math.round(toNum(month, 1)));
    var rate, cap;
    if (mode === 'together' && m <= 6) {
      rate = 1;
      cap = C.leave.togetherCaps[m - 1];
    } else {
      var idx = Math.min(m, 7) - 1;
      rate = C.leave.generalRates[idx];
      cap = C.leave.generalCaps[idx];
    }
    var raw = Math.round(toNum(wage) * rate);
    return Math.min(cap, Math.max(C.leave.floor, raw));
  }

  function leavePayTotal(wage, months, mode) {
    var n = clamp(Math.round(toNum(months)), 0, 18);
    var sum = 0;
    for (var i = 1; i <= n; i++) sum += leavePayMonth(wage, i, mode);
    return sum;
  }

  function leavePayMixed(wage, months, togetherMonths) {
    var n = clamp(Math.round(toNum(months)), 0, 18);
    var t = clamp(Math.round(toNum(togetherMonths)), 0, 6);
    var sum = 0;
    for (var i = 1; i <= n; i++) sum += leavePayMonth(wage, i, i <= t ? 'together' : 'general');
    return sum;
  }

  /**
   * 출산·육아 지원금 통합 계산 — 현행과 2027년 개편안을 함께 계산
   * @param {{order:number,region:string,voucher:boolean,care:string,birthYear:number,
   *          wageA:number,wageB:number,leaveType:string,monthsA:number,monthsB:number}} o
   */
  function calcChildbirth(o) {
    o = o || {};
    var order = clamp(Math.round(toNum(o.order, 1)), 1, 3);
    var region = o.region || 'metro';
    var depop = region === 'depop';
    var care = o.care === 'daycare' ? 'daycare' : 'home';
    var birthYear = clamp(Math.round(toNum(o.birthYear, 2026)), 2026, 2028);
    var birthMonth = clamp(Math.round(toNum(o.birthMonth, 1)), 1, 12);

    /* --- 현행 제도 --- */
    var firstMeet = firstMeetAmount(order);
    var parentTotal = parentBenefitTotal(care);
    var childMonthly = childAllowanceMonthly(region, !!o.voucher);
    var child = childAllowanceTotal(birthYear, birthMonth, childMonthly);
    var cashNow = firstMeet + parentTotal + child.total;

    /* --- 2027.7.1 이후 출생아 개편안 --- */
    var r = C.reform;
    var grant = r.grant[order] + (depop ? r.grantDepopBonus : 0);
    var basicBase = r.childBasic + (depop ? r.depopBonus : 0);
    var homeBonus = (care === 'home') ? r.homeCareBonus : 0;
    var basicMonthly = basicBase + homeBonus;
    var basicTotal = (basicBase + homeBonus) * 24 + basicBase * (r.months - 24);
    var cashReform = grant + basicTotal;

    /* --- 육아휴직급여 --- */
    var wageA = Math.max(0, toNum(o.wageA));
    var wageB = Math.max(0, toNum(o.wageB));
    var monthsA = clamp(Math.round(toNum(o.monthsA)), 0, 18);
    var monthsB = clamp(Math.round(toNum(o.monthsB)), 0, 18);
    var leaveType = o.leaveType || 'together';
    var common = 0, leaveA = 0, leaveB = 0;
    if (leaveType === 'general') {
      leaveA = leavePayTotal(wageA, monthsA, 'general');
      leaveB = leavePayTotal(wageB, monthsB, 'general');
    } else if (leaveType === 'together') {
      common = Math.min(monthsA, monthsB, 6);
      leaveA = leavePayMixed(wageA, monthsA, common);
      leaveB = leavePayMixed(wageB, monthsB, common);
    }

    var regime = birthYear >= 2028 ? 'reform' : (birthYear === 2027 && birthMonth >= 7 ? 'reform' : 'now');
    var applied = regime === 'reform' ? cashReform : cashNow;

    return {
      order: order,
      region: region,
      depop: depop,
      care: care,
      birthYear: birthYear,
      birthMonth: birthMonth,
      regime: regime,
      /* 현행 */
      firstMeet: firstMeet,
      parentMonthly: [parentBenefitMonthly(0, care), parentBenefitMonthly(1, care)],
      parentTotal: parentTotal,
      childMonthly: childMonthly,
      childMonths: child.months,
      childTotal: child.total,
      cashNow: cashNow,
      /* 개편안 */
      grant: grant,
      basicBase: basicBase,
      basicMonthly: basicMonthly,
      basicTotal: basicTotal,
      cashReform: cashReform,
      reformDiff: cashReform - cashNow,
      /* 육아휴직 */
      leaveA: leaveA,
      leaveB: leaveB,
      leaveTotal: leaveA + leaveB,
      commonMonths: common,
      leaveType: leaveType,
      /* 합계 */
      applied: applied,
      grandNow: cashNow + leaveA + leaveB,
      grandReform: cashReform + leaveA + leaveB
    };
  }

  /* ================================================================== *
   * 6. 내보내기
   * ================================================================== */

  var api = {
    C: C,
    comma: comma,
    koWon: koWon,
    manWon: manWon,
    parseDate: parseDate,
    addDays: addDays,
    addMonths: addMonths,
    diffDays: diffDays,
    fmtDate: fmtDate,
    monthlyHours: monthlyHours,
    dailyOrdinaryWage: dailyOrdinaryWage,
    wageWindow: wageWindow,
    calcSeverance: calcSeverance,
    benefitDays: benefitDays,
    fullAge: fullAge,
    calcUnemployment: calcUnemployment,
    earnedIncomeDeduction: earnedIncomeDeduction,
    incomeTax: incomeTax,
    earnedTaxCredit: earnedTaxCredit,
    earnedTaxCreditLimit: earnedTaxCreditLimit,
    cardDeduction: cardDeduction,
    calcYearend: calcYearend,
    insuranceEstimate: insuranceEstimate,
    firstMeetAmount: firstMeetAmount,
    childAllowanceMonthly: childAllowanceMonthly,
    parentBenefitMonthly: parentBenefitMonthly,
    childAllowanceTotal: childAllowanceTotal,
    leavePayMonth: leavePayMonth,
    leavePayTotal: leavePayTotal,
    leavePayMixed: leavePayMixed,
    calcChildbirth: calcChildbirth
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.BenefitCalc = api;

  /* ================================================================== *
   * 7. 화면 (DOM) — 브라우저에서만 실행
   * ================================================================== */

  if (typeof document === 'undefined') return;

  var lastResults = {};

  function $(id) { return document.getElementById(id); }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function setHTML(id, html) { var el = $(id); if (el) el.innerHTML = html; }
  function setBadge(id, text, tone) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'badge ' + (tone || 'badge-neutral');
  }
  function radioValue(name, fallback) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : fallback;
  }
  function checkValue(id) {
    var el = $(id);
    return !!(el && el.checked);
  }
  function val(id, fallback) {
    var el = $(id);
    return el ? toNum(el.value, fallback) : fallback;
  }
  function dateVal(id) {
    var el = $(id);
    return el && el.value ? el.value : '';
  }
  function won(n) { return comma(n) + '원'; }

  /* ---------- 퇴직금 ---------- */

  function collectPeriods() {
    var out = [];
    [1, 2].forEach(function (i) {
      var type = radioValue('sv-p' + i + '-type', 'none');
      var s = dateVal('sv-p' + i + '-start');
      var e = dateVal('sv-p' + i + '-end');
      if (type !== 'none' && s && e) out.push({ type: type, start: s, end: e });
    });
    return out;
  }

  function renderSeverance() {
    var ordinary = val('sv-ordinary', 0) || val('sv-base', 0) + val('sv-fixed', 0);
    var r = calcSeverance({
      hire: dateVal('sv-hire'),
      last: dateVal('sv-last'),
      base: val('sv-base', 0),
      fixed: val('sv-fixed', 0),
      variable: val('sv-variable', 0),
      bonus: val('sv-bonus', 0),
      leavePay: val('sv-leave-pay', 0),
      ordinary: ordinary,
      weeklyHours: val('sv-hours', 40),
      unusedDays: val('sv-unused', 0),
      periods: collectPeriods()
    });
    lastResults.severance = r;

    setText('sv-total', r.eligible ? won(r.severance) : '0원');
    setText('sv-total-ko', r.eligible
      ? manWon(r.severance) + (r.leaveAllowance > 0 ? ' · 연차수당 ' + manWon(r.leaveAllowance) + ' 별도' : ' · 미사용 연차수당 없음')
      : '1년 미만 근속 — 법정 퇴직금 지급 대상이 아닙니다');
    setText('sv-days', comma(r.serviceDays) + '일');
    setText('sv-years', r.serviceYears + '년 ' + (r.serviceMonths % 12) + '개월');
    setText('sv-window', r.window ? (r.window.start + ' ~ ' + r.window.end) : '—');
    setText('sv-window-days', r.window ? comma(r.window.days) + '일' : '—');
    setText('sv-excluded', r.window ? comma(r.window.excluded) + '일' : '—');
    setText('sv-included', r.window ? comma(r.window.included) + '일' : '—');
    setText('sv-day-avg', won(r.dayAvg));
    setText('sv-applied', won(r.applied));
    setText('sv-basis', r.basis);
    setText('sv-leave-days', comma(r.leaveDays) + '일');
    setText('sv-leave-window', comma(r.leaveDaysInWindow) + '일');
    setText('sv-allowance', won(r.leaveAllowance));
    setText('sv-grand', won(r.total));

    var badgeText;
    if (!r.eligible) badgeText = '근속 1년 미만';
    else if (r.window && r.window.excluded > 0) badgeText = '2026년 기준 · 산정기간 ' + r.window.excluded + '일 제외 반영';
    else if (r.window && r.leaveDays > 0) badgeText = '2026년 기준 · 휴직 전 3개월로 산정';
    else badgeText = '2026년 기준 · 제외기간 없음';
    setBadge('sv-badge', badgeText, r.eligible ? 'badge-ok' : 'badge-warn');

    var rows = '';
    rows += '<tr><td>기본급·고정수당</td><td class="num">' + won(Math.round(r.wageBase)) + '</td></tr>';
    rows += '<tr><td>변동수당(3개월)</td><td class="num">' + won(r.variablePart) + '</td></tr>';
    rows += '<tr><td>연간 상여금 × 3/12</td><td class="num">' + won(r.bonusPart) + '</td></tr>';
    rows += '<tr><td>연차수당 × 3/12</td><td class="num">' + won(r.leavePart) + '</td></tr>';
    rows += '<tr class="row-strong"><td>임금총액 합계</td><td class="num">' + won(r.avgSum) + '</td></tr>';
    rows += '<tr><td>÷ 산정일수</td><td class="num">' + comma(r.window ? r.window.included : 0) + '일</td></tr>';
    rows += '<tr class="row-strong"><td>1일 평균임금</td><td class="num">' + won(r.dayAvg) + '</td></tr>';
    rows += '<tr><td>1일 통상임금</td><td class="num">' + won(r.dailyOrdinary) + '</td></tr>';
    rows += '<tr><td>적용 1일 임금(' + r.basis + ')</td><td class="num">' + won(r.applied) + '</td></tr>';
    rows += '<tr><td>× 30일 × ' + comma(r.serviceDays) + '일 ÷ 365일</td><td class="num">' + won(r.severance) + '</td></tr>';
    setHTML('sv-rows', rows);

    var note;
    if (!r.eligible) {
      note = '계속근로기간이 1년 미만이면 법정 퇴직금(근로자퇴직급여 보장법 §8) 지급 대상이 아닙니다. 다만 취업규칙이나 근로계약에서 더 넓게 정했다면 그 기준을 따릅니다.';
    } else if (r.window && r.window.excluded > 0) {
      note = '육아휴직·출산전후휴가 기간 ' + comma(r.window.excluded) + '일은 계속근로기간에는 들어가지만 평균임금 산정기간과 임금총액에서는 빠집니다(근로기준법 시행령 §2①). 그래서 산정기간을 ' + r.window.start + '까지 늘려 총일수를 복원했고, 그 기간에 지급된 임금은 넣지 않았습니다.';
    } else {
      note = '퇴직일 이전 3개월(' + (r.window ? r.window.start + ' ~ ' + r.window.end : '—') + ') 임금총액을 그 기간 총일수로 나눈 1일 평균임금에 30일을 곱하고, 재직일수/365를 곱합니다. 평균임금이 통상임금보다 적으면 통상임금을 씁니다(근로기준법 §2②).';
    }
    setText('sv-note', note);
  }

  /* ---------- 실업급여 ---------- */

  function renderUnemployment() {
    var r = calcUnemployment({
      last: dateVal('ui-last'),
      birth: dateVal('ui-birth'),
      insYears: val('ui-ins-years', 0),
      insMonths: val('ui-ins-months', 0),
      disabled: checkValue('ui-disabled'),
      wage3m: (function () {
        var manual = val('ui-wage3m', 0);
        if (manual > 0) return manual;
        return val('ui-monthly', 0) * 3;
      })(),
      hours: val('ui-hours', 8),
      plan2027: checkValue('ui-plan')
    });
    lastResults.unemployment = r;

    setText('ui-daily', won(r.daily));
    setText('ui-daily-ko', manWon(r.daily) + ' · ' + r.applied + ' 적용');
    setText('ui-days', comma(r.days) + '일');
    setText('ui-total', won(r.total));
    setText('ui-total-ko', manWon(r.total) + ' · ' + r.year + '년 이직 기준');
    setText('ui-monthly-out', won(r.monthly));
    setText('ui-monthly6', won(r.monthly6));
    setText('ui-base', won(r.baseDaily));
    setText('ui-base-raw', won(r.baseDailyRaw));
    setText('ui-age', r.age + '세');
    setText('ui-ins', r.insMonths + '개월');
    setText('ui-3m-days', r.days3m + '일');
    setText('ui-minwage', comma(r.minWage) + '원');
    setBadge('ui-badge', r.year + '년 이직 · ' + r.applied, r.applied === '하한액' || r.applied === '하한액(상한 역전)' ? 'badge-warn' : 'badge-ok');

    var rows = '';
    rows += '<tr><td>이직 전 3개월 임금총액 ÷ ' + r.days3m + '일</td><td class="num">' + won(r.baseDailyRaw) + '</td></tr>';
    rows += '<tr><td>최저기초일액(최저임금 ' + comma(r.minWage) + '원 × ' + r.hours + '시간)</td><td class="num">' + won(r.floorBase) + '</td></tr>';
    rows += '<tr><td>기초일액 상한</td><td class="num">' + won(r.baseCap) + '</td></tr>';
    rows += '<tr class="row-strong"><td>적용 기초일액</td><td class="num">' + won(r.baseDaily) + '</td></tr>';
    rows += '<tr><td>× 60%</td><td class="num">' + won(r.raw60) + '</td></tr>';
    rows += '<tr><td>하한액(기초일액의 80%)</td><td class="num">' + won(r.floorPay) + '</td></tr>';
    rows += '<tr><td>상한액(기초일액 상한의 60%)</td><td class="num">' + won(r.capPay) + '</td></tr>';
    rows += '<tr class="row-strong"><td>1일 구직급여일액</td><td class="num">' + won(r.daily) + '</td></tr>';
    rows += '<tr><td>소정급여일수 × ' + r.days + '일</td><td class="num">' + won(r.total) + '</td></tr>';
    setHTML('ui-rows', rows);

    var note;
    if (r.year === 2027) {
      note = '2027년 1월 1일 이후 이직자는 최저임금이 시간급 10,700원으로 올라 하한액이 1일 ' + won(r.floorPay) + '(8시간 기준)이 됩니다. 현행 상한액 68,100원보다 커서 상·하한이 뒤집히므로, 상한액을 하한액의 103%로 연동하는 시행령 개정안이 2026년 9월 22일 입법예고되어 있습니다(2026년 11월 17일 현재 공포 전). 위 계산은 ' + (r.plan2027 ? '개정안을 반영한 값' : '개정 전 현행 상한액을 그대로 둔 값') + '입니다.';
    } else {
      note = '구직급여일액은 기초일액(이직 전 3개월 평균임금)의 60%이고, 하한은 최저임금의 80%, 상한은 기초일액 113,500원의 60%인 68,100원입니다(고용보험법 §46, 시행령 §68). 대기기간 7일은 소정급여일수를 깎지 않고 그 앞에 따로 붙습니다.';
    }
    setText('ui-note', note);
  }

  /* ---------- 연말정산 ---------- */

  function renderYearend() {
    var gross = val('ye-gross', 0);
    if (!gross) gross = val('ye-monthly', 0) * 12;
    var insuranceManual = val('ye-insurance', -1);
    var ins = insuranceManual >= 0 ? insuranceManual : insuranceEstimate(gross / 12).annual;

    var r = calcYearend({
      gross: gross,
      dependents: val('ye-dependents', 0),
      children: val('ye-children', 0),
      childTax: val('ye-childtax', 0),
      birthOrder: radioValue('ye-birth', '0'),
      insurance: ins,
      rent: val('ye-rent', 0),
      homeless: checkValue('ye-homeless'),
      pension: val('ye-pension', 0),
      cardCredit: val('ye-card-credit', 0),
      cardCheck: val('ye-card-check', 0),
      cardMarket: val('ye-card-market', 0),
      cardTransit: val('ye-card-transit', 0),
      cardCulture: val('ye-card-culture', 0),
      withheld: $('ye-withheld') && $('ye-withheld').value !== '' ? val('ye-withheld', 0) : undefined,
      filed: checkValue('ye-filed')
    });
    lastResults.yearend = r;

    var sign = r.refund >= 0 ? '+' : '−';
    setText('ye-refund', sign + won(Math.abs(r.refund)));
    setText('ye-refund-ko', (r.refund >= 0 ? '돌려받을 세금' : '더 낼 세금') + ' 추정 · 지방소득세 별도');
    setText('ye-decided', won(r.decided));
    setText('ye-local', won(r.localTax));
    setText('ye-total-tax', won(r.totalTax));
    setText('ye-withheld', won(r.withheld));
    setText('ye-taxbase', won(r.taxBase));
    setText('ye-calculated', won(r.calculated));
    setText('ye-credits', won(r.credits));
    setText('ye-marginal', Math.round(r.marginalRate * 100) + '%');
    setBadge('ye-badge', '2026년 귀속 · 2027년 2월 정산', 'badge-ok');
    setBadge('ye-withheld-badge', r.withheldGiven ? '직접 입력' : '간이세액표 추정', r.withheldGiven ? 'badge-neutral' : 'badge-ok');

    var rows = '';
    rows += '<tr><td>총급여</td><td class="num">' + won(r.gross) + '</td></tr>';
    rows += '<tr><td>근로소득공제</td><td class="num">−' + won(r.earnedDed) + '</td></tr>';
    rows += '<tr class="row-strong"><td>근로소득금액</td><td class="num">' + won(r.earnedIncome) + '</td></tr>';
    rows += '<tr><td>인적공제(본인 포함)</td><td class="num">−' + won(r.personalDed) + '</td></tr>';
    rows += '<tr><td>4대보험료 공제</td><td class="num">−' + won(r.insurance) + '</td></tr>';
    rows += '<tr><td>신용카드 등 소득공제</td><td class="num">−' + won(r.cardDeduction) + '</td></tr>';
    rows += '<tr class="row-strong"><td>과세표준</td><td class="num">' + won(r.taxBase) + '</td></tr>';
    rows += '<tr><td>산출세액</td><td class="num">' + won(r.calculated) + '</td></tr>';
    rows += '<tr><td>근로소득세액공제</td><td class="num">−' + won(r.creditEarned) + '</td></tr>';
    rows += '<tr><td>자녀세액공제</td><td class="num">−' + won(r.childCredit) + '</td></tr>';
    rows += '<tr><td>출산·입양 세액공제</td><td class="num">−' + won(r.birthCredit) + '</td></tr>';
    rows += '<tr><td>연금계좌 세액공제</td><td class="num">−' + won(r.pensionCredit) + '</td></tr>';
    rows += '<tr><td>월세 세액공제</td><td class="num">−' + won(r.rentCredit) + '</td></tr>';
    rows += '<tr><td>표준세액공제</td><td class="num">−' + won(r.standardCredit) + '</td></tr>';
    rows += '<tr class="row-strong"><td>결정세액</td><td class="num">' + won(r.decided) + '</td></tr>';
    rows += '<tr><td>지방소득세(10%)</td><td class="num">' + won(r.localTax) + '</td></tr>';
    rows += '<tr><td>기납부세액(추정)</td><td class="num">' + won(r.withheld) + '</td></tr>';
    rows += '<tr class="row-strong"><td>' + (r.refund >= 0 ? '환급 예상' : '추징 예상') + '</td><td class="num">' + won(Math.abs(r.refund)) + '</td></tr>';
    setHTML('ye-rows', rows);

    var note = '카드 사용액은 총급여의 25%를 넘는 부분부터 공제되고(신용 15%·체크 30%·전통시장·대중교통 40%), 기본한도는 총급여 7,000만원 이하에서 자녀 1명 350만원·2명 이상 400만원입니다. 의료비·교육비·기부금·보험료 세액공제는 넣지 않았으므로 실제 환급액은 이보다 클 수 있습니다.';
    setText('ye-note', note);
  }

  /* ---------- 출산·육아 ---------- */

  function renderChildbirth() {
    var r = calcChildbirth({
      order: radioValue('cb-order', '1'),
      region: radioValue('cb-region', 'metro'),
      voucher: checkValue('cb-voucher'),
      care: radioValue('cb-care', 'home'),
      birthYear: val('cb-year', 2026),
      birthMonth: val('cb-month', 1),
      wageA: val('cb-wage-a', 3000000),
      wageB: val('cb-wage-b', 3000000),
      leaveType: radioValue('cb-leave-type', 'together'),
      monthsA: val('cb-months-a', 6),
      monthsB: val('cb-months-b', 6)
    });
    lastResults.childbirth = r;

    var reform = r.regime === 'reform';
    setText('cb-total', won(r.applied));
    setText('cb-total-ko', (reform ? '2027년 7월 이후 출생 · 아이맞이지원금+아동기본수당' : '2026년 기준 · 첫만남이용권+부모급여+아동수당'));
    setText('cb-first-meet', won(r.firstMeet));
    setText('cb-parent-total', won(r.parentTotal));
    setText('cb-parent-0', won(r.parentMonthly[0]));
    setText('cb-parent-1', won(r.parentMonthly[1]));
    setText('cb-child-monthly', won(r.childMonthly));
    setText('cb-child-months', r.childMonths + '개월');
    setText('cb-child-total', won(r.childTotal));
    setText('cb-grant', won(r.grant));
    setText('cb-basic-monthly', won(r.basicBase));
    setText('cb-basic-sub', r.care === 'home'
      ? '0~1세 가정양육이면 월 ' + won(r.basicMonthly)
      : '0~12세 156개월');
    setText('cb-basic-total', won(r.basicTotal));
    setText('cb-reform-total', won(r.cashReform));
    setText('cb-diff', (r.reformDiff >= 0 ? '+' : '−') + manWon(Math.abs(r.reformDiff)));
    setText('cb-leave-total', won(r.leaveTotal));
    setText('cb-grand', won(r.applied + r.leaveTotal));
    setBadge('cb-badge', reform ? '2027.7.1 이후 출생 기준(개편안)' : '2026년 현행 기준', reform ? 'badge-neutral' : 'badge-ok');

    var rows = '';
    rows += '<tr><td>아동 1인 0~12세 현행 지원 합계</td><td class="num">' + won(r.cashNow) + '</td></tr>';
    rows += '<tr><td>아동 1인 0~12세 개편안 합계</td><td class="num">' + won(r.cashReform) + '</td></tr>';
    rows += '<tr class="row-strong"><td>차이</td><td class="num">' + (r.reformDiff >= 0 ? '+' : '−') + won(Math.abs(r.reformDiff)) + '</td></tr>';
    setHTML('cb-rows', rows);

    var leaveRows = '';
    if (r.leaveType !== 'none') {
      var mA = r.leaveType === 'none' ? 0 : clamp(val('cb-months-a', 6), 0, 18);
      var mB = r.leaveType === 'none' ? 0 : clamp(val('cb-months-b', 6), 0, 18);
      var n = Math.max(mA, mB);
      for (var i = 1; i <= n; i++) {
        var a = i <= mA ? won(leavePayMonth(val('cb-wage-a', 3000000), i, (r.leaveType === 'together' && i <= r.commonMonths) ? 'together' : 'general')) : '—';
        var b = i <= mB ? won(leavePayMonth(val('cb-wage-b', 3000000), i, (r.leaveType === 'together' && i <= r.commonMonths) ? 'together' : 'general')) : '—';
        leaveRows += '<tr><td>' + i + '개월</td><td class="num">' + a + '</td><td class="num">' + b + '</td></tr>';
      }
    }
    setHTML('cb-leave-rows', leaveRows);

    var note;
    if (reform) {
      note = '2027년 7월 1일 이후 출생아부터는 첫만남이용권·부모급여·아동수당이 아이맞이지원금(첫째 1,000만원, 둘째 1,200만원, 셋째 이상 1,500만원, 지방우대지역 +500만원)과 아동기본수당(월 20만원, 우대지역 30만원, 0~1세 가정양육 +30만원)으로 바뀝니다. 이 금액은 2026년 9월 국회에 제출된 2027년 예산안과 아동수당법 개정안을 기준으로 한 것으로, 국회 심의 과정에서 달라질 수 있습니다.';
    } else if (r.birthYear === 2027) {
      note = '2027년 1~6월 출생아는 현행 제도(첫만남이용권·부모급여·아동수당)가 적용됩니다. 2027년 1월생부터 새 제도를 소급 적용하는 방안이 국회에서 논의되고 있지만 2026년 11월 17일 현재 확정되지 않았습니다. 확정되면 이 계산기의 결과와 기준일을 함께 고칩니다.';
    } else {
      note = '2026년 출생아는 첫만남이용권(첫째 200만원·둘째 이상 300만원), 부모급여(0세 월 100만원·1세 월 50만원), 아동수당(만 9세 미만 월 10만원, 지역 가산)을 받습니다. 아동수당 지급 연령은 2030년까지 매년 1세씩 올라가므로, 아이가 자라는 동안의 상한 연령 변화를 반영해 누적액을 계산했습니다.';
    }
    setText('cb-note', note);
  }

  function renderAll() {
    try { renderSeverance(); } catch (e) { console.error(e); }
    try { renderUnemployment(); } catch (e) { console.error(e); }
    try { renderYearend(); } catch (e) { console.error(e); }
    try { renderChildbirth(); } catch (e) { console.error(e); }
  }

  /* ---------- 탭 ---------- */

  function selectTab(name) {
    var tabs = document.querySelectorAll('[data-tab]');
    var panels = document.querySelectorAll('[data-panel]');
    var found = false;
    Array.prototype.forEach.call(panels, function (p) {
      if (p.getAttribute('data-panel') === name) { p.hidden = false; found = true; }
      else p.hidden = true;
    });
    if (!found) return;
    Array.prototype.forEach.call(tabs, function (t) {
      if (t.getAttribute('role') !== 'tab') return;
      var on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    try { history.replaceState(null, '', '#' + name); } catch (e) { }
  }

  function initTabs() {
    var tablist = document.querySelector('[role="tablist"]');
    if (!tablist) return;
    tablist.addEventListener('click', function (e) {
      var btn = e.target.closest('[role="tab"]');
      if (!btn) return;
      selectTab(btn.getAttribute('data-tab'));
    });
    tablist.addEventListener('keydown', function (e) {
      var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        selectTab(next.getAttribute('data-tab'));
      }
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-tab]');
      if (!a) return;
      selectTab(a.getAttribute('data-tab'));
    });
    var hash = (location.hash || '').replace('#', '');
    if (hash && document.querySelector('[data-panel="' + hash + '"]')) selectTab(hash);
  }

  function initInputs() {
    document.addEventListener('input', function (e) {
      if (e.target.closest('form')) renderAll();
    });
    document.addEventListener('change', function (e) {
      if (e.target.closest('form')) renderAll();
    });
    document.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip[data-set]');
      if (!chip) return;
      e.preventDefault();
      var map;
      try { map = JSON.parse(chip.getAttribute('data-set')); } catch (err) { return; }
      Object.keys(map).forEach(function (id) {
        var el = $(id);
        if (el) el.value = map[id];
      });
      renderAll();
    });
  }

  function init() {
    initTabs();
    initInputs();
    /* 실업급여: 이직일 기본값 = 오늘 */
    var uiLast = $('ui-last');
    if (uiLast && !uiLast.value) uiLast.value = C.baseDate;
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  api.lastResults = lastResults;
  api.selectTab = selectTab;

})(typeof window !== 'undefined' ? window : this);
