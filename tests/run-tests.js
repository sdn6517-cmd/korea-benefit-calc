/*
 * 계산 엔진 검증 — 2026년 기준 법령·고시 값
 * 실행: python3 tests/run.py
 *
 * 기대값은 법령 조문·고시와 정부·언론의 계산 예제에서 직접 확인한 값입니다.
 * (about.html '계산 기준' 표에 근거를 적어 두었습니다.)
 */
(function () {
  'use strict';

  var results = [];
  var B = (typeof window !== 'undefined' ? window.BenefitCalc : globalThis.BenefitCalc);

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, error: e.message });
    }
  }

  function eq(actual, expected, label) {
    if (actual !== expected) {
      throw new Error((label || '') + ' 기대 ' + expected + ' / 실제 ' + actual);
    }
  }

  function near(actual, expected, tol, label) {
    if (Math.abs(actual - expected) > (tol === undefined ? 2 : tol)) {
      throw new Error((label || '') + ' 기대 ' + expected + '±' + (tol || 2) + ' / 실제 ' + actual);
    }
  }

  function ok(cond, label) {
    if (!cond) throw new Error(label || '조건 불충족');
  }

  /* ---------- 날짜·시간 ---------- */

  test('날짜: 개월 이동은 말일을 보정한다', function () {
    eq(B.fmtDate(B.addMonths({ y: 2026, m: 1, d: 31 }, 1)), '2026.02.28');
    eq(B.fmtDate(B.addMonths({ y: 2024, m: 1, d: 31 }, 1)), '2024.02.29');
    eq(B.fmtDate(B.addDays({ y: 2026, m: 12, d: 31 }, 1)), '2027.01.01');
  });

  test('월 소정근로시간: 주 40시간 → 209시간', function () {
    eq(B.monthlyHours(40), 209);
    eq(B.monthlyHours(35), 183);
  });

  test('1일 통상임금: 월 300만원 → 114,832원', function () {
    eq(B.dailyOrdinaryWage(3000000, 40), 114832);
  });

  /* ---------- 퇴직금 ---------- */

  test('퇴직금: 재직 1년, 휴직 없음 — 통상임금이 더 크면 통상임금 적용', function () {
    var r = B.calcSeverance({
      hire: '2025-01-01', last: '2025-12-31',
      base: 3000000, fixed: 0, variable: 0, bonus: 0, leavePay: 0,
      ordinary: 3000000, weeklyHours: 40, unusedDays: 0, periods: []
    });
    eq(r.serviceDays, 365, '재직일수');
    eq(r.window.days, 92, '산정기간 일수');
    eq(r.window.excluded, 0, '제외일수');
    eq(r.dayAvg, 97826, '1일 평균임금');
    eq(r.dailyOrdinary, 114832, '1일 통상임금');
    eq(r.applied, 114832, '적용 임금');
    eq(r.basis, '통상임금', '적용 기준');
    eq(r.severance, 3444960, '퇴직금');
    eq(r.eligible, true, '지급 대상');
  });

  test('퇴직금: 1년 미만은 법정 퇴직금 0원', function () {
    var r = B.calcSeverance({
      hire: '2026-01-01', last: '2026-06-30', base: 3000000, ordinary: 3000000,
      weeklyHours: 40, periods: []
    });
    eq(r.serviceDays, 181);
    eq(r.eligible, false);
    eq(r.severance, 0);
  });

  test('퇴직금: 상여금은 3/12, 연차수당도 3/12로 더한다', function () {
    var r = B.calcSeverance({
      hire: '2025-01-01', last: '2025-12-31',
      base: 3000000, fixed: 0, variable: 0, bonus: 4800000, leavePay: 1200000,
      ordinary: 3000000, weeklyHours: 40, periods: []
    });
    eq(r.bonusPart, 1200000, '상여 3/12');
    eq(r.leavePart, 300000, '연차수당 3/12');
    eq(r.avgSum, 9000000 + 1200000 + 300000, '임금총액');
    eq(r.dayAvg, Math.floor(10500000 / 92), '1일 평균임금');
  });

  test('퇴직금: 육아휴직이 전 3개월을 덮으면 휴직 전 3개월로 산정한다', function () {
    var r = B.calcSeverance({
      hire: '2020-01-01', last: '2026-12-31',
      base: 3000000, fixed: 0, ordinary: 3000000, weeklyHours: 40,
      periods: [{ type: 'parental', start: '2026-06-01', end: '2026-12-31' }]
    });
    eq(r.serviceDays, 2557, '재직일수(휴직 포함)');
    eq(r.window.end, '2026.05.31', '산정기간 종료일');
    eq(r.window.days, 92, '산정기간 일수');
    eq(r.window.excluded, 0, '산정기간 내 제외일');
    eq(r.leaveDays, 214, '휴직일수 합계');
    eq(r.dayAvg, 97826, '1일 평균임금');
  });

  test('퇴직금: 휴직이 산정기간 일부를 덮으면 그 일수만큼 과거로 늘린다', function () {
    var r = B.calcSeverance({
      hire: '2020-01-01', last: '2026-12-31',
      base: 3000000, fixed: 0, ordinary: 3000000, weeklyHours: 40,
      periods: [{ type: 'parental', start: '2026-09-01', end: '2026-10-31' }]
    });
    eq(r.window.start, '2026.08.01', '산정기간 시작일');
    eq(r.window.days, 153, '산정기간 일수(확장)');
    eq(r.window.excluded, 61, '제외일수');
    eq(r.window.included, 92, '산정일수');
    eq(r.leaveDaysInWindow, 61, '산정기간 내 휴직일');
    eq(r.dayAvg, 97826, '1일 평균임금');
  });

  test('퇴직금: 휴직 기간은 재직일수에 들어간다(연차수당은 통상임금 기준)', function () {
    var r = B.calcSeverance({
      hire: '2024-01-01', last: '2026-12-31',
      base: 3000000, fixed: 0, ordinary: 3000000, weeklyHours: 40, unusedDays: 5,
      periods: [{ type: 'parental', start: '2025-01-01', end: '2025-12-31' }]
    });
    eq(r.serviceDays, 1096, '재직일수');
    eq(r.leaveAllowance, 574160, '연차수당 5일');
    eq(r.window.excluded, 0, '산정기간 제외일');
  });

  /* ---------- 실업급여 ---------- */

  test('실업급여: 하한액이 적용되는 경우(2026)', function () {
    var r = B.calcUnemployment({
      last: '2026-11-17', birth: '1990-05-20', insYears: 5, insMonths: 3,
      wage3m: 9000000, hours: 8
    });
    eq(r.days3m, 92, '3개월 일수');
    eq(r.baseDailyRaw, 97826, '평균임금 일액');
    eq(r.floorBase, 82560, '최저기초일액');
    eq(r.raw60, 58695, '60%');
    eq(r.floorPay, 66048, '하한액');
    eq(r.capPay, 68100, '상한액');
    eq(r.daily, 66048, '구직급여일액');
    eq(r.applied, '하한액', '적용 구분');
    eq(r.days, 210, '소정급여일수');
    eq(r.total, 13870080, '총액');
  });

  test('실업급여: 상한액이 적용되는 경우(2026)', function () {
    var r = B.calcUnemployment({
      last: '2026-11-17', birth: '1990-05-20', insYears: 5, insMonths: 3,
      wage3m: 30000000, hours: 8
    });
    eq(r.baseDaily, 113500, '상한 적용 기초일액');
    eq(r.raw60, 68100, '60%');
    eq(r.daily, 68100, '구직급여일액');
    eq(r.applied, '상한액', '적용 구분');
  });

  test('실업급여: 60%가 그대로 적용되는 구간', function () {
    var r = B.calcUnemployment({
      last: '2026-11-17', birth: '1990-05-20', insYears: 5, insMonths: 3,
      wage3m: 10280000, hours: 8
    });
    ok(r.daily > 66048 && r.daily < 68100, '상·하한 사이');
    eq(r.applied, '기초일액의 60%', '적용 구분');
  });

  test('실업급여: 2027년 이직은 하한액이 상한액을 넘는다', function () {
    var r = B.calcUnemployment({ last: '2027-01-15', birth: '1990-05-20', insYears: 5, wage3m: 3000000, hours: 8 });
    eq(r.floorPay, 68480, '2027 하한액');
    eq(r.daily, 68480, '구직급여일액');
    eq(r.applied, '하한액(상한 역전)', '적용 구분');
  });

  test('실업급여: 2027 개정안(하한 103% 연동)을 반영하면 상한이 올라간다', function () {
    var r = B.calcUnemployment({
      last: '2027-01-15', birth: '1990-05-20', insYears: 5, wage3m: 40000000, hours: 8, plan2027: true
    });
    eq(r.baseCap, 117614, '2027 기초일액 상한');
    eq(r.daily, 70568, '2027 구직급여일액');
    eq(r.applied, '상한액', '적용 구분');
  });

  test('실업급여: 소정급여일수 표(고용보험법 별표1)', function () {
    eq(B.benefitDays(36, 11, false), 120);
    eq(B.benefitDays(36, 12, false), 150);
    eq(B.benefitDays(36, 40, false), 180);
    eq(B.benefitDays(36, 70, false), 210);
    eq(B.benefitDays(36, 130, false), 240);
    eq(B.benefitDays(50, 40, false), 210);
    eq(B.benefitDays(50, 130, false), 270);
    eq(B.benefitDays(30, 40, true), 210);
  });

  test('실업급여: 1일 4시간 근로자는 하한액도 절반', function () {
    var r = B.calcUnemployment({ last: '2026-11-17', birth: '1990-05-20', insYears: 2, wage3m: 3000000, hours: 4 });
    eq(r.floorPay, 33024, '4시간 하한액');
    eq(r.daily, 33024, '구직급여일액');
  });

  test('만 나이 계산', function () {
    eq(B.fullAge({ y: 1990, m: 5, d: 20 }, { y: 2026, m: 11, d: 17 }), 36);
    eq(B.fullAge({ y: 1990, m: 12, d: 1 }, { y: 2026, m: 11, d: 17 }), 35);
  });

  /* ---------- 연말정산 ---------- */

  test('근로소득공제 구간(소득세법 §47)', function () {
    eq(B.earnedIncomeDeduction(5000000), 3500000);
    eq(B.earnedIncomeDeduction(30000000), 9750000);
    eq(B.earnedIncomeDeduction(50000000), 12250000);
    eq(B.earnedIncomeDeduction(100000000), 14750000);
    eq(B.earnedIncomeDeduction(120000000), 15150000);
    eq(B.earnedIncomeDeduction(400000000), 20000000);
  });

  test('산출세액 구간(소득세법 §55) — 국세청 예시', function () {
    eq(B.incomeTax(20000000), 1740000);
    eq(B.incomeTax(50000000), 6240000);
    eq(B.incomeTax(14000000), 840000);
    eq(B.incomeTax(0), 0);
  });

  test('근로소득세액공제 한도(§59②)', function () {
    eq(B.earnedTaxCreditLimit(30000000), 740000);
    eq(B.earnedTaxCreditLimit(50000000), 660000);
    eq(B.earnedTaxCreditLimit(80000000), 500000);
    eq(B.earnedTaxCreditLimit(130000000), 200000);
  });

  test('신용카드 소득공제 — 2026년 자녀 가산 예제', function () {
    var r = B.cardDeduction({
      gross: 60000000, children: 2,
      credit: 35000000, check: 5000000, market: 2000000, transit: 1000000, culture: 0
    });
    eq(r.baseLimit, 4000000, '기본한도');
    eq(r.raw, 5700000, '공제율 적용액');
    eq(r.extra, 1200000, '추가공제');
    eq(r.deduction, 5200000, '소득공제액');
  });

  test('신용카드 소득공제 — 총급여 25% 미만이면 0원', function () {
    var r = B.cardDeduction({ gross: 50000000, children: 0, credit: 10000000, check: 0 });
    eq(r.deduction, 0);
  });

  test('4대보험 근로자 부담(2026) — 월 200만원 81,340원과 일치', function () {
    var r = B.insuranceEstimate(2000000);
    eq(r.pension, 95000, '국민연금 4.75%');
    eq(r.health, 71900, '건강보험 3.595%');
    near(r.health + r.longterm, 81340, 10, '건강보험+장기요양(공단 예시 81,340원)');
    eq(r.employ, 18000, '고용보험 0.9%');
  });

  test('연말정산: 총급여 5,000만·배우자+자녀 1명 — 자녀세액공제만큼 환급', function () {
    var r = B.calcYearend({
      gross: 50000000, dependents: 1, children: 1, childTax: 1,
      insurance: B.insuranceEstimate(50000000 / 12).annual,
      rent: 0, pension: 0, homeless: false
    });
    eq(r.earnedDed, 12250000, '근로소득공제');
    eq(r.earnedIncome, 37750000, '근로소득금액');
    eq(r.personalDed, 4500000, '인적공제');
    eq(r.taxBase, r.earnedIncome - r.personalDed - r.insurance, '과세표준 구조');
    near(r.taxBase, 28391350, 60, '과세표준');
    near(r.calculated, 2998703, 10, '산출세액');
    eq(r.creditEarned, 660000, '근로소득세액공제');
    eq(r.childCredit, 250000, '자녀세액공제');
    eq(r.standardCredit, 0, '표준세액공제(보험료 공제 시 없음)');
    eq(r.decided, r.calculated - r.credits, '결정세액 구조');
    near(r.decided, 2088703, 10, '결정세액');
    near(r.localTax, 208870, 10, '지방소득세');
    eq(r.refund, 250000, '환급액');
  });

  test('연말정산: 연금계좌 300만원 → 45만원(15%) 추가 환급', function () {
    var base = { gross: 50000000, dependents: 1, children: 1, childTax: 1, homeless: false };
    var a = B.calcYearend(base);
    var b = B.calcYearend({ gross: 50000000, dependents: 1, children: 1, childTax: 1, homeless: false, pension: 3000000 });
    eq(b.pensionCredit, 450000, '연금계좌 세액공제');
    near(b.refund - a.refund, 450000, 2, '환급 증가분');
  });

  test('연말정산: 총급여 5,500만 초과는 연금 12%·월세 15%', function () {
    var r = B.calcYearend({
      gross: 60000000, dependents: 0, children: 0, homeless: true, rent: 6000000, pension: 3000000
    });
    eq(r.pensionCredit, 360000, '연금 12%');
    eq(r.rentCredit, 900000, '월세 15%');
  });

  test('연말정산: 무주택이 아니거나 총급여 8,000만 초과면 월세 공제 없음', function () {
    eq(B.calcYearend({ gross: 60000000, homeless: false, rent: 6000000 }).rentCredit, 0);
    eq(B.calcYearend({ gross: 90000000, homeless: true, rent: 6000000 }).rentCredit, 0);
  });

  test('연말정산: 자녀 3명 세액공제는 55만 + 40만', function () {
    var r = B.calcYearend({ gross: 60000000, children: 3, childTax: 3 });
    eq(r.childCredit, 950000);
  });

  test('연말정산: 2026년 출생 첫째는 출산세액공제 30만원', function () {
    var r = B.calcYearend({ gross: 60000000, children: 1, childTax: 0, birthOrder: 1 });
    eq(r.birthCredit, 300000);
  });

  test('연말정산: 기납부세액을 직접 넣으면 그 값으로 환급액을 계산한다', function () {
    var r = B.calcYearend({
      gross: 50000000, dependents: 1, children: 1, childTax: 1,
      withheld: 3000000
    });
    eq(r.withheld, 3000000);
    eq(r.withheldGiven, true);
    near(r.refund, 3000000 - r.decided, 2);
  });

  /* ---------- 출산·육아 ---------- */

  test('출산·육아: 2026년 출생 첫째·수도권·가정양육 — 12년 누적 3,560만원', function () {
    var r = B.calcChildbirth({ order: 1, region: 'metro', care: 'home', birthYear: 2026, birthMonth: 1 });
    eq(r.firstMeet, 2000000, '첫만남이용권');
    eq(r.parentTotal, 18000000, '부모급여 24개월');
    eq(r.childMonthly, 100000, '아동수당 월액');
    eq(r.childMonths, 156, '아동수당 개월');
    eq(r.childTotal, 15600000, '아동수당 누적');
    eq(r.cashNow, 35600000, '현행 합계');
    eq(r.regime, 'now', '적용 제도');
    eq(r.applied, 35600000, '화면 적용값');
  });

  test('출산·육아: 2027년 6월 출생은 여전히 현행 제도', function () {
    var r = B.calcChildbirth({ order: 1, region: 'metro', care: 'home', birthYear: 2027, birthMonth: 6 });
    eq(r.regime, 'now');
    eq(r.cashNow, 35600000);
  });

  test('출산·육아: 개편안 첫째·수도권·가정양육 4,840만원', function () {
    var r = B.calcChildbirth({ order: 1, region: 'metro', care: 'home', birthYear: 2027, birthMonth: 7 });
    eq(r.regime, 'reform');
    eq(r.grant, 10000000, '아이맞이지원금');
    eq(r.basicBase, 200000, '아동기본수당 기본');
    eq(r.basicTotal, 38400000, '아동기본수당 누적(0~1세 가산 포함)');
    eq(r.cashReform, 48400000, '개편안 합계');
    eq(r.applied, 48400000);
    eq(r.reformDiff, 12800000, '현행 대비 차이');
  });

  test('출산·육아: 개편안 우대지역 셋째·가정양육 7,400만원', function () {
    var r = B.calcChildbirth({ order: 3, region: 'depop', care: 'home', birthYear: 2027, birthMonth: 8 });
    eq(r.grant, 20000000, '아이맞이지원금+우대');
    eq(r.basicTotal, 54000000, '아동기본수당 누적');
    eq(r.cashReform, 74000000);
  });

  test('출산·육아: 비수도권 아동수당 월 10만 5,000원', function () {
    var r = B.calcChildbirth({ order: 1, region: 'nonmetro', care: 'home', birthYear: 2026, birthMonth: 3 });
    eq(r.childMonthly, 105000);
    eq(r.childTotal, 105000 * 156);
  });

  test('출산·육아: 인구감소지역 상품권 수령은 월 12만원', function () {
    var r = B.calcChildbirth({ order: 1, region: 'depop', voucher: true, birthYear: 2026, birthMonth: 3 });
    eq(r.childMonthly, 120000);
  });

  test('출산·육아: 어린이집 이용 시 부모급여 현금 차액', function () {
    eq(B.parentBenefitMonthly(0, 'daycare'), 416000);
    eq(B.parentBenefitMonthly(1, 'daycare'), 0);
    eq(B.parentBenefitMonthly(0, 'home'), 1000000);
  });

  test('육아휴직급여: 일반 상한(1~3개월 250만·4~6개월 200만·7개월~ 160만)', function () {
    eq(B.leavePayMonth(4000000, 1, 'general'), 2500000);
    eq(B.leavePayMonth(4000000, 3, 'general'), 2500000);
    eq(B.leavePayMonth(4000000, 4, 'general'), 2000000);
    eq(B.leavePayMonth(4000000, 7, 'general'), 1600000);
    eq(B.leavePayMonth(3000000, 2, 'general'), 2500000);
    eq(B.leavePayMonth(1500000, 1, 'general'), 1500000);
    eq(B.leavePayMonth(500000, 1, 'general'), 700000);
  });

  test('육아휴직급여: 6+6 부모함께 상한(250·250·300·350·400·450만)', function () {
    eq(B.leavePayMonth(4000000, 1, 'together'), 2500000);
    eq(B.leavePayMonth(4000000, 2, 'together'), 2500000);
    eq(B.leavePayMonth(4000000, 3, 'together'), 3000000);
    eq(B.leavePayMonth(4000000, 4, 'together'), 3500000);
    eq(B.leavePayMonth(4000000, 5, 'together'), 4000000);
    eq(B.leavePayMonth(4000000, 6, 'together'), 4000000);
    eq(B.leavePayMonth(5000000, 6, 'together'), 4500000);
  });

  test('육아휴직급여: 6+6 6개월 + 일반 6개월 = 2,910만원', function () {
    eq(B.leavePayMixed(4000000, 12, 6), 29100000);
  });

  /* ---------- 결과 ---------- */

  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.filter(function (r) { return !r.ok; });

  if (typeof window === 'undefined') {
    results.forEach(function (r) {
      if (!r.ok) console.log('✗ ' + r.name + ' — ' + r.error);
    });
  }

  var summary = {
    total: results.length,
    passed: passed,
    failed: failed.length,
    failures: failed
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = summary;
  if (typeof globalThis !== 'undefined') globalThis.__testSummary = JSON.stringify(summary);
})();
