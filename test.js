// 計算の検算。 node test.js で実行（外部ライブラリなし）
// app.html の /*CALC-START*/ 〜 /*CALC-END*/ を取り出して、引き継ぎ資料の数字と手計算を正解として突き合わせる
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.html', 'utf8');
const block = src.slice(src.indexOf('/*CALC-START*/'), src.indexOf('/*CALC-END*/'));
const { defaults, calcPlan, need, incomeTax, ymAdd, migrate, needClients, monthlyAt, kokuhoAnnual, salaryIncome, staffCost, varUnit, loanSplit, staffLabor, keepRate } =
  new Function(block + '\nreturn {defaults,calcPlan,need,incomeTax,ymAdd,migrate,needClients,monthlyAt,kokuhoAnnual,salaryIncome,staffCost,varUnit,loanSplit,staffLabor,keepRate};')();

let pass = 0, fail = 0;
function eq(name, got, want, tol = 0.5) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log(`NG  ${name}: got ${got}, want ${want}`); }
}
const NOW = '2026-11';
// 引き継ぎ資料と同じ前提（解約なし・担当上限なし・税金なし）
function base(mut) {
  const S = defaults();
  Object.assign(S.sim, { churn: 0, ownerCap: 0, ctaxOn: false, itaxOn: false, kokuhoAuto: false, prevSalary: 0 });
  S.fixed = S.fixed.filter(x => !String(x.id).startsWith('p_'));
  S.fixed.push({ id: 't_anbun', g: 'その他雑費', label: '自宅按分', amt: 15000, note: '', pre: false });
  S.vars = []; S.sim.acqCost = 0;
  S.staff.forEach(x => { x.welfare = 0; x.monthly = staffCost(x); });
  if (mut) mut(S);
  return S;
}
const vet = S => S.staff.find(x => /ベテラン/.test(x.label));

// --- 見積 ---
let C = calcPlan(base(), NOW);
eq('開業費用', C.openCost, 1233900);                 // 資料 1,213,900 ＋ 登録手数料の改定差 20,000
eq('月の固定費', C.fixedBase, 140217);
eq('前払いを除く1年目の固定費', C.fixed1, 85290);     // 140,217 − 54,927
eq('前払い分の年額', (C.fixedBase - C.fixed1) * 12, 659120, 6);  // 454,080＋95,000＋60,000＋50,040（月割の端数差）

// --- 損益分岐（引き継ぎ資料の件数） ---
[[20000, 8, 23], [30000, 5, 15], [40000, 4, 12], [50000, 3, 9]].forEach(([p, a, b]) => {
  eq(`1人 固定費のみ ${p}`, need(C.fixedBase, p), a);
  eq(`1人 生活費込み ${p}`, need(C.fixedBase + 300000, p), b);
});
[[20000, 28, 43], [30000, 19, 29], [40000, 14, 22], [50000, 12, 18]].forEach(([p, a, b]) => {
  eq(`2人 固定費のみ ${p}`, need(C.fixedBase + 412000, p), a);
  eq(`2人 生活費込み ${p}`, need(C.fixedBase + 412000 + 300000, p), b);
});

// --- 開業前の積立 ---
eq('開業月', C.open, '2031-04');
eq('開業までの月数', C.preN, 53);
eq('積立合計', C.accM, 52 * 50000);                   // 開業の前月（2031年3月）まで。開業月は給与がない
eq('積立する月数', C.saveN, 52);
eq('賞与積立', C.accB, 900000);                      // 6月・12月が計9回 × 10万円
eq('節目の支出', C.accC, 1600000);
eq('開業時の見込み資金', C.projected, 2900000);       // 100万 ＋ 260万 ＋ 90万 − 160万
eq('必要な手元資金 1人', C.required, 1233900 + 6 * 385290);
eq('過不足 1人', C.gap, 2900000 - 3545640);
let C2 = calcPlan(base(), NOW, { staff: [{ start: 1, monthly: 412000, init: 211600, cap: 30 }] });
eq('必要な手元資金 2人', C2.required, 1233900 + 211600 + 6 * 797290);

// --- 顧問先数と収入 ---
eq('1か月目の件数', C.rows[0].clients, 5);
eq('36か月目の件数', C.rows[35].clients, 40);
eq('1か月目の収入', C.rows[0].rev, 150000);
eq('1か月目の支出', C.rows[0].out, 385290);
eq('12か月目の支出', C.rows[11].out, 385290);
eq('13か月目の支出（年払いの固定費をまとめて払う）', C.rows[12].out, 385290 + 54927 * 12);
eq('14か月目の支出', C.rows[13].out, 385290);
eq('2年目の固定費の合計は月額×12', C.rows.slice(12, 24).reduce((t, r) => t + r.fx, 0), 140217 * 12);
eq('開業直後の残高', C.b0, 2900000 - 1233900);
eq('残高の積み上げ', C.rows[35].bal, C.b0 + C.rows.reduce((t, r) => t + r.net, 0), 1);

// --- 決算料 ---
C = calcPlan(base(S => { S.sim.kessan = 150000; }), NOW);
eq('一括：1か月目は決算料なし', C.rows[0].ks, 0);
eq('一括：12か月目に開業時5件分', C.rows[11].ks, 750000);
eq('一括：13か月目に2か月目契約の1件分', C.rows[12].ks, 150000);
eq('一括：24か月目', C.rows[23].ks, 900000);          // 開業時5件＋12か月目契約の1件
eq('実効単価', C.price, 42500);
C = calcPlan(base(S => { S.sim.kessan = 150000; S.sim.kessanMode = 'avg'; }), NOW);
eq('月割：1か月目', C.rows[0].rev, 212500);

// --- 解約と担当上限 ---
C = calcPlan(base(S => { S.sim.ownerCap = 10; }), NOW);
eq('上限10件：到達月', C.capM, 7);
eq('上限10件：36か月目', C.rows[35].clients, 10);
C = calcPlan(base(S => { S.sim.ownerCap = 10; vet(S).on = true; vet(S).start = 13; }), NOW);
eq('採用で上限が増える：13か月目', C.rows[12].clients, 11);
eq('採用で上限が増える：36か月目', C.rows[35].clients, 34);
C = calcPlan(base(S => { S.sim.churn = 12; S.sim.growth = 0; S.sim.clients = 100; }), NOW);
eq('年12%解約：12か月後', C.rows[12].clients, 88, 0.01);
C = calcPlan(base(S => { S.sim.churn = 12; }), NOW);
const keep = Math.pow(0.88, 1 / 12);
eq('解約＋増加：2か月目', C.rows[1].clients, 5 * keep + 1, 1e-9);

// --- 人員 ---
C = calcPlan(base(S => { vet(S).on = true; vet(S).start = 1; }), NOW);
eq('2人版 1か月目の支出', C.rows[0].out, 385290 + 412000 + 180000);
eq('2人版 2か月目の支出', C.rows[1].out, 385290 + 412000);
eq('2人版 36か月目の分配率', C.rows[35].ratio, (412000 - 9500) / 1200000, 1e-9);   // 人件費（ツール代を除く）÷ 限界利益

// --- 借入 ---
C = calcPlan(base(S => { S.sim.loan = 3000000; S.sim.loanYears = 7; S.sim.loanRate = 2.5; }), NOW);
const r = 2.5 / 1200;
eq('元利均等の現在価値', C.loanPay * (1 - Math.pow(1 + r, -84)) / r, 3000000, 1);
eq('借入後の開業直後残高', C.b0, 2900000 + 3000000 - 1233900);

// --- 税金 ---
eq('所得税 195万円', incomeTax(1950000), (1950000 * 0.10 - 97500) * 1.021);
eq('所得税 395.6万円', incomeTax(3956000), 371338, 1);
eq('所得税 マイナス', incomeTax(-100), 0);
C = calcPlan(base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; }), NOW);
const y31 = C.years[0], y32 = C.years[1];
eq('2031年 売上', y31.rev, 2430000);
eq('2031年 消費税', y31.ctax, 109350);
eq('2031年 事業の利益', y31.profit, 2430000 - 85290 * 9 - 109350 - 1233900);
eq('2031年 所得税等', y31.tax, 0);
eq('2032年 売上', y32.rev, 7020000);
eq('2032年 事業の利益', y32.profit, 7020000 - 140217 * 12 - 315900);   // 年払いの固定費は13か月目（2032年4月）に1年分を払う
// 税引前所得 5,021,496 → 課税所得 5,021,496 − 650,000 − 580,000 ＝ 3,791,496
eq('2032年 所得税等', y32.tax, (3791000 * 0.20 - 427500) * 1.021 + (3791496 + 150000) * 0.10 + (5021496 - 2900000) * 0.05, 1);
eq('税金の合計', C.ctaxT + C.itaxT, C.rows.reduce((t, x) => t + x.tax, 0), 1);

// --- 遅れた場合 ---
const S0 = base();
const D = calcPlan(S0, NOW, { slip: { from: S0.ms[0].ym, months: 12 } });
eq('1年遅れの開業月', D.open, '2032-04');
eq('1年遅れの見込み資金', D.projected, 2900000 + 12 * 50000 + 200000);
const D2 = calcPlan(S0, NOW, { slip: { from: '2030-11', months: 12 } });
eq('登録申請から遅れる：開業月', D2.open, '2032-04');
eq('登録申請から遅れる：学費は変わらない', D2.accC, 1600000);
const D3 = calcPlan(S0, NOW, { slip: { from: NOW, months: 24, cost: 600000 } });
eq('2年遅れ・追加支出あり：開業月', D3.open, '2033-04');
eq('2年遅れ・追加支出あり：見込み資金', D3.projected, 2900000 + 24 * 50000 + 400000 - 600000);

// --- 黒字が続くのに必要な顧問先数 ---
let Sn = base();                                       // 税金なし：資料の損益分岐と同じになる
eq('必要件数 事業のみ', needClients(Sn, {}), 5);
eq('必要件数 生活費込み', needClients(Sn, { living: true }), 15);
eq('必要件数 2人 生活費込み', needClients(Sn, { staff: 412000, living: true }), 29);
Sn = base(S => { S.sim.ctaxOn = true; });              // 消費税4.5%：140,217 ÷ (30,000×0.955) = 4.89 → 5件
eq('必要件数 消費税あり 事業のみ', needClients(Sn, {}), 5);
eq('必要件数 消費税あり 生活費込み', needClients(Sn, { living: true }), 16);   // 440,217 ÷ 28,650 = 15.37
Sn = base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; });
const nT = needClients(Sn, { living: true });
// 手計算の確認：n件のとき 月の手残り ＝ 28,650n − 440,217 − 税額/12 が初めて0以上になる
// 個人事業税は払う年の経費になるので、経費に入れた後の所得 base ＝ inc − 事業税 で所得税・住民税・事業税を計算する
const left = n => { const rev = n * 360000, ct = rev * 0.045, inc = rev - ct - 140217 * 12, bt = Math.max(0, (inc - 2900000) * 0.05 / 1.05), bs = inc - bt, tx = bs - 1230000;
  const tax = incomeTax(tx) + Math.max(0, tx + 150000) * 0.10 + Math.max(0, bs - 2900000) * 0.05; return n * 28650 - 440217 - tax / 12; };
eq('必要件数 税金込み：その件数で黒字', left(nT) >= 0, true);
eq('必要件数 税金込み：1件少ないと赤字', left(nT - 1) < 0, true);
Sn = base(S => { S.sim.kessan = 180000; });            // 決算料あり・一括：毎月で見ると顧問料だけ、年間で見ると実効4.5万円
eq('必要件数 決算料あり 顧問料だけで見る', needClients(Sn, { living: true, feeOnly: true }), 15);
eq('必要件数 決算料あり 決算料込み', needClients(Sn, { living: true }), 10);   // 440,217 ÷ 45,000 = 9.78
C = calcPlan(base(), NOW);
eq('黒字が続き始める月（税金なし）', C.stableM, 11);    // 年払いの固定費も月割にして判定する。15件×3万＝45万 ≥ 固定費14万＋生活費30万
eq('1〜8か月目は赤字', C.rows.slice(0, 8).every(r => r.red), true);

// --- 件数を決めたときの月の収支 ---
let Mx = monthlyAt(base(), 15, {});                    // 税金なし
eq('15件 顧問料', Mx.fee, 450000);
eq('15件 事業の利益', Mx.biz, 450000 - 140217);
eq('15件 月の手残り', Mx.left, 450000 - 140217 - 300000);
eq('15件 年間の手残り', Mx.annual, (450000 - 140217 - 300000) * 12);
Mx = monthlyAt(base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; }), 18, {});
eq('18件 消費税', Mx.ctax, 540000 * 0.045);
eq('18件 事業の利益', Mx.biz, 540000 * 0.955 - 140217);
// 事業の利益（年）4,505,796 → 課税所得 3,275,796 → 所得税 (3,275,000×10%−97,500)×1.021、住民税 342,580、事業税 80,290
// 事業税 bt＝(4,505,796−2,900,000)×5%÷1.05＝76,466.5 を経費に入れた所得 4,429,329.5 → 課税所得 3,199,329.5
eq('18件 税額（年）', Mx.tax * 12, (3199000 * 0.10 - 97500) * 1.021 + (3199329.5 + 150000) * 0.10 + 76466.5, 1);
eq('18件 月の手残り', Mx.left, 540000 * 0.955 - 140217 - 300000 - Mx.tax, 1e-6);
eq('18件は黒字', Mx.left >= 0, true);
eq('16件は赤字', monthlyAt(base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; }), 16, {}).left < 0, true);
Mx = monthlyAt(base(S => { S.sim.kessan = 180000; }), 10, { staff: 100000 });
eq('決算料は月の数字に入れない', Mx.left, 300000 - 140217 - 100000 - 300000);
eq('決算料は年間に入る', Mx.annual, Mx.left * 12 + 1800000);

// --- 損益の形（売上・変動費・固定費・税引前所得・税引後所得） ---
const Sp = base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; S.sim.kessan = 180000; S.sim.varCost = 1000; });
Mx = monthlyAt(Sp, 20, { staff: 100000 });
eq('売上（年）', Mx.salesY, 20 * 30000 * 12 + 20 * 180000);                      // 10,800,000
eq('変動費（年）', Mx.varM * 12 + Mx.ctaxY, 20 * 1000 * 12 + 10800000 * 0.045);   // 726,000
eq('固定費（年）', (Mx.fixed + Mx.staff) * 12, (140217 + 100000) * 12);
eq('税引前所得（年）', Mx.preY, 10800000 - 726000 - 240217 * 12, 1e-6);
eq('税引前所得（月・決算料を除く）', Mx.biz, 600000 * 0.955 - 20000 - 240217, 1e-6);
eq('税引後所得（年）', Mx.afterY, Mx.preY - Mx.taxY, 1e-6);
eq('手残り（年）', Mx.annual, Mx.afterY - 300000 * 12, 1e-6);
eq('月と年のつながり', Mx.biz * 12 + Mx.kessanNet, Mx.preY, 1e-6);
C = calcPlan(base(S => { S.sim.varCost = 1000; }), NOW);
eq('変動費が支出に入る', C.rows[0].out, 385290 + 5000);
eq('変動費が税引前所得から引かれる', C.years[0].profit, 2430000 - 85290 * 9 - 81000 - 1233900);

// --- 月間と年間の損益がそろっていること ---
Mx = monthlyAt(Sp, 20, { staff: 100000 });            // 月間は年間の12分の1（決算料は月平均）
eq('月間 売上', Mx.m.sales, 600000 + 20 * 180000 / 12);
eq('月間 税引前所得', Mx.m.pre, Mx.preY / 12, 1e-6);
eq('顧問料だけの月の税引前所得', Mx.biz, 600000 * 0.955 - 20000 - 240217, 1e-6);
eq('年間 税引前所得', Mx.y.pre, Mx.preY, 1e-6);
eq('年間＝月間×12（税引前）', Mx.m.pre * 12, Mx.y.pre, 1e-6);
eq('年間＝月間×12（手残り）', Mx.m.left * 12, Mx.y.left, 1e-6);
eq('年間＝顧問料だけの月×12＋決算料', Mx.left * 12 + Mx.kessanNet, Mx.y.left, 1e-6);
eq('月間の税額は年額の12分の1', Mx.m.tax * 12, Mx.y.tax, 1e-6);
['m', 'y'].forEach(k => { const v = Mx[k];
  eq(k + ' 税引前＝売上−変動費−固定費', v.sales - v.varc - v.ctax - v.fix - v.staff, v.pre, 1e-6);
  eq(k + ' 税引後＝税引前−税', v.pre - v.tax, v.after, 1e-6);
  eq(k + ' 手残り＝税引後−生活費等', v.after - v.living - v.kokuho - v.loan, v.left, 1e-6); });
const Sa = base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; S.sim.kessan = 180000; S.sim.kessanMode = 'avg'; });
Mx = monthlyAt(Sa, 20, {});                            // 決算料を月に均す：月間は年間の12分の1
['sales', 'ctax', 'pre', 'after', 'left'].forEach(k => eq('月割 ' + k, Mx.m[k] * 12, Mx.y[k], 1e-6));

// --- 支出の整合性：資金繰り表・損益表・必要資金・損益分岐が同じ数字を使っていること ---
const Sc = base(S => { S.ms.find(m => m.kind === 'open').ym = '2031-01'; S.openCosts = [];
  Object.assign(S.sim, { clients: 30, growth: 0, kessan: 180000, varCost: 1000, kokuho: 40000, loan: 3000000, loanYears: 7, loanRate: 2.5, ctaxOn: true, itaxOn: true });
  vet(S).on = true; vet(S).start = 1; });
C = calcPlan(Sc, NOW); Mx = monthlyAt(Sc, 30, { staff: 412000 });
const Y2 = C.years[1], tot = k => Y2.rows.reduce((t, r) => t + r[k], 0);      // 2032年（開業2年目・通年）
eq('整合：売上', tot('rev'), Mx.y.sales, 1);
eq('整合：変動費', tot('vr'), Mx.y.varc, 1);
eq('整合：消費税', tot('ctax'), Mx.y.ctax, 1);
eq('整合：固定費', tot('fx'), Mx.y.fix, 1);
eq('整合：人件費', tot('staff'), Mx.y.staff, 1);
eq('整合：税引前所得', Y2.profit, Mx.y.pre, 1);
eq('整合：所得税等（前年の事業税を経費にする分だけずれる）', Y2.tax, Mx.y.tax, 20000);
eq('整合：手残り＝年間の収支', tot('net'), Mx.y.left, 20000);
eq('整合：運転資金の月額＝資金繰り表1か月目の支出', C.month1, C.rows[0].out - C.rows[0].init, 1e-6);
eq('整合：運転資金に変動費と返済が入る', C.month1, 85290 + 30000 + 412000 + 300000 + 40000 + C.loanPay, 1e-6);
eq('整合：必要な手元資金', C.required, 180000 + 6 * C.month1, 1e-6);
// 見積タブの損益分岐：税金・変動費なしなら引き継ぎ資料と一致、ありなら結果タブと一致
[[20000, 8, 23], [30000, 5, 15], [40000, 4, 12], [50000, 3, 9]].forEach(([p, a, b]) => {
  eq(`損益分岐 税なし ${p} 税引前`, needClients(base(), { price: p }), a);
  eq(`損益分岐 税なし ${p} 手残り`, needClients(base(), { price: p, living: true }), b); });
const St = base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; });
eq('損益分岐 税あり 3万円＝結果タブの必要件数', needClients(St, { price: 30000, living: true }), needClients(St, { living: true }));
eq('損益分岐 実効単価4.5万円', needClients(base(), { price: 45000, living: true }), needClients(base(S => { S.sim.kessan = 180000; }), { living: true }));

// --- 国保・国民年金の自動計算（札幌市・令和8年度） ---
eq('給与所得 年収400万', salaryIncome(4000000), 4000000 - (800000 + 440000));     // 2,760,000
eq('給与所得 年収150万', salaryIncome(1500000), 850000);
eq('給与所得 年収300万', salaryIncome(3000000), 3000000 - 980000);
eq('給与所得 年収900万', salaryIncome(9000000), 9000000 - 1950000);
const Sk = base(S => { S.sim.kokuhoAuto = true; S.sim.prevSalary = 4000000; });
// 所得276万 → 基礎控除後233万。医療 233万×8.61%＋20,550＋32,540、支援 233万×2.56%＋6,330＋10,010、子ども 233万×0.29%＋1,100＋1,000
eq('国保 所得276万・1人・40歳未満', kokuhoAnnual(Sk, 2760000), 2330000 * (0.0861 + 0.0256 + 0.0029) + 20550 + 32540 + 6330 + 10010 + 1100 + 1000, 1e-6);
eq('国保 所得0は均等割と平等割だけ', kokuhoAnnual(Sk, 0), 71530);
eq('国保 高所得は上限（40歳未満 96万円）', kokuhoAnnual(Sk, 30000000), 670000 + 260000 + 30000);
eq('国保 40歳以上は介護分が加わる', kokuhoAnnual(base(S => { S.sim.khAge40 = true; }), 30000000), 1130000);
eq('国保 2人世帯は均等割が2人分', kokuhoAnnual(base(S => { S.sim.khMembers = 2; }), 0), 71530 + 20550 + 6330 + 1100);
C = calcPlan(Sk, NOW);                                 // 開業 2031年4月
const kh0 = kokuhoAnnual(Sk, 2760000) / 12 + 17920;    // 前年が給与だけの年度
eq('開業1か月目の国保年金は退職前の給与で決まる', C.rows[0].kokuho, kh0, 1e-6);
eq('翌年3月まで同じ', C.rows[11].kokuho, kh0, 1e-6);
// 2032年度（4月〜）は2031年の所得：給与3か月分（100万→所得35万）＋事業所得（2031年は赤字に近く、青色控除後0）
eq('2年目の4月からは開業年の所得で決まる', C.rows[12].kokuho, kokuhoAnnual(Sk, salaryIncome(1000000) + Math.max(0, C.years[0].profit - 650000)) / 12 + 17920, 1e-6);
eq('3年目の4月からは2年目の事業所得で決まる', C.rows[24].kokuho, kokuhoAnnual(Sk, Math.max(0, C.years[1].profit - 650000)) / 12 + 17920, 1e-6);
eq('国保年金が支出に入る', C.rows[0].out, 385290 + kh0, 1e-6);
eq('運転資金にも入る', C.required, 1233900 + 6 * (385290 + kh0), 1e-6);
Mx = monthlyAt(Sk, 20, {});
eq('損益表の国保年金（安定時）', Mx.m.kokuho, kokuhoAnnual(Sk, Mx.preY - 650000) / 12 + 17920, 1e-6);
eq('手入力に切り替えるとその金額', monthlyAt(base(S => { S.sim.kokuho = 40000; }), 20, {}).m.kokuho, 40000);
// 社会保険料控除として税額に反映される
const St2 = base(S => { S.sim.itaxOn = true; S.sim.kokuhoAuto = true; }), M2 = monthlyAt(St2, 20, {});
const bt2 = Math.max(0, (M2.preY - 2900000) * 0.05 / 1.05), tx2 = M2.preY - bt2 - 650000 - 580000 - M2.y.kokuho;
eq('国保年金は所得から引いて税額を計算', M2.y.tax, incomeTax(tx2) + (tx2 + 150000) * 0.10 + bt2, 1);

// --- 黒字の判定は決算料込みの年間で行い、表の手残りと食い違わないこと ---
const Sm = base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; S.sim.kessan = 150000; S.sim.kokuho = 20000; });
const nA = needClients(Sm, { staff: 412000, living: true });
eq('必要件数で年間の手残りがプラス', monthlyAt(Sm, nA, { staff: 412000 }).y.left >= 0, true);
eq('1件少ないと年間の手残りがマイナス', monthlyAt(Sm, nA - 1, { staff: 412000 }).y.left < 0, true);
eq('顧問料だけで見る件数のほうが多い', needClients(Sm, { staff: 412000, living: true, feeOnly: true }) > nA, true);
C = calcPlan(base(S => { S.sim.kessan = 150000; S.sim.clients = 30; S.sim.growth = 0; }), NOW);
eq('決算料を月割にならして黒字なら、黒字が続く月として数える', C.stableM, 1);

// --- 人員の総コスト（月給・賞与月数から自動計算） ---
eq('ベテラン：月給30万・賞与2か月・社保15%・ツール9,500', staffCost({ salary: 300000, bonusMonths: 2, shaho: 15, tools: 9500 }), 412000);
eq('資料の提示額：月給25万・賞与なし', staffCost({ salary: 250000, bonusMonths: 0, shaho: 15, tools: 9500 }), 250000 * 1.15 + 9500);
eq('賞与4か月', staffCost({ salary: 300000, bonusMonths: 4, shaho: 15, tools: 9500 }), 400000 * 1.15 + 9500);
eq('パート：社保なし', staffCost({ salary: 90000, bonusMonths: 0, shaho: 0, tools: 10000 }), 100000);
defaults().staff.forEach(x => eq('初期値の月額は自動計算と一致 ' + x.label, x.monthly, staffCost(x)));
const oldS = defaults(); oldS.staff.forEach(x => { delete x.salary; delete x.bonusMonths; delete x.shaho; delete x.tools; delete x.welfare; });
vet(oldS).monthly = 412000;                           // 月給などの内訳を持つ前の保存データ
oldS.staff[0].monthly = 123456;                        // 以前に手で直していた月額はそのまま残す
const MS = migrate(JSON.parse(JSON.stringify(oldS)));
eq('移行：ベテランの月給', vet(MS).salary, 300000);
eq('移行：ベテランの総コスト', vet(MS).monthly, 412000);
eq('移行：手で直した月額は変わらない', MS.staff[0].monthly, 123456);
eq('移行：手で直した行は月給に入る', MS.staff[0].salary, 123456);

// --- 仮置きで足した費用（按分なし・旅費交通費など・変動費の一覧・新規獲得費・福利厚生） ---
const Dn = defaults(), CDn = calcPlan(Dn, NOW);
eq('初期値：自宅按分は入れない', Dn.fixed.some(x => x.label === '自宅按分'), false);
eq('初期値：月の固定費', CDn.fixedBase, 140217 - 15000 + 15000 + 10000 + 5000 + 3000 + 3000 + 2000);   // 163,217
eq('初期値：1件あたりの変動費', varUnit(Dn), 850);
eq('初期値：ベテランの総コスト', vet(Dn).monthly, 421000);
const Sq = base(S => { S.vars = [{ id: 'a', label: 'x', amt: 850, note: '' }]; S.sim.acqCost = 50000; S.sim.churn = 12; });
C = calcPlan(Sq, NOW);
eq('変動費：1か月目は5件×850円、獲得費なし', C.rows[0].vr, 5 * 850);
eq('変動費：2か月目は件数×850円＋新規1件の獲得費', C.rows[1].vr, C.rows[1].clients * 850 + 50000, 1e-6);
eq('獲得費は税引前所得から引かれる', C.years[0].profit, C.years[0].rev - C.years[0].rows.reduce((t, r) => t + r.fx + r.vr, 0) - 1233900, 1e-6);
Mx = monthlyAt(Sq, 20, {});
eq('安定時の獲得費＝解約分の補充', Mx.y.acq, 20 * (1 - Math.pow(0.88, 1 / 12)) * 50000 * 12, 1e-6);
eq('安定時の変動費', Mx.y.varc, 20 * 850 * 12);
eq('税引前＝売上−変動費−獲得費−固定費', Mx.y.sales - Mx.y.varc - Mx.y.acq - Mx.y.ctax - Mx.y.fix - Mx.y.staff, Mx.y.pre, 1e-6);
// 解約と同じ数だけ毎月新規を取る安定状態では、資金繰り表と損益表の変動費が一致する
const Sr = base(S => { S.ms.find(m => m.kind === 'open').ym = '2031-01'; S.openCosts = []; S.vars = [{ id: 'a', label: 'x', amt: 850, note: '' }];
  Object.assign(S.sim, { clients: 20, churn: 12, acqCost: 50000, growth: 20 * (1 - Math.pow(0.88, 1 / 12)) }); });
C = calcPlan(Sr, NOW);
eq('整合：安定時の変動費＋獲得費', C.years[1].rows.reduce((t, r) => t + r.vr, 0), monthlyAt(Sr, 20, {}).y.varc + monthlyAt(Sr, 20, {}).y.acq, 1);
eq('福利厚生が総コストに入る', staffCost({ salary: 300000, bonusMonths: 2, shaho: 15, tools: 9500, welfare: 9000 }), 421000);
// 第1版の保存データ（按分あり・変動費の一覧なし）からの移行
const v1 = base(S => { S.sim.varCost = 300; }); v1.v = 1; delete v1.vars; v1.staff.forEach(x => delete x.welfare);
const M2v = migrate(JSON.parse(JSON.stringify(v1)));
eq('移行v2：自宅按分を外す', M2v.fixed.some(x => x.label === '自宅按分'), false);
eq('移行v2：仮置きの固定費を足す', M2v.fixed.filter(x => String(x.id).startsWith('p_')).length, 6);
eq('移行v2：以前の変動費は一覧に移す', varUnit(M2v), 850 + 300);
eq('移行v2：ベテランに福利厚生', vet(M2v).monthly, 421000);
eq('移行v2：2回かけても増えない', migrate(JSON.parse(JSON.stringify(M2v))).fixed.length, M2v.fixed.length);

// --- 借入：元金と利息 ---
const Sl = base(S => { Object.assign(S.sim, { loan: 3000000, loanYears: 7, loanRate: 2.5, itaxOn: true }); });
let prin = 0, intr = 0; for (let m = 1; m <= 84; m++) { const L = loanSplit(Sl, m); prin += L.principal; intr += L.interest; }
eq('元金の合計＝借入額', prin, 3000000, 1);
eq('1か月目の利息＝借入額×月利', loanSplit(Sl, 1).interest, 3000000 * 0.025 / 12, 1e-6);
eq('返済が終わった月は0', loanSplit(Sl, 85).pay, 0);
C = calcPlan(Sl, NOW);
eq('利息は税引前所得から引く', C.years[0].profit, C.years[0].rows.reduce((t, r) => t + r.rev - r.fx - r.interest, 0) - 1233900, 1e-6);
eq('返済額は元金と利息の合計のまま支出に入る', C.rows[0].out, 385290 + C.loanPay, 1e-6);
Mx = monthlyAt(Sl, 20, {});
let i2 = 0, p2 = 0; for (let m = 13; m <= 24; m++) { i2 += loanSplit(Sl, m).interest; p2 += loanSplit(Sl, m).principal; }
eq('損益表の支払利息は2年目の額', Mx.y.interest, i2, 1e-6);
eq('損益表の返済は元金だけ', Mx.y.loan, p2, 1e-6);
eq('利息＋元金＝年間の返済額', Mx.y.interest + Mx.y.loan, C.loanPay * 12, 1e-6);
eq('返済が1年で終わる借入は、2年目の損益に残らない', monthlyAt(base(S => { Object.assign(S.sim, { loan: 1000000, loanYears: 1, loanRate: 2 }); }), 20, {}).y.loan, 0);

// --- 労働分配率＝人件費（ツール代を除く）÷ 限界利益 ---
eq('人件費はツール代を除く', staffLabor({ salary: 300000, bonusMonths: 2, shaho: 15, tools: 9500, welfare: 9000 }), 411500);
C = calcPlan(base(S => { vet(S).on = true; vet(S).start = 1; S.sim.ctaxOn = true; S.vars = [{ id: 'a', label: 'x', amt: 1000, note: '' }]; S.sim.clients = 40; S.sim.growth = 0; }), NOW);
eq('分配率の分母は限界利益', C.rows[5].ratio, 402500 / (40 * 30000 * 0.955 - 40 * 1000), 1e-9);

// --- 解約があるとき、決算料（契約12か月目ごと）の年間額が資金繰り表と損益表で一致する ---
const Sz = base(S => { S.ms.find(m => m.kind === 'open').ym = '2031-01'; S.openCosts = [];
  Object.assign(S.sim, { clients: 25, churn: 10, kessan: 150000, months: 120, ctaxOn: true, itaxOn: true, kokuho: 30000 }); S.sim.growth = 25 * (1 - keepRate(S)); });
C = calcPlan(Sz, NOW); Mx = monthlyAt(Sz, 25, {});
const Y9 = C.years[8];                                 // 十分に時間がたった年
// 開業時の25件は全員が同じ月に決算料を払うかたまりとして残るので、完全には一致しない。3%以内に収まることを確かめる
eq('整合：決算料（解約あり）', Y9.rows.reduce((t, r) => t + r.ks, 0), Mx.y.kessan, Mx.y.kessan * 0.03);
eq('解約があると決算料は全件分より少ない', Mx.y.kessan < 25 * 150000 && Mx.y.kessan > 25 * 150000 * 0.9, true);
eq('月に均す設定なら全件分', monthlyAt(base(S => { Object.assign(S.sim, { churn: 10, kessan: 150000, kessanMode: 'avg' }); }), 25, {}).y.kessan, 3750000);
eq('解約なしなら決算料は全件分', monthlyAt(base(S => { S.sim.kessan = 150000; }), 20, {}).y.kessan, 3000000);

// --- 条件をいろいろ変えても崩れない関係 ---
let sd = 7; const rnd = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648, pick = a => a[Math.floor(rnd() * a.length)];
let bad = 0;
for (let k = 0; k < 150; k++) {
  const S = defaults(); S.ms.find(m => m.kind === 'open').ym = pick(['2031-01', '2031-03', '2031-04', '2031-12']);
  Object.assign(S.sim, { clients: pick([0, 5, 30]), growth: pick([0, 1, 3]), churn: pick([0, 5, 30]), ownerCap: pick([0, 30]), kessan: pick([0, 150000]), kessanMode: pick(['lump', 'avg']), months: pick([12, 36, 60]),
    loan: pick([0, 3000000]), loanYears: pick([1, 2, 7]), ctaxOn: rnd() < .7, itaxOn: rnd() < .7, kokuhoAuto: rnd() < .7, acqCost: pick([0, 50000]) });
  S.staff.forEach(x => { x.on = rnd() < .4; x.start = pick([1, 13]); });
  const P = calcPlan(S, NOW), R = P.rows;
  if (Math.abs(R[P.N - 1].bal - (P.b0 + R.reduce((t, r) => t + r.net, 0))) > 1) bad++;                              // 残高＝開業直後＋収支の合計
  if (R.some(r => ![r.rev, r.out, r.tax, r.bal, r.kokuho, r.ratio].every(isFinite) || r.tax < -1e-6)) bad++;       // 数字が壊れない
  if (Math.abs(P.required - (P.openCost + P.staffInit1 + S.sim.buffer * (R[0].out - R[0].init))) > 1) bad++;        // 必要資金の定義
  for (const n of [1, 20, 60]) { const M = monthlyAt(S, n, { staff: P.staffMAll });
    for (const v of [M.m, M.y]) { if (Math.abs(v.sales - v.varc - v.acq - v.ctax - v.fix - v.staff - v.interest - v.pre) > 1e-3) bad++;
      if (Math.abs(v.pre - v.tax - v.living - v.kokuho - v.loan - v.left) > 1e-3) bad++; }
    for (const key of Object.keys(M.y)) if (Math.abs(M.m[key] * 12 - M.y[key]) > 1e-2) bad++; }
  const nd = needClients(S, { staff: P.staffMAll, living: true });
  if (nd && monthlyAt(S, nd, { staff: P.staffMAll }).y.left < 0) bad++;                                             // 必要件数では黒字
  if (P.stableM && R.slice(P.stableM - 1).some(r => r.red)) bad++;                                                 // 黒字開始後に赤字がない
}
eq('150通りの条件で関係が崩れない', bad, 0);

// --- 第3版への移行（ベテランの初期費用の二重計上を外す） ---
const v2 = defaults(); v2.v = 2; vet(v2).init = 211600;
eq('移行v3：初期費用からClaude Pro年払いを外す', vet(migrate(JSON.parse(JSON.stringify(v2)))).init, 180000);
const v2b = defaults(); v2b.v = 2; vet(v2b).init = 250000;
eq('移行v3：自分で直した初期費用は変えない', vet(migrate(JSON.parse(JSON.stringify(v2b)))).init, 250000);

// --- 独立チェックで見つかった点 ---
// (1) 試算が年の途中で終わる年：一括入金の決算料を年換算で何倍にもしない
const Sp1 = base(S => { Object.assign(S.sim, { clients: 20, growth: 0, kessan: 180000, itaxOn: true, ctaxOn: true }); });   // 4月開業・36か月 → 最終年は2034年1〜3月
const Cl = calcPlan(Sp1, NOW), Ca = calcPlan(base(S => { Object.assign(S.sim, { clients: 20, growth: 0, kessan: 180000, kessanMode: 'avg', itaxOn: true, ctaxOn: true }); }), NOW);
eq('最終年（3か月）の税額は、月割の設定とほぼ同じ', Cl.years[3].tax, Ca.years[3].tax, 30000);
eq('最終年の税額は前年の4分の1程度', Cl.years[3].tax < Cl.years[2].tax * 0.4, true);
// (2) 決算料を当てにしない件数＝決算料0円のときの件数
const Sf = base(S => { Object.assign(S.sim, { kessan: 180000, itaxOn: true, ctaxOn: true }); });
eq('顧問料だけで見る件数＝決算料0円のときの件数', needClients(Sf, { living: true, feeOnly: true }), needClients(base(S => { Object.assign(S.sim, { itaxOn: true, ctaxOn: true }); }), { living: true }));
eq('顧問料0・決算料ありでも件数が出る', needClients(base(S => { S.sim.fee = 0; S.sim.kessan = 600000; }), { living: true }) > 0, true);
// (3) 国保：前年の赤字を繰り越した後の所得で決める。開業年の赤字は退職前の給与と通算する
const Sk3 = base(S => { Object.assign(S.sim, { kokuhoAuto: true, prevSalary: 4000000 }); });
const Ck = calcPlan(Sk3, NOW);                          // 2031年：事業は青色控除後0（黒字31.9万）、給与は1〜3月分100万 → 所得35万
eq('2032年度の国保は開業年の所得（給与35万＋事業0）で決まる', Ck.rows[12].kokuho, kokuhoAnnual(Sk3, 350000) / 12 + 17920, 1e-6);
const Sk4 = base(S => { S.ms.find(m => m.kind === 'open').ym = '2031-10'; Object.assign(S.sim, { kokuhoAuto: true, prevSalary: 4000000, clients: 0 }); });
const Ck4 = calcPlan(Sk4, NOW), loss31 = Ck4.years[0].profit;   // 10月開業・顧問先0件 → 開業年は赤字
eq('開業年の赤字は給与所得と通算して国保を決める', Ck4.rows[6].kokuho, kokuhoAnnual(Sk4, Math.max(0, salaryIncome(3000000) + loss31)) / 12 + 17920, 1e-6);   // 2032年4月
// (4) 開業後の日付の節目の支出も資金繰りに入る
const So = base(S => { S.ms.push({ id: 'x', label: '車の買い替え', ym: '2031-10', cost: 500000, done: false, note: '', kind: '' }); });
eq('開業後の節目の支出', calcPlan(So, NOW).rows[6].out, calcPlan(base(), NOW).rows[6].out + 500000);
eq('開業後の節目の支出で残高が減る', calcPlan(So, NOW).rows[35].bal, calcPlan(base(), NOW).rows[35].bal - 500000, 1e-6);
// (5) 退職前の給与にかかる住民税（開業年の6月〜翌年5月）
const Sr2 = base(S => { Object.assign(S.sim, { itaxOn: true, prevSalary: 4000000 }); }), Cr = calcPlan(Sr2, NOW);
const res = (2760000 - 430000 - 4000000 * 0.145) * 0.10 + 5000;   // 180,000
eq('住民税：4・5月はなし', Cr.rows[1].prevRes, 0);
eq('住民税：6月から月割', Cr.rows[2].prevRes, res / 12, 1e-6);
eq('住民税：翌年5月まで払う', Cr.rows[13].prevRes > 0, true);
eq('住民税：翌年6月からはなし', Cr.rows[14].prevRes, 0);
eq('住民税：12か月の合計', Cr.rows.reduce((t, r) => t + r.prevRes, 0), res, 1e-6);
// (6) 個人事業税は翌年の経費になる
const Sb = base(S => { Object.assign(S.sim, { clients: 40, growth: 0, itaxOn: true }); S.ms.find(m => m.kind === 'open').ym = '2031-01'; S.openCosts = []; });
const Cb = calcPlan(Sb, NOW), bt31 = Math.max(0, Cb.years[0].profit - 2900000) * 0.05;
const tx32 = Cb.years[1].profit - bt31 - 650000 - 580000;
eq('2年目の税額は、前年の事業税を経費にした所得で計算', Cb.years[1].tax, incomeTax(tx32) + (tx32 + 150000) * 0.10 + Math.max(0, Cb.years[1].profit - bt31 - 2900000) * 0.05, 1);

// --- 保存データの移行 ---
const old = defaults(); old.staff.forEach(x => delete x.cap); old.fixed.forEach(x => delete x.pre); delete old.sim.churn;
const M = migrate(JSON.parse(JSON.stringify(old)));
eq('移行：ベテランの担当件数', vet(M).cap, 30);
eq('移行：前払いの印', M.fixed.filter(x => x.pre).length, 8);
eq('移行：解約率の初期値', M.sim.churn, 5);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
