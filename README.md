# 独立ロードマップ

税理士事務所の独立開業計画を、スマホ1台で見直すためのツールです。

- `app.html` … 本体（HTML・CSS・JavaScript を1ファイルに収録。外部ライブラリなし）
- `index.html` … `app.html` を単体で開ける形に包んだもの（`./build.sh` で再生成）
- `test.js` … 計算の検算（`node test.js`）。引き継ぎ資料の数字と手計算を正解として突き合わせる

## 画面

| タブ | 内容 |
| --- | --- |
| 道のり | 現在地の一覧、今日→開業→開業後の手元資金グラフ、節目の年表（編集・完了チェック）、開業が1年・2年遅れた場合の比較 |
| 資金 | 開業までの積立計画、必要な手元資金の明細、過不足、必要な毎月積立の逆算、借入 |
| 見積 | 開業費用と月の固定費の明細（行ごとに編集・追加）、損益分岐の顧問先数 |
| 開業後 | 顧問先数・解約率・担当上限・単価・人員計画から月次の資金繰り表（千円単位）と労働分配率を計算。消費税と所得税・住民税・個人事業税の概算、1人版と2人版の比較、年別の概算 |

入力はブラウザ（localStorage）にだけ保存されます。「道のり」タブの下でファイルへの書き出し・読み込みができます。初期値は引き継ぎ資料の数字で、貯蓄・積立・学費・パート月額などは例または仮置きです。

## Claude連携（MCP）

Cloudflare Workers に小さなサーバーを置くと、Claude が計画を読み書きできます。サーバーは計画の保管と、画面と同じ計算を行います。

| ファイル | 役割 |
| --- | --- |
| `worker.js` | Cloudflare に貼るサーバー本体（`./build.sh` が自動生成） |
| `worker.src.js` | サーバーの雛形。編集するのはこちら |
| `test-worker.mjs` | サーバーの検算（`node test-worker.mjs`） |

Claude から使える操作：

| 操作 | 内容 |
| --- | --- |
| `get_plan` | 計画の内容と試算結果を読む |
| `get_cashflow` | 月次の資金繰り表と年別の概算を読む |
| `simulate` | 保存せずに、前提を変えた場合の結果を見る |
| `update_settings` | 積立や開業後の前提を書き換える |
| `upsert_item` | 節目・開業費用・固定費・人員の行を追加・変更する |
| `delete_item` | 行を削除する |

### 設定の手順（パソコンのブラウザが楽です）

1. https://dash.cloudflare.com でアカウントを作ってログインする（無料）。
2. 左メニューの「Storage & Databases」→「KV」で、名前 `dokuritsu-plan` の入れ物を作る。
3. 左メニューの「Workers & Pages」→「Create」→「Hello World」から、名前 `dokuritsu-mcp` のワーカーを作って「Deploy」する。
4. 「Edit code」を開き、最初から入っているコードを全部消して、`worker.js` の中身を貼り付けて「Deploy」する。
   中身はここからコピーできます：
   https://raw.githubusercontent.com/jun281rad-coder/koba-dokuritu/claude/zealous-mendel-ri835o/worker.js
5. ワーカーの「Settings」→「Bindings」→「Add」→「KV namespace」で、Variable name を `PLAN_KV`、入れ物を `dokuritsu-plan` にして保存する。
6. 独立ロードマップの画面で「道のり」タブ →「Claude連携」→「合言葉を作る」を押し、出てきた文字列をコピーする。
7. ワーカーの「Settings」→「Variables and Secrets」→「Add」で、Type を `Secret`、名前を `TOKEN`、値に合言葉を貼って「Deploy」する。
8. 独立ロードマップの画面の「連携URL」に `https://dokuritsu-mcp.（自分のサブドメイン）.workers.dev/（合言葉）` を入れて「保存して同期」を押す。右上が「サーバーと同期済み」になれば成功。
9. 「Claudeに登録するURLをコピー」を押す（連携URLの末尾に `/mcp` が付いたもの）。
10. https://claude.ai/customize/connectors でカスタムコネクタを追加し、URL に 9 でコピーしたものを貼る。認証の欄は空のままにする。
11. 新しいチャットで「独立ロードマップの計画を読んで」と頼む。

### 知っておくこと

- 合言葉を含むURLを知っている人は、計画を読み書きできます。URLは他人に見せず、このリポジトリにも書かないでください。漏れたと思ったら、手順7で `TOKEN` を新しい合言葉に変えれば古いURLは使えなくなります。
- 連携すると、計画は Cloudflare にも保存されます。2台目の端末でも、同じ連携URLを入れれば同じ計画が開きます。
- Claude が書き換えた内容は、画面を開き直すかタブを切り替えたときに読み込まれます。
- 画面で入力している途中に Claude が書き換えた場合は、Claude 側の内容が優先され、直前の入力は取り消されます（右上に表示されます）。
