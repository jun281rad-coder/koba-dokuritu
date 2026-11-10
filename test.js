// 計算の検算。 node test.js で実行（外部ライブラリなし）
// app.html の /*CALC-START*/ 〜 /*CALC-END*/ を取り出して、引き継ぎ資料の数字と手計算を正解として突き合わせる
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.html', 'utf8');
const block = src.slice(src.indexOf('/*CALC-START*/'), src.indexOf('/*CALC-END*/'));
const { defaults, calcPlan, need, incomeTax, ymAdd, migrate, needClients, monthlyAt } =
  new Function(block + '\nreturn {defaults,calcPlan,need,incomeTax,ymAdd,migrate,needClients,monthlyAt};')();

let pass = 0, fail = 0;
function eq(name, got, want, tol = 0.5) {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  if (ok) pass++; else { fail++; console.log(`NG  ${name}: got ${got}, want ${want}`); }
}
const NOW = '2026-11';
// 引き継ぎ資料と同じ前提（解約なし・担当上限なし・税金なし）
function base(mut) {
  const S = defaults();
  Object.assign(S.sim, { churn: 0, ownerCap: 0, ctaxOn: false, itaxOn: false });
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
eq('積立合計', C.accM, 53 * 50000);
eq('賞与積立', C.accB, 900000);                      // 6月・12月が計9回 × 10万円
eq('節目の支出', C.accC, 1600000);
eq('開業時の見込み資金', C.projected, 2950000);
eq('必要な手元資金 1人', C.required, 1233900 + 6 * 385290);
eq('過不足 1人', C.gap, 2950000 - 3545640);
let C2 = calcPlan(base(), NOW, { staff: [{ start: 1, monthly: 412000, init: 211600, cap: 30 }] });
eq('必要な手元資金 2人', C2.required, 1233900 + 211600 + 6 * 797290);

// --- 顧問先数と収入 ---
eq('1か月目の件数', C.rows[0].clients, 5);
eq('36か月目の件数', C.rows[35].clients, 40);
eq('1か月目の収入', C.rows[0].rev, 150000);
eq('1か月目の支出', C.rows[0].out, 385290);
eq('12か月目の支出', C.rows[11].out, 385290);
eq('13か月目の支出（前払い終了）', C.rows[12].out, 440217);
eq('開業直後の残高', C.b0, 2950000 - 1233900);
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
eq('2人版 1か月目の支出', C.rows[0].out, 385290 + 412000 + 211600);
eq('2人版 2か月目の支出', C.rows[1].out, 385290 + 412000);
eq('2人版 36か月目の分配率', C.rows[35].ratio, 412000 / 1200000, 1e-9);

// --- 借入 ---
C = calcPlan(base(S => { S.sim.loan = 3000000; S.sim.loanYears = 7; S.sim.loanRate = 2.5; }), NOW);
const r = 2.5 / 1200;
eq('元利均等の現在価値', C.loanPay * (1 - Math.pow(1 + r, -84)) / r, 3000000, 1);
eq('借入後の開業直後残高', C.b0, 2950000 + 3000000 - 1233900);

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
eq('2032年 事業の利益', y32.profit, 7020000 - (85290 * 3 + 140217 * 9) - 315900);
// 課税所得 5,186,277 − 650,000 − 580,000 ＝ 3,956,277
eq('2032年 所得税等', y32.tax, 371338 + (3956277 + 150000) * 0.10 + (5186277 - 2900000) * 0.05, 1);
eq('税金の合計', C.ctaxT + C.itaxT, C.rows.reduce((t, x) => t + x.tax, 0), 1);

// --- 遅れた場合 ---
const S0 = base();
const D = calcPlan(S0, NOW, { slip: { from: S0.ms[0].ym, months: 12 } });
eq('1年遅れの開業月', D.open, '2032-04');
eq('1年遅れの見込み資金', D.projected, 2950000 + 12 * 50000 + 200000);
const D2 = calcPlan(S0, NOW, { slip: { from: '2030-11', months: 12 } });
eq('登録申請から遅れる：開業月', D2.open, '2032-04');
eq('登録申請から遅れる：学費は変わらない', D2.accC, 1600000);
const D3 = calcPlan(S0, NOW, { slip: { from: NOW, months: 24, cost: 600000 } });
eq('2年遅れ・追加支出あり：開業月', D3.open, '2033-04');
eq('2年遅れ・追加支出あり：見込み資金', D3.projected, 2950000 + 24 * 50000 + 400000 - 600000);

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
const left = n => { const rev = n * 360000, ct = rev * 0.045, inc = rev - ct - 140217 * 12, tx = inc - 1230000;
  const tax = incomeTax(tx) + Math.max(0, tx + 150000) * 0.10 + Math.max(0, inc - 2900000) * 0.05; return n * 28650 - 440217 - tax / 12; };
eq('必要件数 税金込み：その件数で黒字', left(nT) >= 0, true);
eq('必要件数 税金込み：1件少ないと赤字', left(nT - 1) < 0, true);
Sn = base(S => { S.sim.kessan = 180000; });            // 決算料あり・一括：毎月で見ると顧問料だけ、年間で見ると実効4.5万円
eq('必要件数 決算料一括 毎月', needClients(Sn, { living: true }), 15);
eq('必要件数 決算料一括 年間', needClients(Sn, { living: true, annual: true }), 10);   // 440,217 ÷ 45,000 = 9.78
C = calcPlan(base(), NOW);
eq('黒字が続き始める月（税金なし）', C.stableM, 9);     // 9か月目：13件×3万＝39万 ≥ 38.5万。13か月目以降も 17件×3万＝51万 ≥ 44万
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
eq('18件 税額（月）', Mx.tax * 12, (3275000 * 0.10 - 97500) * 1.021 + (3275796 + 150000) * 0.10 + (4505796 - 2900000) * 0.05, 1);
eq('18件 月の手残り', Mx.left, 540000 * 0.955 - 140217 - 300000 - Mx.tax, 1e-6);
eq('18件は黒字', Mx.left >= 0, true);
eq('17件は赤字', monthlyAt(base(S => { S.sim.ctaxOn = true; S.sim.itaxOn = true; }), 17, {}).left < 0, true);
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

// --- 保存データの移行 ---
const old = defaults(); old.staff.forEach(x => delete x.cap); old.fixed.forEach(x => delete x.pre); delete old.sim.churn;
const M = migrate(JSON.parse(JSON.stringify(old)));
eq('移行：ベテランの担当件数', vet(M).cap, 30);
eq('移行：前払いの印', M.fixed.filter(x => x.pre).length, 8);
eq('移行：解約率の初期値', M.sim.churn, 5);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
