// 自動生成。編集するのは worker.src.js と app.html。./build.sh で作り直す
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

/*CALC-START*/
var uid=function(){return Math.random().toString(36).slice(2,9)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var nowYm=function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
var okYm=function(s){return /^\d{4}-(0[1-9]|1[0-2])$/.test(s||'')};
var ymN=function(ym){return (+ym.slice(0,4))*12+(+ym.slice(5,7))-1};
var nYm=function(n){return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')};
var ymAdd=function(ym,k){return nYm(ymN(ym)+k)};
var ymDiff=function(a,b){return ymN(b)-ymN(a)};
var ymL=function(ym){return (+ym.slice(0,4))+'年'+(+ym.slice(5,7))+'月'};
var dur=function(n){n=Math.abs(n);var y=Math.floor(n/12),m=n%12;return (y?y+'年':'')+((m||!y)?m+'か月':'')};
var yen=function(n){n=Math.round(n);return (n<0?'△':'')+Math.abs(n).toLocaleString('ja-JP')};
var sen=function(n){return yen(n/1000)};
var cls=function(n){return n<0?' neg':''};
var toNum=function(s){var v=parseFloat(String(s).replace(/[,，\s円]/g,'').replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-65248)}).replace(/^△/,'-'));return isFinite(v)?v:0};

/* ---------- 初期値（引き継ぎ資料の数字） ---------- */
function defaults(){
  var oc=function(g,label,amt,note){return {id:uid(),g:g,label:label,amt:amt,note:note||''}};
  var fx=function(g,label,amt,note){return {id:uid(),g:g,label:label,amt:amt,note:note||'',pre:/達人|弥生|税務通信|Google Workspace|セキュリティ|本会会費|支部会費|税賠/.test(label)}};
  var ms=function(label,ym,cost,note,kind){return {id:uid(),label:label,ym:ym,done:false,cost:cost||0,note:note||'',kind:kind||''}};
  return {v:1,updatedAt:0,
    pre:{savings:1000000,monthly:50000,bonus:200000},
    ms:[
      ms('簿記論 合格','2027-12',0,'合格発表の月を入れる'),
      ms('財務諸表論 合格','2027-12',0,''),
      ms('大学院 入学（入学金・1年目学費）','2028-04',900000,'学費は仮置き。志望校の募集要項で置き換える'),
      ms('大学院 2年目学費','2029-04',700000,'仮置き'),
      ms('税法1科目 合格','2029-12',0,'大学院（修士論文）で免除されるのは税法3科目のうち2科目まで。残り1科目は試験合格が必要'),
      ms('修士論文 提出・大学院修了','2030-03',0,''),
      ms('国税審議会の免除認定','2030-09',0,'修了後に申請。時期は仮置き'),
      ms('退職の意思表示・引継ぎ開始','2030-10',0,''),
      ms('税理士登録 申請','2030-11',0,'申請から登録まで数か月かかる前提'),
      ms('税理士登録 完了','2031-03',0,'実務経験2年以上の要件は勤務4年目で充足見込み'),
      ms('開業','2031-04',0,'自宅開業・札幌','open')
    ],
    openCosts:[
      oc('登録関係','登録免許税',60000),
      oc('登録関係','登録手数料',70000,'2027年4月以降の払込みは70,000円（引継ぎ資料は改定前の50,000円）'),
      oc('登録関係','北海道税理士会 入会金',40000),
      oc('登録関係','本会会費（年額）',95000),
      oc('登録関係','支部会費（年額）',60000,'公式非公開のため仮置き'),
      oc('登録関係','会館建設費等',30000,'公式非公開のため仮置き'),
      oc('保険','税理士職業賠償責任保険',50040,'個人・2型＋事前特約'),
      oc('機器','PC',150000,'機器合計 約249,000円の内訳は仮置き'),
      oc('機器','ScanSnap iX2500',59400,'買い切り'),
      oc('機器','モニタ・周辺機器',39600,'仮置き'),
      oc('ソフトウェア初年度','達人シリーズ 最小実務セット',262020),
      oc('ソフトウェア初年度','弥生PAP 年会費',105600),
      oc('ソフトウェア初年度','税務通信（データベース付き）',52800),
      oc('ソフトウェア初年度','Google Workspace Business Standard',21120),
      oc('ソフトウェア初年度','セキュリティ',12540),
      oc('その他','HP・名刺・挨拶状等',95780),
      oc('その他','自宅整備',30000)
    ],
    fixed:[
      fx('システム代','達人シリーズ',21835),
      fx('システム代','弥生PAP',8800),
      fx('システム代','Claude Max',15800,'月100ドル・1ドル=158円換算。月払いのみ'),
      fx('システム代','Google Workspace',1760),
      fx('システム代','税務通信',4400),
      fx('システム代','セキュリティ',1045),
      fx('システム代','集金代行手数料',5000,'口座振替・リコーリース想定'),
      fx('その他雑費','本会会費',7917,'年95,000円の月割'),
      fx('その他雑費','支部会費',5000,'仮置き'),
      fx('その他雑費','税賠保険',4170),
      fx('その他雑費','通信費',8000),
      fx('その他雑費','自宅按分',15000),
      fx('その他雑費','HP保守',6490),
      fx('その他雑費','書籍・消耗品',5000),
      fx('その他雑費','集客費',30000,'紹介中心＋成果報酬型サイト')
    ],
    staff:[
      {id:uid(),label:'パート（記帳＋総務兼務）',on:false,start:7,monthly:100000,init:180000,cap:10,note:'月額・担当件数は仮置き（給与＋ツール約1万円）'},
      {id:uid(),label:'ベテラン社員',on:false,start:13,monthly:412000,init:211600,cap:30,note:'月給30万＋賞与月割5万＋社保52,500＋ツール9,500。初期はPC等18万＋Claude Pro年払い'},
      {id:uid(),label:'パート（総務専任）',on:false,start:25,monthly:100000,init:180000,cap:0,note:'月額は仮置き'},
      {id:uid(),label:'税務署OB（非常勤）',on:false,start:31,monthly:50000,init:0,cap:0,note:'月額は仮置き。調査立会いはOB本人の税理士登録が前提'}
    ],
    sim:{clients:5,growth:1,fee:30000,kessan:0,kessanMode:'lump',living:300000,kokuho:0,months:36,buffer:6,autoFunds:true,funds:3900000,loan:0,loanYears:7,loanRate:2.5,ctaxOn:true,ctaxRate:4.5,itaxOn:true,deduct:580000,churn:5,ownerCap:30,slipCost:0,varCost:0}
  };
}
function migrate(s){
  var d=defaults(); if(!s||typeof s!=='object') return d;
  ['pre','sim'].forEach(function(k){s[k]=Object.assign({},d[k],s[k]||{})});
  ['ms','openCosts','fixed','staff'].forEach(function(k){if(!Array.isArray(s[k])) s[k]=d[k]});
  if(!s.ms.some(function(m){return m.kind==='open'})) s.ms.push(d.ms[d.ms.length-1]);
  s.ms.forEach(function(m){if(!okYm(m.ym)) m.ym=nowYm()});
  s.fixed.forEach(function(x){if(typeof x.pre!=='boolean') x.pre=/達人|弥生|税務通信|Google Workspace|セキュリティ|本会会費|支部会費|税賠/.test(x.label)});
  s.staff.forEach(function(x){if(typeof x.cap!=='number') x.cap=/ベテラン/.test(x.label)?30:/記帳/.test(x.label)?10:0});
  s.updatedAt=s.updatedAt||0; s.v=1; return s;
}
/* ---------- 計算（画面に依存しない。test.js がこの範囲を取り出して検算する） ---------- */
var sum=function(a,f){return a.reduce(function(t,x){return t+(f(x)||0)},0)};
var need=function(fixed,price){return price>0?Math.ceil(fixed/price):0};
function incomeTax(t){
  t=Math.floor(Math.max(0,t)/1000)*1000;
  var B=[[1949000,.05,0],[3299000,.10,97500],[6949000,.20,427500],[8999000,.23,636000],[17999000,.33,1536000],[39999000,.40,2796000],[Infinity,.45,4796000]];
  for(var i=0;i<B.length;i++) if(t<=B[i][0]) return (t*B[i][1]-B[i][2])*1.021;
}
function loanPayment(S){
  var loan=Math.max(0,S.sim.loan),n=Math.max(1,Math.round(S.sim.loanYears*12)),r=S.sim.loanRate/1200;
  return loan>0?(r>0?loan*r/(1-Math.pow(1+r,-n)):loan/n):0;
}
/* 所得税＋住民税＋個人事業税の概算。inc=青色申告特別控除前の事業の利益、mon=その年に事業をした月数 */
function annualTax(S,inc,mon){
  if(!S.sim.itaxOn||inc<=0) return 0;
  var taxable=inc-650000-S.sim.deduct-S.sim.kokuho*mon;
  return incomeTax(taxable)+Math.max(0,taxable+150000)*0.10+Math.max(0,inc-2900000*mon/12)*0.05;
}
/* 黒字が続くのに必要な顧問先数（2年目以降の固定費で計算）。
   o.staff: 人件費の月額／o.living: 生活費・国保年金・返済・所得税等まで賄うか／o.annual: 年間の合計で見るか（決算料込み）
   o.annual でないときは、決算料が入らない月でも収支がプラスになる件数（決算料を月に均す設定なら月割込み） */
/* 顧問先が n 件で安定したときの損益（2年目以降の固定費）。o.staff: 人件費の月額。金額はすべて円
   月の数字（biz・afterM・left）は決算料が入らない月のもの。年の数字（…Y・annual）は決算料を含む
   変動費＝1件あたりの変動費＋消費税の納税額（税込経理なので租税公課として費用に入る） */
function monthlyAt(S,n,o){
  o=o||{};
  var fixed=sum(S.fixed,function(x){return x.amt}),staff=o.staff||0,c=S.sim.ctaxOn?S.sim.ctaxRate/100:0;
  var fee=n*S.sim.fee,kessanY=n*S.sim.kessan,salesY=fee*12+kessanY,varM=n*(S.sim.varCost||0);
  var biz=fee*(1-c)-varM-fixed-staff;                              // 税引前所得（月・決算料を除く）
  var preY=biz*12+kessanY*(1-c);                                   // 税引前所得（年）
  var taxY=annualTax(S,preY,12),loanM=loanPayment(S);
  var left=biz-taxY/12-S.sim.living-S.sim.kokuho-loanM;
  return {n:n,fee:fee,kessanY:kessanY,salesY:salesY,varM:varM,ctax:fee*c,ctaxY:salesY*c,fixed:fixed,staff:staff,
    biz:biz,preY:preY,bizAnnual:preY,tax:taxY/12,taxY:taxY,afterM:biz-taxY/12,afterY:preY-taxY,
    living:S.sim.living,kokuho:S.sim.kokuho,loan:loanM,left:left,kessanNet:kessanY*(1-c),annual:left*12+kessanY*(1-c)};
}
/* 黒字が続くのに必要な顧問先数。o.living: 生活費・国保年金・返済・所得税等まで賄うか（false なら事業の利益だけ）
   o.annual: 決算料も含めた年間の合計で見るか。決算料を月に均す設定のときは、常に年間で見る */
function needClients(S,o){
  o=o||{};
  if(!(S.sim.fee>0)) return null;
  var byYear=o.annual||S.sim.kessanMode==='avg';
  for(var n=1;n<=3000;n++){
    var M=monthlyAt(S,n,o),v=o.living?(byYear?M.annual:M.left):(byYear?M.bizAnnual:M.biz);
    if(v>=0) return n;
  }
  return null;
}
/* o.staff: 採用する人員を差し替える（比較用）／o.slip:{from:'YYYY-MM',months:n,cost:円} その月以降の未完了の節目を遅らせ、追加支出を引く */
function calcPlan(S,now,o){
  o=o||{};
  var ms=S.ms.map(function(m){return (o.slip&&!m.done&&ymN(m.ym)>=ymN(o.slip.from))?Object.assign({},m,{ym:ymAdd(m.ym,o.slip.months)}):m});
  var open=ms.filter(function(m){return m.kind==='open'})[0].ym,preN=Math.max(0,ymDiff(now,open));
  var bal=S.pre.savings,accM=0,accB=0,accC=0,pre=[];
  var costAt=function(test){return sum(ms,function(m){return (!m.done&&m.kind!=='open'&&m.cost>0&&test(m.ym))?m.cost:0})};
  var c0=costAt(function(ym){return ymN(ym)<=ymN(now)}); bal-=c0; accC+=c0;
  pre.push({ym:now,bal:bal});
  for(var i=1;i<=preN;i++){
    var ym=ymAdd(now,i),mo=+ym.slice(5,7);
    bal+=S.pre.monthly; accM+=S.pre.monthly;
    if(mo===6||mo===12){bal+=S.pre.bonus/2;accB+=S.pre.bonus/2}
    var c=costAt(function(y){return y===ym}); bal-=c; accC+=c;
    pre.push({ym:ym,bal:bal});
  }
  if(o.slip&&o.slip.cost>0){bal-=o.slip.cost;accC+=o.slip.cost;pre[pre.length-1].bal=bal}   // 遅れによる追加支出
  var projected=bal;
  var funds=S.sim.autoFunds?projected:S.sim.funds;
  var openCost=sum(S.openCosts,function(x){return x.amt});
  var fixedBase=sum(S.fixed,function(x){return x.amt});
  var loan=Math.max(0,S.sim.loan),nPay=Math.max(1,Math.round(S.sim.loanYears*12)),loanPay=loanPayment(S);
  var staffOn=o.staff||S.staff.filter(function(s){return s.on});
  var staffM=function(m){return sum(staffOn,function(s){return s.start<=m?s.monthly:0})};
  var staffI=function(m){return sum(staffOn,function(s){return s.start===m?s.init:0})};
  var capAt=function(m){return S.sim.ownerCap>0?S.sim.ownerCap+sum(staffOn,function(s){return s.start<=m?(s.cap||0):0}):Infinity};
  var keep=Math.pow(1-Math.min(0.99,Math.max(0,S.sim.churn||0)/100),1/12);   // 月ごとの継続率
  var price=S.sim.fee+S.sim.kessan/12;
  var fixedAt=function(m){return sum(S.fixed,function(x){return (x.pre&&m<=12)?0:x.amt})};
  var lump=S.sim.kessanMode!=='avg';
  var N=Math.max(1,Math.min(120,Math.round(S.sim.months)));
  var rows=[],cohorts=[],capM=0,m;
  // 1) 顧問先数（契約月ごとの束で持つ）・収入・支出
  for(m=1;m<=N;m++){
    cohorts.forEach(function(q){q.n*=keep});
    var have=sum(cohorts,function(q){return q.n}),add=m===1?Math.max(0,S.sim.clients):Math.max(0,S.sim.growth),room=capAt(m)-have,capped=false;
    if(add>room+1e-9){add=Math.max(0,room);capped=true;if(!capM)capM=m}
    cohorts.push({k:m,n:add});
    var cl=have+add;
    var fee=cl*S.sim.fee,kAvg=cl*S.sim.kessan/12,ks=kAvg;
    if(lump) ks=sum(cohorts,function(q){return (m-q.k+1)%12===0?q.n*S.sim.kessan:0});
    var rev=fee+ks,fxm=fixedAt(m),sm=staffM(m),si=staffI(m),lp=(loan>0&&m<=nPay)?loanPay:0,vr=cl*(S.sim.varCost||0);
    rows.push({m:m,ym:ymAdd(open,m-1),clients:cl,capped:capped,fee:fee,ks:ks,rev:rev,revA:fee+kAvg,fx:fxm,vr:vr,staff:sm,init:si,
      out:fxm+vr+sm+si+S.sim.living+S.sim.kokuho+lp,ctax:S.sim.ctaxOn?rev*S.sim.ctaxRate/100:0,itax:0,
      ratio:(fee+kAvg)>0?sm/(fee+kAvg):0,hire:staffOn.filter(function(s){return s.start===m})});
  }
  // 2) 所得税・住民税・個人事業税（暦年ごとの概算を、その年の月に均して積み立てる）
  var years=[],ymap={};
  rows.forEach(function(r){var y=r.ym.slice(0,4);if(!ymap[y]){ymap[y]={y:y,n:0,rev:0,profit:0,ctax:0,tax:0,rows:[]};years.push(ymap[y])}
    var Y=ymap[y];Y.n++;Y.rev+=r.rev;Y.ctax+=r.ctax;Y.profit+=r.rev-r.fx-r.vr-r.staff-r.init-r.ctax;Y.rows.push(r)});
  if(years.length) years[0].profit-=openCost;
  var carry=0;
  years.forEach(function(Y,idx){
    var partialEnd=idx>0&&idx===years.length-1&&Y.n<12;      // 試算が年の途中で終わる年は年換算して税率を決める
    var f=partialEnd?12/Y.n:1,inc=Y.profit*f+carry;
    if(inc<0){carry=inc;Y.tax=0;return}
    carry=0;
    Y.tax=annualTax(S,inc,partialEnd?12:Y.n)/f;
    Y.rows.forEach(function(r){r.itax=Y.tax/Y.n});
  });
  // 3) 残高
  var b=funds+loan-openCost,b0=b,minBal=b0,minM=0,firstBlack=0,firstBiz=0,lastRed=0,ctaxT=0,itaxT=0;
  rows.forEach(function(r){
    r.tax=r.ctax+r.itax; r.net=r.rev-r.out-r.tax; b+=r.net; r.bal=b; ctaxT+=r.ctax; itaxT+=r.itax;
    if(b<minBal){minBal=b;minM=r.m}
    var basis=lump?r.fee:r.revA;
    r.red=basis-(r.out-r.init)-r.tax<0;          // 決算料の一括入金と採用時の初期費用を除いて赤字か
    if(r.red) lastRed=r.m; else if(!firstBlack) firstBlack=r.m;
    if(!firstBiz&&basis-r.fx-r.vr-r.staff-r.ctax>=0) firstBiz=r.m;
  });
  var fixed1=fixedAt(1),month1=fixed1+staffM(1)+S.sim.living+S.sim.kokuho;
  var required=openCost+staffI(1)+month1*S.sim.buffer;
  return {now:now,open:open,preN:preN,pre:pre,accM:accM,accB:accB,accC:accC,projected:projected,funds:funds,openCost:openCost,
    fixedBase:fixedBase,fixed1:fixed1,loan:loan,loanPay:loanPay,price:price,rows:rows,years:years,ctaxT:ctaxT,itaxT:itaxT,b0:b0,minBal:minBal,minM:minM,firstBlack:firstBlack,firstBiz:firstBiz,stableM:lastRed<N?lastRed+1:0,
    capM:capM,capEnd:capAt(N),month1:month1,staffInit1:staffI(1),staffM1:staffM(1),staffMAll:sum(staffOn,function(s){return s.monthly}),required:required,gap:funds+loan-required,N:N};
}


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
