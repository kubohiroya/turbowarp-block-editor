# TurboWarp アダプターAPI

`@kubohiroya/turbowarp-extension-data-editor/turbowarp` はScratchBlocks / VMの専用接続入口です。
共通ルートのセッションAPI、`/rjsf` の登録/フォーム、`/react` の表示から分離しています。
GUIの内部モジュール、Redux、翻訳、テーマ、URLフラグをimportしません。
ScratchBlocksやVMを独自にインストールせず、ホストが使用中の実体を渡します。

```js
import {attachTurboWarpBlockEditors} from '@kubohiroya/turbowarp-extension-data-editor/turbowarp';

const attachment = attachTurboWarpBlockEditors({
  enabled: startupFlags.blockEditorDialogs,
  descendants: startupFlags.blockEditorDescendants,
  ScratchBlocks,
  workspace,
  vm,
  service, // The registry and subscription from createBlockEditorService().
  label: translatedEditLabel,
  canOpen: () => isVisible() && !hasAnotherModal(),
  onOpen: (session, nodeLabels, nodeAppearances) => openEditorModal(session, nodeLabels, nodeAppearances),
  onError: error => reportError(error)
});

// Release before disposing the workspace or replacing this GUI instance.
attachment.dispose();
```

`enabled` は省略時OFFです。厳密にtrueのときだけイベント購読・既存FieldImageの装飾を開始します。
`descendants` も省略時OFFです。フラグはホストで起動時に読み取り、変更には再起動/再読込を要求します。
`refresh()` で装飾を明示更新できます。通常はworkspace/VM/登録変更を購読して自動更新します。
`dispose()` は冪等で、購読、保留タイマー、tooltip/属性/カーソルの装飾を解除し、アクティブセッションを無効化します。
破棄後のrefreshは何もしません。別workspaceのattachmentはそのまま使用できます。
単一セッションの非同期処理が未完了の場合、commitを防いでから処理終了時に解放する従来の契約を維持します。

## 共通側が所有する実装

- BlocklyとVMの一致確認、世代/identityを含む競合判定、通常text shadowだけのread/commit。
- 同期イベント経路によるVM更新とUndo/Redo各1回。途中失敗ではデータ・履歴・dirty通知を復元。
- statement inputと内部next chainの完全探索。reporterやrootの外側nextは含めず、循環/上限超過を拒否。
- 既存アイコンのpointer/keyboard操作、ドラッグ判定、読み取り専用/他Modal時の制御、属性とtooltipの復帰。
- 階層ごとの外観取得、起動できない場合の診断セッション、target/project/登録変更時の無効化。

GUIには、起動時フラグ、VMごとの登録サービス保持、API公開、既存Modal/Redux/翻訳/テーマの接続を残します。
ホスト関数だけを必要とする独自接続には `createTurboWarpBlockEditorHost()` を公開します。
`bindBlockEditorIcon`, `readBlockEditorAppearance`, `openBlockEditorSession`,
`createBlockEditorErrorSession` は低水準の接続用です。通常のGUIはattachment APIを使用します。

## 型・互換性と検証

公開入口とその入出力はTypeScriptで宣言します。vendor instanceの内部型はopaqueなobjectとして渡します。
移管元で検証済みの6ファイルはJavaScriptのまま保持し、allowJsで配布JSと型宣言を生成します。
内部JSはcheckJsの対象にしていません。公開境界の型検査に加え、GUIの実ScratchBlocks/VM/ReactModalの
既存テストで競合・rollback・Undo/Redo・入力保護・装飾と解除を確認します。
実体の互換性はこの結合テストを通した組み合わせを前提とし、任意のBlocklyバージョンへの互換性は保証しません。

webpack 4はpackage exportsに対応しないため、`/turbowarp` を `dist/turbowarp.js` へaliasします。
追加のVM/Blockly依存、npm lockfileの変更、GUIへの転送モジュールは不要です。
互換配布物によるalias縮小とE2E本体の配置変更は後続です。

## ロールバック

即時停止はblockEditorDialogsをOFFにして再読込します。
GUI側の呼出しと共通側の追加を対で戻すと、以前のGUI内host/bridgeへ復帰できます。
API v1とJSON/YAML/text shadow形式は変わらず、保存済みsb3の変換は不要です。
