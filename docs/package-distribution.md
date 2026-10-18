# パッケージ配布と改名

対象: [改名・初回公開 #10](https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/10)、[GUI移行 #19](https://github.com/kubohiroya/scratch-gui/issues/19)。

## 名前と互換性

リポジトリは `kubohiroya/turbowarp-extension-data-editor`、npm名は `@kubohiroya/turbowarp-extension-data-editor`。初回実験版は `0.1.0`。
旧 `turbowarp-block-editor` からの改名であり、ブロック定義ではなく拡張が扱う構造化データの編集を提供する。

公開入口はroot、`/rjsf`、`/react`、`/react/styles.css`、`/turbowarp`、`/webpack4`、`/build-info`。
既存の型・関数・`Scratch.gui.blockEditors`・起動時固定で既定OFFの機能フラグは維持する。
importと依存のキーだけを新npm名へ移し、GUIの`file:`依存を公開versionの完全固定へ変更する。

## ソースの追跡

`pnpm build`はGit HEADの完全SHA、package名、version、repositoryを `dist/build-info.json` に記録する。
Node.jsでは `require('@kubohiroya/turbowarp-extension-data-editor/build-info')` で取得できる。
GUIのPagesビルドとE2E準備はこのSHAを使い、node_modules内にGit checkoutを要求しない。
CIは公開配布物のSHAと、検証手順を所有する共通checkoutの固定SHAを比較する。

公開前は変更をcommitして作業ツリーが空であることを確認する。`npm pack`のprepackはビルドを実行するため、必ず公開対象のcommit上でpackする。

## 初回公開の検証

- `pnpm typecheck`、`pnpm test`、`pnpm test:e2e:infrastructure`。
- `npm pack`で内容を確認し、tarballをGit checkout外のconsumerへinstallする。
- 全公開入口、webpack 4 helper、CSS、source metadataを確認する。
- 同じtarballを `npm publish <tarball> --access public` で公開する。
- GUIの依存とlockを公開版に揃え、関連単体テスト・Pagesテスト・アプリビルドと限定E2Eを確認する。

安定版の全対応環境検証を完了したという意味ではない。別セッションの未コミットSchema作業は初回公開に含めない。

## 切り戻し

ソース・GUI依存は対応コミットをrevertする。公開済みnpm版は削除せず、必要なら修正版を別versionで公開する。
旧リポジトリURLのredirectを保つため、旧名の新リポジトリを作らない。保存データ形式と既定OFFのフラグは変更しない。
