#!/bin/sh
# app.html（本体）から、単体で開ける index.html を作る
{
  printf '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%%}[hidden]{display:none!important}</style></head><body>\n'
  cat app.html
  printf '</body></html>\n'
} > index.html

# worker.src.js に app.html の計算部分を差し込んで、Cloudflare に貼る worker.js を作る
node -e '
const fs=require("fs");const a=fs.readFileSync("app.html","utf8");
const calc=a.slice(a.indexOf("/*CALC-START*/"),a.indexOf("/*CALC-END*/"));
fs.writeFileSync("worker.js","// 自動生成。編集するのは worker.src.js と app.html。./build.sh で作り直す\n"+fs.readFileSync("worker.src.js","utf8").replace("/*__CALC__*/",()=>calc));
'
