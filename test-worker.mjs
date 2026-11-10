// MCPサーバー（worker.js）の検算。 node test-worker.mjs で実行（外部ライブラリなし）
import fs from 'node:fs';
const worker = (await import('./worker.js?' + Date.now()).catch(async () =>
  import('data:text/javascript;base64,' + fs.readFileSync(new URL('./worker.js', import.meta.url)).toString('base64')))).default;

const src = fs.readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('/*CALC-START*/'), src.indexOf('/*CALC-END*/'));
const { defaults } = new Function(block + '\nreturn {defaults};')();

const store = new Map();
const TOKEN = 'test-token-0123456789abcdefghij';
const env = { TOKEN, PLAN_KV: { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } } };
const call = (path, init) => worker.fetch(new Request('https://w.example/' + path, init), env);
let n = 0, pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log(`NG  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const rpc = async (method, params) => {
  const r = await call(TOKEN + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) });
  return (await r.json());
};
const tool = async (name, args) => { const r = (await rpc('tools/call', { name, arguments: args })).result; return { err: !!r.isError, out: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) }; };

// --- 入口 ---
eq('合言葉が違えば404', (await call('wrong/mcp', { method: 'POST', body: '{}' })).status, 404);
eq('GETは405', (await call(TOKEN + '/mcp')).status, 405);
eq('設定なしは500', (await worker.fetch(new Request('https://w.example/x/mcp'), {})).status, 500);
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
eq('initialize: 版', init.result.protocolVersion, '2025-06-18');
eq('initialize: tools', init.result.capabilities, { tools: {} });
eq('未知の版は最新を返す', (await rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');
eq('通知は202', (await call(TOKEN + '/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status, 202);
eq('未知のメソッド', (await rpc('nope')).error.code, -32601);
const list = (await rpc('tools/list')).result.tools;
eq('ツール一覧', list.map(t => t.name), ['get_plan', 'get_cashflow', 'simulate', 'update_settings', 'upsert_item', 'delete_item']);
eq('全ツールに説明と入力定義', list.every(t => t.description.length > 20 && t.inputSchema.type === 'object'), true);

// --- 計画がまだ無い ---
eq('未同期なら読めない', (await tool('get_plan')).err, true);
eq('未同期なら書けない', (await tool('update_settings', { settings: { sim: { fee: 40000 } } })).err, true);

// --- 画面からの同期 ---
const plan = defaults(); plan.updatedAt = 1000;
const put = (p, base) => call(TOKEN + '/api/plan', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: p, base }) });
eq('プリフライト', (await call(TOKEN + '/api/plan', { method: 'OPTIONS' })).status, 204);
eq('空のGET', (await (await call(TOKEN + '/api/plan')).json()).plan, null);
eq('初回の保存', (await put(plan, 0)).status, 200);
eq('形式違いは400', (await put({ x: 1 }, 1000)).status, 400);
eq('GETで戻る', (await (await call(TOKEN + '/api/plan')).json()).plan.updatedAt, 1000);
eq('CORS', (await call(TOKEN + '/api/plan')).headers.get('access-control-allow-origin'), '*');

// --- 読む ---
let g = (await tool('get_plan')).out;
eq('開業費用', g.results.opening_cost, 1233900);
eq('月の固定費', g.results.monthly_fixed_cost, 163217);   // 資料の140,217 − 自宅按分15,000 ＋ 仮置きの費用38,000
eq('必要な手元資金', g.results.required_funds, 3985934);   // 開業費用 ＋ 6か月 ×（固定費108,290 ＋ 変動費4,250 ＋ 生活費30万 ＋ 国保年金46,132）
eq('損益分岐 3万円', g.results.break_even_clients_by_price.owner_only['30000'], { income_before_tax_in_black: 6, cash_left_positive_after_living_and_tax: 21 });   // 国保・年金を自動計算に入れた件数
eq('節目の数', g.milestones.length, 11);
eq('開業の節目', g.milestones.filter(m => m.is_opening).map(m => m.ym), ['2031-04']);
const cf = (await tool('get_cashflow')).out;
eq('資金繰り表の月数', cf.monthly.length, 36);
eq('1か月目の顧問料', cf.monthly[0].advisory_fee, 150000);

// --- 試すだけ ---
const sim = (await tool('simulate', { settings: { sim: { fee: 40000 } }, delay_months: 12 })).out;
eq('simulate: 保存しない', sim.saved, false);
eq('simulate: 開業月がずれる', sim.simulated.opening_month, '2032-04');
eq('simulate: 現在は変わらない', sim.current.opening_month, '2031-04');
eq('simulate後も単価はそのまま', (await tool('get_plan')).out.settings.sim.fee, 30000);
eq('simulate: 指定なしはエラー', (await tool('simulate', {})).err, true);

// --- 書き換える ---
let u = await tool('update_settings', { settings: { sim: { fee: 40000 }, pre: { monthly: 80000 } } });
eq('update: 変更した項目', u.out.changed, ['pre.monthly', 'sim.fee']);
eq('update: 保存された', JSON.parse(store.get('plan')).sim.fee, 40000);
eq('update: 更新時刻が進む', JSON.parse(store.get('plan')).updatedAt > 1000, true);
eq('update: 無い項目', (await tool('update_settings', { settings: { sim: { nope: 1 } } })).err, true);
eq('update: 型違い', (await tool('update_settings', { settings: { sim: { fee: '4万' } } })).err, true);
eq('update: 選択肢違い', (await tool('update_settings', { settings: { sim: { kessanMode: 'x' } } })).err, true);
eq('エラー時は保存しない', JSON.parse(store.get('plan')).sim.fee, 40000);

const openId = g.milestones.find(m => m.is_opening).id;
u = await tool('upsert_item', { list: 'milestones', id: openId, fields: { ym: '2032-04' } });
eq('開業月の変更', u.out.results.opening_month, '2032-04');
eq('ymの形式違い', (await tool('upsert_item', { list: 'milestones', id: openId, fields: { ym: '2032/4' } })).err, true);
u = await tool('upsert_item', { list: 'fixed_costs', fields: { label: 'プリンター消耗品', amount: 2000, prepaid: false } });
eq('固定費の追加', u.out.results.monthly_fixed_cost, 165217);
const newId = u.out.id;
eq('追加した行', u.out.item.label, 'プリンター消耗品');
eq('ラベルなしの追加', (await tool('upsert_item', { list: 'fixed_costs', fields: { amount: 1 } })).err, true);
eq('無いid', (await tool('upsert_item', { list: 'staff', id: 'zzz', fields: { planned: true } })).err, true);
const vetId = (await tool('get_plan')).out.staff.find(x => /ベテラン/.test(x.label)).id;
u = await tool('upsert_item', { list: 'staff', id: vetId, fields: { planned: true, start: 1 } });
eq('ベテランを開業時から', u.out.results.staff_monthly_cost_planned, 421000);
u = await tool('upsert_item', { list: 'staff', id: vetId, fields: { salary: 250000, bonus_months: 0 } });
eq('月給と賞与月数から総コストを自動計算', u.out.item.monthly_total_cost, 250000 * 1.15 + 9500 + 9000);
eq('総コストは直接は書き換えられない', (await tool('upsert_item', { list: 'staff', id: vetId, fields: { monthly: 1 } })).err, true);
u = await tool('upsert_item', { list: 'staff', fields: { label: '記帳スタッフ', salary: 200000, bonus_months: 1, social_insurance_rate: 15, tools: 10000, planned: false } });
eq('新規の人員も自動計算', u.out.item.monthly_total_cost, Math.round(200000 * (1 + 1 / 12) * 1.15 + 10000));
await tool('upsert_item', { list: 'staff', id: vetId, fields: { salary: 300000, bonus_months: 2 } });
u = await tool('delete_item', { list: 'fixed_costs', id: newId });
eq('固定費の削除', u.out.results.monthly_fixed_cost, 163217);
u = await tool('upsert_item', { list: 'variable_costs', fields: { label: '外注費', amount: 300 } });
eq('変動費の追加', (await tool('get_plan')).out.variable_costs.reduce((t, x) => t + x.amount, 0), 1150);
await tool('delete_item', { list: 'variable_costs', id: u.out.id });
eq('福利厚生も書き換えられる', (await tool('upsert_item', { list: 'staff', id: vetId, fields: { welfare: 9000 } })).out.item.monthly_total_cost, 421000);
eq('開業の節目は削除できない', (await tool('delete_item', { list: 'milestones', id: openId })).err, true);
eq('未知のツール', (await rpc('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);

// --- 画面側の古い版では上書きできない ---
const stale = await put(plan, 1000);
eq('古い版は409', stale.status, 409);
eq('409はサーバーの版を返す', (await stale.json()).plan.sim.fee, 40000);
const cur = JSON.parse(store.get('plan')); const next = { ...cur, updatedAt: cur.updatedAt + 5 };
eq('最新版からの保存は通る', (await put(next, cur.updatedAt)).status, 200);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
