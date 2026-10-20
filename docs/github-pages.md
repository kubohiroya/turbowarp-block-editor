# GitHub Pages 公開

公開と運用の正本は共通リポジトリです。[運用Issue #26](https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/26) を使用します。
GUIフォークにはエディターAPIへの接続を置き、サイト・公開用ビルド・Pages・公開E2E起動は共通側が所有します。

## 公開物と固定ソース

- 入口: https://kubohiroya.github.io/turbowarp-extension-data-editor/
- 日本語 `/ja/`、英語 `/en/`、拡張版 `editor.html?blockEditorDialogs=1&blockEditorSourceForms=1&blockEditorCommonLayout=1`、通常版 `editor.html`。
- `site/source.json` にGUIのrepository/完全SHAと、GUI lockfileで取得するnpm配布物のcore完全SHAを固定します。
- `build-info.json` の `revision` はGUI SHA、`coreRevision` は実配布物のcore SHA、`siteRevision` はサイト生成・公開を所有する共通SHAです。3つを混同しません。
- 移行は公開配置だけを変更し、既存npm製品版の差替えや未公開Schema機能の導入は行いません。新しい製品版へ切替えるときはGUI lockfileとcore pinを合わせます。

日英の実HTML、言語の手動選択とnavigator.languages、Octocatリンク、本家TurboWarp/Scratchへのクレジットと独自拡張の説明を維持します。
Pagesは静的配信のため、サーバーのAccept-Language交渉は使いません。`blockEditorDialogs`・`blockEditorSourceForms`・`blockEditorCommonLayout`は起動時固定・既定OFFです。拡張版リンクだけ3フラグを指定し、通常版リンクは指定しません。
GUIのGPL LICENSEを取得したGUIソースから同梱し、GUIとcoreの公開ソースへの完全SHAリンクを残します。

## ビルド

共通ルートで実行します。GUI checkoutは `site/source.json` の完全SHAへ合わせ、依存と上流生成資材を準備します。

```sh
pnpm install --frozen-lockfile
cd /absolute/path/scratch-gui
npm ci --no-audit --no-fund
node scripts/prepublish.mjs
cd /absolute/path/turbowarp-extension-data-editor
E2E_GUI_ROOT=/absolute/path/scratch-gui node scripts/site/build.mjs
```

公開用設定は `scripts/site/webpack.config.cjs` がGUIのブラウザ用設定を選択します。
`build/` はGUI checkoutの作業領域に生成しますが、GUIへコミットしません。
案内HTML・言語選択・CSS・公開metadata・favicon選択は共通側の処理です。

## 公開と検証

共通mainへのpushとmainからの `workflow_dispatch` だけが公開対象です。
GitHub PagesのsourceはActions、github-pages環境はmain branchだけを許可します。

```sh
gh workflow run pages.yml --repo kubohiroya/turbowarp-extension-data-editor --ref main
```

build前とdeploy直前に共通mainの鮮度、固定GUI SHAのdevelop push CI全体の最新attempt成功を確認します。
GUI CIは公開APIで読み取り、他repoへのtokenやwriteは不要です。実行中・失敗・確認不能なら公開を止めます。
GUI CIの確認は短い上限で失敗するため、未完了だった場合は成功後に新しい公開runを起動します。
さらに共通側の同一site SHAの通常CI全体成功を既存ゲートで待ち、最新attemptの失敗・実行中で古い成功を採用しません。
buildとCIゲートの両方が成功したときだけdeployへ進み、鮮度を再確認します。
公開jobだけがPages:write/id-token:writeを持ちます。最新attemptテストや公開E2Eへ渡しません。

公開前と公開後に既存E2E6件を実行します。GUI/core/siteの期待SHAはソースのpinから決め、配信された値を自己採用しません。
専用エディター起動・validation・保存・cancel・実sb3の書出し/再読込・明暗テーマを検証します。
必要時の手動公開版E2Eは共通 `site-public.yml` が起動します。定期起動は設定しません。
OSネイティブファイル選択は対話可能なmacOSで行う既存手順を維持し、Linux CI成功で代替しません。

## 移行とロールバック

新サイトの公開と公開版E2Eが成功してから、GUI側のサイト資材・公開workflowを撤去します。
旧 `https://kubohiroya.github.io/scratch-gui/` の既存配信は移行中に維持し、公開workflow撤去後は凍結した旧版として扱います。
旧URLから新URLへの自動redirectを実現したとは扱いません。旧URLの廃止・redirect公開は別の明示判断で行います。

新サイト不具合は共通mainのGUI/core pinを前の検証済み値へ戻し、通常CIとゲート経由で再公開します。
失敗時にゲートを解除しません。公開を止める場合は共通pages workflowを無効化します。
GUIのコードと既定OFFの機能フラグ、sb3保存形式には公開配置による変更を加えません。

GUIのgit固定security-dialog依存はprepareでdist/webpack4.cssを生成するため、GUI CIと同じ通常npm ciを使います。coreのbuild-info revision、GUI pin、成功CIの照合を維持し、配布物が未生成の状態で公開しません。
