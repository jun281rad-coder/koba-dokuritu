# 独立ロードマップ（個人用ツール）

税理士事務所の独立開業計画を、持ち主がスマホ1台で見直すためのツール。持ち主は会計事務所の職員で、数字に強い。

## 構成

- `app.html` … 本体。HTML・CSS・JavaScript を1ファイルに収録。外部ライブラリなし。**編集するのはこのファイル**
- `index.html` … `app.html` を包んだ公開用ファイル。手で編集しない。`./build.sh` で作り直す
- `test.js` … 計算の検算。`node test.js`
- `worker.src.js` … Claude連携（MCP）用の Cloudflare Workers サーバーの雛形。**サーバーを直すときはこのファイル**
- `worker.js` … `./build.sh` が `worker.src.js` に `app.html` の計算部分を差し込んで作る。手で編集しない
- `test-worker.mjs` … サーバーの検算。`node test-worker.mjs`

## 直すときの手順

1. `app.html` を編集する
2. `./build.sh` で `index.html` を作り直す
3. `node test.js` と `node test-worker.mjs` がすべて合格することを確認する。計算を変えたら、正解の数字とテストも合わせて直す
4. `app.html`・`index.html`・`worker.js` をまとめてコミットする
5. `worker.js` が変わったときは、持ち主が Cloudflare のワーカーに貼り直すまでサーバーには反映されない。そのことを伝える

## 公開

GitHub Pages が `claude/zealous-mendel-ri835o` ブランチの `/ (root)` を配信している。
公開URLは https://jun281rad-coder.github.io/koba-dokuritu/ 。
このブランチに入った変更だけが、数分後に公開される。別のブランチで作業した場合は、このブランチへのマージが必要。

## 守ること

- 計算は `/*CALC-START*/` 〜 `/*CALC-END*/` の中に置き、画面（DOM）に触れない。`test.js` がこの範囲を取り出して実行する
- 入力はブラウザの localStorage（キー `dokuritsu-roadmap-v1`）に保存される。保存済みの内容が初期値より優先されるので、項目を足すときは `migrate()` に既定値の補完を入れ、キー名は変えない
- 体裁は見積書のような表・リスト形式。大きな数字カードは使わない。マイナスは△、資金繰り表は千円単位。会計用語は正しく使う（収支と残高の月次推移は「資金繰り表」。「残高試算表」とは呼ばない）
- スマホ幅（約390px）で横にはみ出さないこと。ライト・ダーク両方の配色を保つこと
- 引き継ぎ資料と違う前提を入れるときは、理由を画面のメモか返答に明記する。仮置きの数字は「仮置き」と書く
- 連携URLと合言葉（TOKEN）は秘密。コード・コミット・README に書かない。画面側は localStorage（`dokuritsu-sync-url`）にだけ持つ
- 保存データに項目を足したら、サーバーが書き換えられる項目の一覧（`worker.src.js` の `PRE`・`SIM`・`LISTS`）にも足す
