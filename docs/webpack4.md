# webpack 4向け配布物とホスト接続

通常のESM/型宣言と、webpack 4のparserが読めるES2018配布物を `pnpm build` で生成する。後者はRJSF/AJV/YAMLを含む。esbuildは開発依存のみ。CSSはホストの既存CSS modules loaderを使う。

```js
const {withBlockEditorWebpack4} = require('@kubohiroya/turbowarp-block-editor/webpack4');
module.exports = withBlockEditorWebpack4(config, {hostRoot: __dirname});
```

`config` は単一または配列。既存のloader/aliasを保持し、引数を変更しない。ルート・/rjsf・/react・/turbowarp・CSSのaliasとReact/ReactDOM/JSX runtimeのホスト解決を共通側で管理する。ホストはReact 16.14以降（宣言されたpeer範囲）を用意する。Reactとruntimeをホスト側へ揃えることで重複したReactを避ける。webpack向け入口同士は共通chunkでRegistry/Session/Errorクラスの同一性を保つ。通常ESMとwebpack向け入口を同じ実行環境で混在させない。

ルート入口の再帰的import graphにReact/Blocklyを含めない。ブラウザ専用配布物なので、通常Node利用では既存のESM入口を使う。webpack 4対応は構文・依存解決の互換性であり、ES2018以前のブラウザのpolyfillを追加するものではない。ホストのpolyfill方針を引き継ぐ。

検証: 型検査・既存テストに加え、入口間のinstanceof・設定の非破壊性・ルートの依存境界をテストする。実GUIのwebpack 4.47ビルドと専用編集/実sb3往復E2Eで実際の結合を確認する。

Rollback: GUIの設定API呼出しと共通依存を対で以前の版へ戻す。既定OFFの起動フラグと保存形式は変えない。
