# 専用エディターとsb3の継続E2E

関連: [Issue #12](https://github.com/kubohiroya/scratch-gui/issues/12)。Playwright Testで同梱サンプルの読込、ブロック配置、アイコン起動、入力検証、保存、キャンセル、実際の `.sb3` の書出しと再読込を操作する。アプリやセキュリティ確認を差し替えず、内部VM APIでデータを投入しない。

## セットアップ

本体・開発依存・CI手順はturbowarp-extension-data-editorが所有する。Node.js 22以上とpnpm 11.18.0を使い、GUIと共通リポジトリを隣に配置する。以下は共通リポジトリで実行する。GUIにPlaywrightを追加しない。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install --with-deps chromium
cd ../scratch-gui
npm ci --ignore-scripts --no-audit --no-fund
node scripts/prepublish.mjs
ROOT=/scratch-gui/ npm run build:pages
cd ../turbowarp-extension-data-editor
E2E_GUI_ROOT=/absolute/path/scratch-gui pnpm test:e2e:block-editor
```

`E2E_GUI_ROOT` はローカルbuildを配信するGUI checkoutの絶対パス。未指定・無効なパスは起動失敗にする。外部URLの検証には不要。レポートは呼出し元のcwdによらず共通リポジトリ配下へ保存する（公開版選択/配信待機CLIは共通ルートで実行）。

対象ソース・固定依存と一致するビルドがあれば、E2Eだけを再実行できる。テスト専用HTTPサーバーは `127.0.0.1:8732/scratch-gui/` で起動し、終了時に停止する。別ポートは `E2E_PORT=8733` で指定する。他のサーバーは流用しない。

```sh
E2E_GUI_ROOT=/absolute/path/scratch-gui pnpm test:e2e:block-editor --project=chromium-file-input
E2E_GUI_ROOT=/absolute/path/scratch-gui pnpm test:e2e:block-editor --project=chromium-project-url
pnpm test:e2e:infrastructure
```

## 検証経路

| 構成 | 再読込経路 | 合格が示す範囲 |
| --- | --- | --- |
| `chromium-file-input` | 標準メニュー → file input/filechooser | Android user agentでアプリが選ぶ既存fallback。実Android端末やOS pickerの検証ではない。 |
| `chromium-project-url` | 標準 `project_url` | ダウンロードした同じsb3バイト列をdata URLで新しいコンテキストへ渡す。 |
| `chrome-macos-native` | 標準メニュー → File System Access API → macOS「開く」 | テスト専用のローカルGoogle ChromeとOSダイアログを操作する。実ファイルを選択し、復元されたフォームまで検証する。 |

通常実行は2シナリオ×2構成の4件。opt-in起動、duration=0/61・label空欄の保存抑止、下書きの分離、日本語・引用符・`&`を含む値の保存、再起動、キャンセルを確認する。標準ファイルメニューからダウンロードしたsb3のZIP/CRC、`project.json`、text shadowの値、編集セッション情報の非混入を検査する。その同じファイルを新しいコンテキストへ読み込み、通常の拡張確認を経て値・アイコン・フォームを復元し、再検証とキャンセルを確認する。別シナリオで起動フラグの既定OFFを検証する。

すべての構成で普段のChromeプロファイルを使用せず、Playwrightが作るテスト用コンテキストを使う。`showOpenFilePicker`の差し替えや無効化は行わない。

## macOSネイティブ経路

GUIログイン中のmacOS、ローカルGoogle Chrome、Xcode Command Line Tools（Swift）を必要とする。実行元のターミナルまたはCodexに、macOS設定でアクセシビリティ権限とSystem Eventsへのオートメーション権限を許可しておく。権限・フォーカスがない場合は環境エラーとして失敗し、別経路へ迂回しない。

```sh
E2E_GUI_ROOT=/absolute/path/scratch-gui pnpm test:e2e:native
```

このコマンドはheaded Chromeで2シナリオを実行する。CDPでテスト用ブラウザのPIDを取得し、SwiftのAccessibility APIがそのPIDのOS「開く」ダイアログを操作する。各キーボード操作の前に最前面のPIDを照合する。同名Chromeの検索、ユーザーのプロファイル、クリップボード、デスクトップ全体のスクリーンショットは使用しない。ネイティブ操作中は他のアプリへ切り替えない。

`native-picker-operation.log` はダイアログの状態遷移のみを記録する。ファイル選択だけでは成功とせず、拡張確認・フォーム復元まで完了したときだけ `execution.json` の `nativeOSPicker` を `passed` にする。

Linux CIには対話可能なmacOSデスクトップがないため、ネイティブ経路は実行対象外（`not-run`）。運用先はGUIログイン済みのローカルmacOS端末とし、**週1回（月曜の公開版チェック後）およびファイル読込・保存関連の変更をマージする前**にこのコマンドを手動起動する。公開版を使う場合は次節のURL・期待SHAも指定する。未実行の週は未実行として扱い、他の経路の成功で代替しない。実行日・OS/Chrome版・結果と証跡の保管先をレビュー時に確認する。self-hosted runnerの登録やOSの無人操作スケジュールは作成しない。

## 公開版の確認

外部URLの実行にはGUI/coreの完全SHAを必須とする。`build-info.json`から期待値をそのまま自己採用せず、配信元コミットとPages workflowの固定coreを使う。

```sh
E2E_BASE_URL=https://kubohiroya.github.io/scratch-gui/ \
E2E_EXPECT_GUI_REVISION=<GUIの40桁SHA> \
E2E_EXPECT_CORE_REVISION=<coreの40桁SHA> \
pnpm test:e2e:block-editor
```

開始前と終了後にキャッシュを避けて `build-info.json` を確認する。期待値との不一致や途中の配信切替は失敗にし、異なる版の結果を混在させない。再試行は0回。UIの表示・値・ダウンロード完了を待ち、固定sleepを成功条件にしない。

## GitHub Actions

GUIの通常CI/Pagesは共通checkoutの `.github/actions/gui-checks` を呼び出す。インストール・ビルド・対象テスト・スコープ選択・ブラウザ・証跡保存はこのactionが所有する。公開版確認の実装は共通 `.github/workflows/turbowarp-public.yml`、GUI側はトリガーと固定SHAを持つ薄い呼出しだけにする。

公開前の依存: 共通変更を先にcommit/pushし、その完全SHAへGUIの2つのcheckout ref、公開workflowのusesとrunner_revisionを全て更新する。旧版90d53b6には新action/workflowが存在しないため、GUIだけを旧固定値のまま公開しない。ローカル結果とActions実行結果は区別し、最新の公開・CI状況は関連Issueへ記録する。


- `CI`（`node.js.yml`）は変更パスを確認し、アプリ・依存・同梱サンプル・E2E・関連単体テスト・ビルド/CI設定の変更時に限定E2Eを実行する。新規ブランチや比較元が不明な場合は実行する。既存のアプリビルドを `ROOT=/scratch-gui/` で作り、`prepare-build.cjs` がPages用情報を追加する。E2E用の再コンパイルはしない。
- Pages workflowはdevelopへのpush、またはdevelopからの手動起動で公開する。他branch/tagはbuildガードでskipし、旧workflowからの公開もgithub-pages環境のdevelop限定ルールで拒否する。[公開手順と切戻し](github-pages.md)を参照。公開用branchへの同期は不要。
- Pages workflowはbuild・deploy成功後に `verify-public` を実行する。期待GUI SHAはイベントの `github.sha` と同じ配信コミット、core SHAはそのコミットのPages workflowから取得する。配信先への反映を最大90秒待ってから、同じ限定E2Eを実行する。checkoutだけをdevelopの別SHAへ固定しない。
- 通常CIとPagesは独立している。Pages自身のbuild前テストと実sb3 E2Eを維持するが、通常CI全体の成功待ちは追加していない。通常CIの検証結果を確認してからdevelopへマージする。
- `Verify published block editor`（`block-editor-public.yml`）は `workflow_dispatch` と毎週月曜02:17 UTC（11:17 JST）の定期実行にも対応する。手動でGUI SHAを省略した場合と定期実行では、GitHubの現在成功中のPages deploymentを期待値にする。定期実行はdefault branch上のworkflowが対象。アプリの再ビルドはしない。
- 公開チェックは同時実行1件・実行中キャンセルなし、ジョブの上限15分。通常CIの上限は30分。配信途中の切替は版不一致として報告し、自動再実行で隠さない。
- 必要なGitHub権限は `contents: read` / 公開チェックの `deployments: read` と、既存deploy jobのPages公開権限のみ。Issueへの自動投稿は行わない。
- summaryに結果・最後の検証段階・GUI/core SHA・経路・OS picker実行有無を出力する。HTML/JSONレポート、実sb3、失敗画面・trace、console/page/networkログ、配信待機ログを成功・失敗ともartifactへ保存し、7日間保持する。

ワークフローをリポジトリへ公開する前の段階では、ローカル検証や構文検査の成功をGitHub Actions上の実行成功として扱わない。公開後に対象PRのCI、Pages配信後ジョブ、手動チェックの実行URLをIssue #12へ記録する。

## 証跡と失敗の調査

- `playwright-report/block-editor/`: HTMLレポート。`pnpm exec playwright show-report playwright-report/block-editor`。
- `test-results/block-editor/results.json` / `summary.json`: テスト結果と経路別の最終段階。`execution.json` 添付にGUI/core SHA・ブラウザ/OS・OS picker実行有無を記録する。
- `test-results/block-editor-deployment/`: 期待する配信版の選択と、配信待機中の状態。Playwrightによる出力ディレクトリ初期化から分離する。
- roundtripテスト: 実際の `roundtrip.sb3`、サイズ/SHA-256/保存値、復元画面。失敗時のtraceは `pnpm exec playwright show-trace <trace.zip>`。
- `browser-errors.json`: console error・未捕捉例外・失敗リクエスト・HTTPエラー。未捕捉例外はテストを失敗させる。既存依存VMのconsole error（`Unexpected input recieved in replaceUnsafeChars`）は記録し、ログが空であることは合格条件にしない。

失敗段階、版不一致、ブラウザ起動・OS権限などの環境要因を区別して調べる。UI assertionの失敗だけで製品不具合と断定しない。再実行は原因を確認した後に手動で行い、元の失敗記録も保持する。生成物はGit管理対象外で、テスト用データのみを使う。

## 2026-10-18の検証結果

| 対象 | 結果 |
| --- | --- |
| Pages形式のローカルビルドとCI用metadata準備 | 成功。既存アプリのplayer HTMLを保持し、GUI/core SHAを照合。 |
| ローカルE2E | 4件成功、18.4秒。skip・flaky・再試行なし。 |
| 公開版E2E | 4件成功、19.8秒。`a10eb09e768a9d4dcd12162d5b42ccc842d7e70e` / core `ec338023ca8123b1db50787601ca8c78ab06917d` の開始・終了一致を確認。 |
| macOSネイティブの実sb3保存・再読込 | 1件成功、33.1秒。Google Chrome 155.0.8059.84 / Darwin 27.2.0。OS「開く」で実ファイルを選択し、拡張確認・保存値・フォーム復元・再validation・キャンセルまで成功。 |
| 期待GUI SHAの負の対照 | 期待値を40桁の0へ変え、UI起動前の `deployment-start` で想定どおり失敗。実SHA・失敗段階・環境分類を記録。 |
| 保存データの負の対照 | sb3比較時の期待durationのみ9→10へ一時変更し、`sb3-data-check` で実値9との差を検出して想定どおり失敗。変更は復元し、その後に上記ローカル/公開版を再確認。 |
| 補助テストと静的検査 | 補助テスト4件、限定ESLint、Swiftコンパイル、Actions actionlint、差分の空白検査が成功。 |

ネイティブ経路は開発中にダイアログの検出・入力で失敗した試行があり、PIDに直接結び付けた参照と、日本語パスを保持するネイティブ入力欄の操作へ修正した。成功は修正後の実ファイル復元の結果であり、filechooserやproject_urlの成功を代替として数えていない。OS操作ログは状態遷移だけを記録し、他のウィンドウのタイトルや画面を含めない。

この時点では変更はローカルのみ。PR時CI・deploy後ジョブ・GitHub上の手動/定期起動の実行は公開後に確認し、そのURLをIssue #12へ追記する。ローカルの成功をActions上の実行成功や全DoD完了として扱わない。

## ロールバック

追加したE2Eステップ・`verify-public` 呼出し・公開チェックの定期/手動workflowを無効化するか、このテスト/CI差分をrevertする。アプリ実装・保存形式への変更はない。専用エディターは起動時固定の `blockEditorDialogs=1` によるopt-in、既定OFFを維持する。

## 共通側への移管後のローカル検証（2026-10-18）

- 共通: 型検査・ビルド、74テスト（既存71 + 配布物境界3）、E2E基盤5件成功。
- GUI: 結合55件・Pages3件、個別RJSF/YAML変換を除去したwebpack 4.47のPagesビルド成功。
- 共通側runner: 新ローカル配布物のE2E4件18.9秒、既存公開版E2E4件19.6秒。再試行0。メインspecは移管元とバイト単位で同一。
- ローカルはGUI `67cf2d0a439ae14122784c03469c28db19839c42` / 共通 `90d53b68b6f7def6246e74ada9aa3a6652901b10` **に今回の未コミット変更を加えたもの**を検証した。build-infoのSHAはbaseであり未コミット差分を識別しないため、差分のmanifestと結果を `/private/tmp/tw-distribution-evidence/` に保存した。
- 公開版はGUI `50c9e4786bb0fc2a2b1ae2169c9823c876f30651` / 共通 `90d53b68b6f7def6246e74ada9aa3a6652901b10` を検証した。新しい互換配布物の公開確認を意味しない。
- Actionsの実行、commit/push、固定SHAの更新、Pages公開、macOSネイティブ選択は今回未実行。公開前の依存と手順は上記のとおり。Issue #12はDoingを維持する。
