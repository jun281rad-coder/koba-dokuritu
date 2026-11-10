// 独立ロードマップ MCPサーバー（Cloudflare Workers）
// このファイルは雛形。./build.sh が app.html の計算部分を差し込んで worker.js を作る。Cloudflare に貼るのは worker.js。
//
// 必要な設定（Cloudflare のダッシュボード）
//   KV の割り当て   変数名 PLAN_KV
//   シークレット    変数名 TOKEN （長いランダムな合言葉）
//
// URL
//   https://<worker>/<TOKEN>/mcp        Claude のコネクタに登録する
//   https://<worker>/<TOKEN>/api/plan   ツールの画面が計画を同期する

/*__CALC__*/

const SERVER = { name: 'dokuritsu-roadmap', version: '1.0.0' };
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const nowJst = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
const round = n => Math.round(n);

// ---- 書き換えられる項目 ----
const N = d => ({ type: 'number', description: d });
const B = d => ({ type: 'boolean', description: d });
const PRE = {
  savings: N('現在の開業用貯蓄（円）'),
  monthly: N('毎月の積立（円）'),
  bonus: N('賞与からの積立（年額・円）。6月と12月に半分ずつ加算'),
};
const SIM = {
  clients: N('開業時の顧問先数（件）'),
  growth: N('顧問先の増加（件/月）'),
  churn: N('年間の解約率（%）'),
  ownerCap: N('所長が担当できる件数。0で上限なし'),
  fee: N('顧問料の月額単価（円・税込）'),
  varCost: N('変動費（顧問先1件あたり・月・円）。外注費・口座振替手数料・紹介手数料など'),
  kessan: N('決算料（1件あたり年1回・円）'),
  kessanMode: { type: 'string', enum: ['lump', 'avg'], description: '決算料の入金。lump=契約12か月目に一括、avg=毎月に均す' },
  living: N('生活費（月・円）'),
  kokuho: N('国保・国民年金（月・円）'),
  months: N('開業後に試算する月数（1〜120）'),
  buffer: N('運転資金として持つ月数'),
  autoFunds: B('true=開業時の手元資金を積立計画から計算、false=funds の手入力を使う'),
  funds: N('開業時の手元資金の手入力額（円）。autoFunds=false のときだけ使う'),
  loan: N('開業時の借入額（円）。0で借入なし'),
  loanYears: N('借入の返済期間（年）'),
  loanRate: N('借入の金利（年・%）'),
  ctaxOn: B('消費税を納める（インボイス登録）か'),
  ctaxRate: N('消費税の納税額（税込売上に対する%）'),
  itaxOn: B('所得税・住民税・個人事業税の概算を入れるか'),
  deduct: N('所得控除（年額・円）。青色申告特別控除65万円と国保年金は別に自動で引く'),
  slipCost: N('開業が遅れる場合の1年あたりの追加支出（円）'),
};
const S = d => ({ type: 'string', description: d });
// 外向きの項目名 → [保存データ上の名前, スキーマ]
const LISTS = {
  milestones: { key: 'ms', label: '節目', fields: {
    label: ['label', S('内容')], ym: ['ym', S('予定月。YYYY-MM')], cost: ['cost', N('その月の支出（円）。貯蓄から差し引く')],
    note: ['note', S('メモ')], done: ['done', B('完了したか')] } },
  open_costs: { key: 'openCosts', label: '開業費用', fields: {
    group: ['g', S('区分（登録関係・保険・機器・ソフトウェア初年度・その他 など）')], label: ['label', S('項目')],
    amount: ['amt', N('金額（円）')], note: ['note', S('メモ')] } },
  fixed_costs: { key: 'fixed', label: '月の固定費', fields: {
    group: ['g', S('区分（システム代・その他雑費 など）')], label: ['label', S('項目')], amount: ['amt', N('月額（円）')],
    note: ['note', S('メモ')], prepaid: ['pre', B('初年度分を開業費用で前払いしているか。trueなら開業1〜12か月目は支出に入れない')] } },
  staff: { key: 'staff', label: '人員', fields: {
    label: ['label', S('役割')], planned: ['on', B('計画に入れる（採用する）か')], start: ['start', N('採用する月。開業月を1とする')],
    monthly: ['monthly', N('月額コスト（円）。給与＋賞与月割＋社保＋ツール')], init: ['init', N('採用時の初期費用（円）')],
    cap: ['cap', N('担当できる顧問先数（件）')], note: ['note', S('メモ')] } },
};
const props = spec => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, Array.isArray(v) ? v[1] : v]));
const SETTINGS_SCHEMA = { type: 'object', description: '変更する項目だけを入れる', properties: {
  pre: { type: 'object', description: '開業までの積立', properties: PRE, additionalProperties: false },
  sim: { type: 'object', description: '開業後の前提', properties: SIM, additionalProperties: false } }, additionalProperties: false };

const TOOLS = [
  { name: 'get_plan',
    description: '税理士事務所の独立開業計画（独立ロードマップ）の現在の内容と試算結果を読む。節目の年表、開業までの積立、開業費用、月の固定費、人員計画、開業後の前提、必要な手元資金・過不足・単月黒字化・残高の底などの結果を返す。金額は円・税込。相談に答える前や、書き換える前に呼ぶ。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_cashflow',
    description: '開業後の月次の資金繰り表（顧問先数・顧問料・決算料・支出・税金・収支・残高・労働分配率）と、年別の概算（売上・事業の利益・税額）を読む。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'simulate',
    description: '計画を保存せずに、前提を変えた場合の試算結果を返す（もしもの比較用）。現在の結果と変更後の結果を並べて返す。計画そのものは変わらない。',
    inputSchema: { type: 'object', properties: {
      settings: SETTINGS_SCHEMA,
      delay_months: N('未完了の節目と開業をまとめて遅らせる月数（例：12）'),
      delay_cost: N('遅れによる追加支出の合計（円）') }, additionalProperties: false } },
  { name: 'update_settings',
    description: '計画の前提（開業までの積立、開業後の顧問先数・単価・生活費・税金・借入など）を書き換えて保存する。変更する項目だけを渡す。持ち主のスマホの画面にも反映される。持ち主が変更を頼んだときだけ使う。',
    inputSchema: { type: 'object', properties: { settings: SETTINGS_SCHEMA }, required: ['settings'], additionalProperties: false } },
  { name: 'upsert_item',
    description: '節目・開業費用・月の固定費・人員の1行を追加または変更して保存する。id を渡すとその行を変更し、省くと新しい行を追加する。id は get_plan で分かる。開業予定月を変えるには、milestones の is_opening が true の行の ym を変える。',
    inputSchema: { type: 'object', properties: {
      list: { type: 'string', enum: Object.keys(LISTS), description: 'milestones=節目、open_costs=開業費用、fixed_costs=月の固定費、staff=人員' },
      id: S('変更する行の id。新規追加のときは省く'),
      fields: { type: 'object', description: '変更する項目だけを入れる。list ごとに使える項目： ' +
        Object.entries(LISTS).map(([k, v]) => k + '（' + Object.entries(v.fields).map(([f, x]) => f + '=' + x[1].description).join('、') + '）').join(' ／ ') } },
      required: ['list', 'fields'], additionalProperties: false } },
  { name: 'delete_item',
    description: '節目・開業費用・月の固定費・人員の1行を削除して保存する。開業の節目は削除できない。持ち主が削除を頼んだときだけ使う。',
    inputSchema: { type: 'object', properties: {
      list: { type: 'string', enum: Object.keys(LISTS) }, id: S('削除する行の id') }, required: ['list', 'id'], additionalProperties: false } },
];

// ---- 計画の読み書き ----
async function loadPlan(env) {
  const raw = await env.PLAN_KV.get('plan');
  if (!raw) throw new Error('まだ計画がサーバーにありません。独立ロードマップの画面の「Claude連携」で連携URLを保存し、一度同期してください。');
  return migrate(JSON.parse(raw));
}
async function savePlan(env, plan) {
  plan.updatedAt = Date.now();
  await env.PLAN_KV.put('plan', JSON.stringify(plan));
}

function results(C, plan) {
  const last = C.rows[C.N - 1], s = plan.sim;
  const be = fixed => Object.fromEntries([20000, 30000, 40000, 50000, round(C.price)].map(p => [p, { fixed_only: need(fixed, p), with_living: need(fixed + s.living + s.kokuho, p) }]));
  return {
    opening_month: C.open, months_until_opening: C.preN,
    opening_cost: round(C.openCost),
    monthly_fixed_cost: round(C.fixedBase), monthly_fixed_cost_first_year: round(C.fixed1),
    required_funds: round(C.required), required_funds_note: '開業費用＋開業時採用の初期費用＋運転資金' + s.buffer + 'か月（月' + round(C.month1) + '円）',
    projected_funds_at_opening: round(C.funds + C.loan), surplus_or_shortage: round(C.gap),
    balance_right_after_opening: round(C.b0),
    effective_monthly_price: round(C.price),
    clients_needed_for_cash_to_grow_every_month: { owner_only: needClients(plan, { living: true }), with_planned_staff: needClients(plan, { staff: C.staffMAll, living: true }), note: '生活費・税金込み。2年目以降の固定費で計算' },
    clients_needed_for_business_in_black: { owner_only: needClients(plan, {}), with_planned_staff: needClients(plan, { staff: C.staffMAll }) },
    annual_profit_and_loss_by_client_count: [5, 10, 15, 20, 25, 30, 40, 50].map(n => { const M = monthlyAt(plan, n, { staff: C.staffMAll }); return { clients: n, sales: round(M.salesY), variable_costs_incl_consumption_tax: round(M.varM * 12 + M.ctaxY), fixed_costs_incl_staff: round((M.fixed + M.staff) * 12), income_before_tax: round(M.preY), income_after_tax: round(M.afterY), cash_left_after_living: round(M.annual) }; }),
    month_black_becomes_stable: C.stableM || null,
    first_month_in_black_incl_living_and_tax: C.firstBlack || null,
    first_month_business_in_black: C.firstBiz || null,
    lowest_balance: { amount: round(C.minBal), month_after_opening: C.minM },
    end: { month_after_opening: C.N, balance: round(last.bal), clients: Math.round(last.clients * 10) / 10, monthly_revenue: round(last.revA), labor_share: C.staffMAll ? Math.round(last.ratio * 1000) / 1000 : null },
    capacity_reached_month: C.capM || null,
    taxes_total: { consumption: round(C.ctaxT), income_resident_business: round(C.itaxT) },
    staff_monthly_cost_planned: round(C.staffMAll),
    break_even_clients_by_price: { owner_only: be(C.fixedBase), with_planned_staff: be(C.fixedBase + C.staffMAll) },
  };
}
function listOut(plan, name) {
  const L = LISTS[name];
  return plan[L.key].map(x => {
    const o = { id: x.id };
    for (const [ext, [int]] of Object.entries(L.fields)) o[ext] = x[int];
    if (name === 'milestones') o.is_opening = x.kind === 'open';
    return o;
  });
}
function planOut(plan) {
  const C = calcPlan(plan, nowJst());
  return {
    as_of: nowJst(), unit: '円（税込）。△の代わりに負の数で表す', last_updated: new Date(plan.updatedAt || 0).toISOString(),
    settings: { pre: plan.pre, sim: Object.fromEntries(Object.keys(SIM).map(k => [k, plan.sim[k]])) },
    milestones: listOut(plan, 'milestones').sort((a, b) => a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0),
    open_costs: listOut(plan, 'open_costs'), fixed_costs: listOut(plan, 'fixed_costs'), staff: listOut(plan, 'staff'),
    results: results(C, plan),
    notes: '税金は概算。納税は当年の各月に均している。初期値には仮置きの数字が含まれる（各行の note を参照）。',
  };
}

function checkValue(schema, v, name) {
  if (schema.type === 'number') { if (typeof v !== 'number' || !isFinite(v)) throw new Error(name + ' は数値で指定してください'); return v; }
  if (schema.type === 'boolean') { if (typeof v !== 'boolean') throw new Error(name + ' は true か false で指定してください'); return v; }
  if (typeof v !== 'string') throw new Error(name + ' は文字列で指定してください');
  if (schema.enum && !schema.enum.includes(v)) throw new Error(name + ' は ' + schema.enum.join(' / ') + ' のどれかにしてください');
  if (v.length > 300) throw new Error(name + ' が長すぎます（300文字まで）');
  return v;
}
function applySettings(plan, settings) {
  if (!settings || typeof settings !== 'object') throw new Error('settings を指定してください');
  const changed = [];
  for (const [grp, spec] of [['pre', PRE], ['sim', SIM]]) {
    for (const [k, v] of Object.entries(settings[grp] || {})) {
      if (!spec[k]) throw new Error(grp + '.' + k + ' という項目はありません');
      plan[grp][k] = checkValue(spec[k], v, grp + '.' + k);
      changed.push(grp + '.' + k);
    }
  }
  for (const k of Object.keys(settings)) if (k !== 'pre' && k !== 'sim') throw new Error('settings.' + k + ' という項目はありません');
  if (!changed.length) throw new Error('変更する項目がありません');
  plan.sim.months = Math.max(1, Math.min(120, Math.round(plan.sim.months)));
  return changed;
}
function applyItem(plan, a) {
  const L = LISTS[a.list];
  if (!L) throw new Error('list は ' + Object.keys(LISTS).join(' / ') + ' のどれかにしてください');
  if (!a.fields || typeof a.fields !== 'object') throw new Error('fields を指定してください');
  const vals = {};
  for (const [k, v] of Object.entries(a.fields)) {
    if (!L.fields[k]) throw new Error(a.list + ' に ' + k + ' という項目はありません');
    vals[L.fields[k][0]] = checkValue(L.fields[k][1], v, k);
  }
  if ('ym' in vals && !okYm(vals.ym)) throw new Error('ym は YYYY-MM の形で指定してください');
  if ('start' in vals) vals.start = Math.max(1, Math.round(vals.start));
  const arr = plan[L.key];
  let row;
  if (a.id) {
    row = arr.find(x => x.id === a.id);
    if (!row) throw new Error(L.label + 'に id=' + a.id + ' の行はありません');
    Object.assign(row, vals);
  } else {
    if (!vals.label) throw new Error('新しい行には label が必要です');
    const base = { milestones: { ym: nowJst(), done: false, cost: 0, note: '', kind: '' }, open_costs: { g: 'その他', amt: 0, note: '' },
      fixed_costs: { g: 'その他雑費', amt: 0, note: '', pre: false }, staff: { on: true, start: 13, monthly: 0, init: 0, cap: 0, note: '' } }[a.list];
    row = Object.assign({ id: uid() }, base, vals);
    arr.push(row);
  }
  return row.id;
}

async function callTool(name, a, env) {
  a = a || {};
  if (name === 'get_plan') return planOut(await loadPlan(env));
  if (name === 'get_cashflow') {
    const plan = await loadPlan(env), C = calcPlan(plan, nowJst());
    return { unit: '円', yearly: C.years.map(Y => ({ year: Y.y, months: Y.n, revenue: round(Y.rev), business_profit_before_blue_deduction: round(Y.profit), income_resident_business_tax: round(Y.tax), consumption_tax: round(Y.ctax) })),
      monthly: C.rows.map(r => ({ m: r.m, ym: r.ym, clients: Math.round(r.clients * 10) / 10, at_capacity: r.capped, advisory_fee: round(r.fee), closing_fee: round(r.ks), expenses: round(r.out), taxes: round(r.tax), net: round(r.net), balance: round(r.bal), labor_share: r.staff ? Math.round(r.ratio * 1000) / 1000 : null, hired: r.hire.map(h => h.label) })) };
  }
  if (name === 'simulate') {
    const plan = await loadPlan(env), now = nowJst();
    const before = results(calcPlan(plan, now), plan);
    const trial = JSON.parse(JSON.stringify(plan));
    const changed = a.settings ? applySettings(trial, a.settings) : [];
    const slip = a.delay_months ? { from: now, months: Math.round(checkValue({ type: 'number' }, a.delay_months, 'delay_months')), cost: a.delay_cost || 0 } : null;
    if (!changed.length && !slip) throw new Error('settings か delay_months のどちらかを指定してください');
    return { saved: false, changed, delay: slip ? { months: slip.months, cost: slip.cost } : null, current: before, simulated: results(calcPlan(trial, now, slip ? { slip } : {}), trial) };
  }
  if (name === 'update_settings') {
    const plan = await loadPlan(env), changed = applySettings(plan, a.settings);
    await savePlan(env, plan);
    return { saved: true, changed, results: results(calcPlan(plan, nowJst()), plan) };
  }
  if (name === 'upsert_item') {
    const plan = await loadPlan(env), id = applyItem(plan, a);
    await savePlan(env, plan);
    return { saved: true, list: a.list, id, item: listOut(plan, a.list).find(x => x.id === id), results: results(calcPlan(plan, nowJst()), plan) };
  }
  if (name === 'delete_item') {
    const L = LISTS[a.list];
    if (!L) throw new Error('list は ' + Object.keys(LISTS).join(' / ') + ' のどれかにしてください');
    const plan = await loadPlan(env), row = plan[L.key].find(x => x.id === a.id);
    if (!row) throw new Error(L.label + 'に id=' + a.id + ' の行はありません');
    if (row.kind === 'open') throw new Error('開業の節目は削除できません。月を変えるには upsert_item で ym を変更してください');
    plan[L.key] = plan[L.key].filter(x => x.id !== a.id);
    await savePlan(env, plan);
    return { saved: true, deleted: { list: a.list, id: a.id, label: row.label }, results: results(calcPlan(plan, nowJst()), plan) };
  }
  throw new Error('不明なツールです: ' + name);
}

// ---- MCP（Streamable HTTP・状態を持たない JSON 応答） ----
async function rpc(msg, env) {
  const isNote = !msg || !('id' in msg);
  const ok = result => isNote ? null : { jsonrpc: '2.0', id: msg.id, result };
  const err = (code, message) => isNote ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } };
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg && 'method' in msg ? err(-32600, 'Invalid Request') : null;
  switch (msg.method) {
    case 'initialize': {
      const v = msg.params && msg.params.protocolVersion;
      return ok({ protocolVersion: PROTOCOLS.includes(v) ? v : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: SERVER,
        instructions: '税理士事務所の独立開業計画「独立ロードマップ」を読み書きする。まず get_plan で現状を読む。数字を変えた場合を試すだけなら simulate を使い、持ち主が変更を頼んだときだけ update_settings / upsert_item / delete_item で保存する。金額は円・税込。' });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const p = msg.params || {};
      if (!TOOLS.some(t => t.name === p.name)) return err(-32602, 'Unknown tool: ' + p.name);
      try {
        const out = await callTool(p.name, p.arguments, env);
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: String(e && e.message || e) }], isError: true });
      }
    }
    default: return err(-32601, 'Method not found: ' + msg.method);
  }
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, PUT, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };

export default {
  async fetch(request, env) {
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    if (!env.TOKEN || String(env.TOKEN).length < 20 || !env.PLAN_KV) return json({ error: 'TOKEN（20文字以上）と PLAN_KV の設定が必要です' }, 500);
    if (parts[0] !== env.TOKEN) return new Response('Not found', { status: 404 });
    const route = parts.slice(1).join('/');

    if (route === 'mcp') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
      let body;
      try { body = await request.json(); } catch (e) { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map(m => rpc(m, env)))).filter(Boolean);
        return out.length ? json(out) : new Response(null, { status: 202 });
      }
      const out = await rpc(body, env);
      return out ? json(out) : new Response(null, { status: 202 });
    }

    if (route === 'api/plan') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const raw = await env.PLAN_KV.get('plan'), stored = raw ? JSON.parse(raw) : null;
      if (request.method === 'GET') return json({ plan: stored }, 200, CORS);
      if (request.method === 'PUT') {
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: 'JSONを読めません' }, 400, CORS); }
        const plan = body && body.plan;
        if (!plan || !Array.isArray(plan.ms) || !plan.sim || !Array.isArray(plan.fixed)) return json({ error: '計画の形式が違います' }, 400, CORS);
        // 画面が最後に同期した版とサーバーの版が違えば、上書きさせない（Claude 側の変更を消さないため）
        if (stored && (stored.updatedAt || 0) !== (body.base || 0)) return json({ conflict: true, plan: stored }, 409, CORS);
        await env.PLAN_KV.put('plan', JSON.stringify(plan));
        return json({ ok: true, updatedAt: plan.updatedAt || 0 }, 200, CORS);
      }
      return new Response('Method not allowed', { status: 405, headers: CORS });
    }
    return new Response('Not found', { status: 404 });
  },
};
