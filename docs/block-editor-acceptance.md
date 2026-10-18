# Issue #1 初版の受け入れ確認

2026-10-18（日本時間）。対象は[GUI #1](https://github.com/kubohiroya/scratch-gui/issues/1)と[共通基盤 #1](https://github.com/kubohiroya/turbowarp-block-editor/issues/1)。

GUI作業ブランチは`fix/editor/issue-1-acceptance`、基点は`feat/site/github-pages`の`be1183a907ddc6834f32f457a5b5ee54e91b4e48`。
共通APIはmainの`21c7cf54df2f2f8768219252a2bc6e5b5ad5434f`（PR #5）をビルドして使用した。通常CI・Pagesの固定参照もこのSHAにそろえた。
本記録時点では今回のGUI差分はローカルであり、公開・CI・マージ・Issueの最終完了更新は別の状態として扱う。共通基盤の追加コード変更はない。

## 修正と対象検証

- 対象切替・削除・登録変更で古いセッションを終了し、保存待ちの場合はsnapshot/host照合でcommitを拒否した後にビューを解放する。登録解除後の有効/invalidな遅延結果の両方を確認した。
- ホスト自身の同期transactionを外部変更と区別する。途中失敗と復元ではダイアログを閉じず、下書きとエラーを保持する。
- read-onlyのworkspaceから編集用role・tabindex・イベントを外す。既存アイコンのhover/focus表現を追加した。
- ReactModalとRJSFの描画後に最初の入力へフォーカスを移し、終了時のアイコンへの復帰を確認した。composition中のEnter/Escapeを外枠へ伝播させず、通常の複数行Enterは保存を起こさない。
- 本文とエラー一覧をスクロール可能にし、キャンセル/保存をその外に維持する。保存中は入力と通常終了を抑止し、日英の処理中表示を出す。

`npm run test:block-editor`: **23件成功**。追加6件はread-onlyの入口、target切替、登録解除中の遅い検証、transaction失敗後の下書き保持、描画後の入力フォーカス、IME/Enter/Escapeを対象とする。
実ScratchBlocks/VMの既存テストには複数引数のUndo/Redo各1回、setter/listener途中失敗後の値・VM・dirty・履歴の復元、reporter保護が含まれる。
変更した3ソースの限定ESLintと`git diff --check`も成功した。

開発webpackのコンパイルと、最終ソースの`NODE_ENV=production NODE_OPTIONS=--openssl-legacy-provider npx webpack --bail`が成功した。
その前の`NODE_ENV=production NODE_OPTIONS=--openssl-legacy-provider npm run build`も成功しているが、ビルド開始後に追加したtransactionの区別は最終webpackビルドで確認した。
検証中に隣接する共通APIの作業コピーへ別作業の未コミット変更が増えたため、その差分は保持し、固定コミットを`git archive`で`/tmp/issue1-pinned-api`へ取り出してビルドした。Nodeの一時loaderとwebpackの一時aliasでこの生成物だけを参照し、23限定テスト、全終了操作、通常操作、6表示条件、長い本文/エラー、非同期無効化、実行中保存、コンパイラ比較、プレイヤーとJSON/YAML再編集を再確認した。隔離した固定版のproductionビルドも成功した。これらの一時設定は製品設定へ追加していない。

共通API自体は本作業でコード未変更のため、[マージ後CI](https://github.com/kubohiroya/turbowarp-block-editor/actions/runs/39048712596)と既存45件の検証結果を利用し、公開操作のみを理由とする再実行は行っていない。

## 実ブラウザの確認

Chromium **155.0.8059.84**。最終確認は隔離した固定共通APIのローカルGUI `http://localhost:8002/editor.html?blockEditorDialogs=1`、初回確認とOFFはlocalhost:8001を使用した。
管理下の検証用拡張と、[テンプレートPR #22](https://github.com/kubohiroya/turbowarp-extension-template/pull/22)の生成済みJSを使用した。
検証拡張だけをunsandboxedとして読み込み、起動時固定フラグの既定値や製品の権限設定は変更していない。

| 条件 | 確認結果 |
| --- | --- |
| キャンセル / Escape / 閉じる / 背景クリック | 入力中と終了後の文字列・VM・dirty・Undo/Redoが不変。全経路で元アイコンへフォーカスが戻る |
| Enter / Space / Tab | アイコンから開き、最初の入力へ移動。Tabで保存へ到達。別インスタンスは別referenceを持ち、表示中の別要求は下書きを置換しない |
| 複数行・IME | textareaの通常Enterとcompositionstart/end・isComposing付きEnter/Escapeで誤保存・誤終了しない。IMEはイベント経路の検証でありOSの実キーボード操作ではない |
| 通常操作 | 未登録ブロックと登録済みブロックのアイコン以外で、クリック実行とドラッグを確認。編集アイコン自体は実行を起こさない |
| 除外 | パレット、read-only、登録解除後に編集入口なし。プレイヤー表示で見える編集入口0個、編集へ戻すと復元 |
| invalidと保存失敗 | 不正値では保存できない。実GUIへsetter失敗を注入し、editing状態・入力・エラー・ダイアログを保持、dirtyとUndoが不変であることを確認 |
| 非同期検証 | 保存中の入力・Escape・閉じる・背景クリックを拒否。登録解除、target切替、削除、競合、作品再読込後に遅い結果を適用しない。invalidの遅い結果も古いセッションを解放 |
| 入力・検証の外部副作用 | 標準フォームの編集・保存中の新規通信0件。実行中の下書きも元データへ漏れない |
| インタープリタで実行中 | 下書きは実行へ漏れず、dirty/Undoを増やさない。保存で実行中の値を更新し、Undo/Redo各1回で元値/確定値へ戻る。作品を自動停止しない |
| コンパイラ有効 | 通常の引数編集と専用フォームを比較。どちらも実行中のコンパイル済みスクリプトは旧値を保ち、次回実行で新値を使用。専用UIだけが異なるキャッシュ動作を持たない |
| 長いフォーム | 30項目、画面高720px/480pxで保存ボタン下端は630px/390px。Tabで保存へ到達。40件の全体エラーを追加してもフッターは画面内、invalidで保存不可 |
| フラグOFF | 別ページに実保存ファイルを読み込み、APIなし・編集入口0個・通常実行を確認。確定値は保持 |

### 表示条件

明色/英語と暗色/日本語それぞれで、ブロック倍率 **60% / 100% / 150%** を確認した。各条件でフォームを開閉でき、タイトル・保存ボタンが表示され、通常ブロックのクリック実行が成立した。
明色の本文背景/入力文字色は`rgb(255,255,255)` / `rgb(87,94,117)`、暗色は`rgb(17,17,17)` / `rgb(238,238,238)`。
代表条件の確認であり、全言語・全テーマ・全対応環境の組合せを検証した宣言ではない。

### JSON/YAMLと実保存ファイル

最新共通APIでテンプレートのJSON/YAMLを読み込み、タイトルをそれぞれ`最新APIでJSON再編集` / `最新APIでYAML再編集`へ変更、保存・再オープンで確認した。
`vm.saveProjectSb3()`のBlobを実際にダウンロードし、新しいGUIページへ同じバイト列を`vm.loadProject()`で渡して、両フォームに同じ値が表示されることを確認した。

- 検証ファイル: `issue1-template-latest.sb3`（ローカルのgit無視対象に保存）、2804 bytes。
- SHA-256: `726196436e5ad12c4fee284a4b316f3167e36a9ba0e9015c12d9d4b697a2b135`。
- ZIP内`project.json`のトップレベルは`targets` / `monitors` / `extensions` / `extensionURLs` / `meta`。JSON/YAMLの値は通常のtext shadowで、UI・下書き・セッションの専用キーは追加されていない。
- 拡張URLは`http://localhost:8766/dist/example-extension.js`。検証ファイルを別マシンで使う際は対応する配信元が必要。

従来の[JSON保存・project_url再読込](block-editor-sb3-validation.md)と[テンプレートの詳細なJSON/YAML検証](https://github.com/kubohiroya/turbowarp-extension-template/blob/1df3c0a05ed3764cc1b3a2a5aa2a2e988463a09c/docs/block-editors-validation.ja.md)も維持する。
OSのネイティブファイル選択や全対応環境は今回のローカル受け入れと区別する。

## DoDとの対応

| Issue | 条件 | 根拠 |
| --- | --- | --- |
| 共通 #1 | 異なるUIとインスタンス識別 | 共通の登録/参照/下書き分離テスト、実GUIの複数インスタンス |
| 共通 #1 | 未登録・解除後の互換 | 登録テスト、実GUIの解除と通常操作 |
| 共通 #1 | 入力と全終了操作の不変性 | 全4終了経路で値・dirty・履歴・フォーカスを確認 |
| 共通 #1 | invalid・失敗時の保持 | RJSF/セッション/ホストテスト、実GUIのsetter失敗 |
| 共通 #1 | 対象変更時の誤更新防止 | host境界テストと実GUIの非同期ケース |
| 共通 #1 | 複数引数保存と復元 | 実ScratchBlocks/VMの既存transactionテスト |
| 共通 #1 | reporter保護 | 共通・GUIホストテスト |
| 共通 #1 | .sb3に確定値だけ保持 | 上記のJSON/YAML実ファイルと再読込 |
| 共通 #1 | フォーカス・キー・二重保存・dispose | unitと実GUIの入力・終了・遅延検証 |
| GUI #1 | OFF互換、ONのインスタンス編集 | 実GUI別ページ・複数インスタンス |
| GUI #1 | アイコンと通常操作の分離 | pointer/keyテスト、実GUIのドラッグ・実行 |
| GUI #1 | 除外表示モード・登録解除 | パレット/read-only/プレイヤー/解除の実確認 |
| GUI #1 | 入力中とCancelの不変性 | 全終了経路のsnapshot比較 |
| GUI #1 | invalid/失敗時の保持と復元 | modal/host/bridgeのテストと実GUI失敗注入 |
| GUI #1 | Undo/RedoとVM | 複数引数のhostテスト、実GUIの実行中保存 |
| GUI #1 | reporterと対象変更の保護 | host境界と非同期の実GUI |
| GUI #1 | .sb3と従来環境 | JSON/YAML実ファイル、OFFでの読み込みと実行 |
| GUI #1 | キー・フォーカス・解除・資源解放 | Unit、全終了経路、インスタンス、遅延結果 |
| GUI #1 | 代表倍率・テーマ・翻訳・通常操作 | 上記6条件と通常操作 |

初版のローカル受け入れは両Issueの上記条件を確認済み。公開・CI・マージ後にその状態を確認してIssueを最終更新する。
共通API→GUIの固定依存→GUIの対象検証・公開確認→両Issue完了、の依存順を維持する。階層編集は両リポジトリのIssue #2の範囲。

## 運用ログとロールバック

- start: 両Issueの残条件とマージ済みPR #5の寿命管理修正を照合し、GUIの通常CI/Pages固定参照を更新。
- blocked（解消済み）: read-onlyの入口とtarget切替・登録解除中の終了を補完。対象テストを追加。
- blocked（解消済み）: portal内のRJSF描画タイミング、IMEのEscape、長い本文/エラー時のフッター、保存中表示を補完。限定lintのハンドラ規約も修正。
- blocked（解消済み）: host自身のtransactionによるイベントを外部変更と区別し、適用失敗後の下書き保持を追加回帰テストで確認。
- done: 23限定テスト、変更ソースlint、開発/productionビルド、上記の実GUIと実.sb3確認。既定OFFと単一フラグを維持。
- done: 隣接する別作業の共通API差分と混在しないよう、固定コミットの隔離生成物で対象テスト・ブラウザ受け入れ・productionビルドを再確認。隣接の変更とnode_modulesのリンクは変更していない。

ロールバックはURLの`blockEditorDialogs=1`を外して再読込する。確定値は通常のJSON/YAML引数として残る。
検証手順とupstream更新時の確認点は[接続ガイド](block-editor.md)を参照。
