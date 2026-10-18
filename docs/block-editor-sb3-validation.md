## 2026-10-18 .sb3 保存・再読込の検証

- start: GUI が編集・出力した実ファイルを、新しい画面で再読込する。実装コードの変更はなし。
- done: サンプルの標準フォームで `{"label":"再読込テスト「春」 & \"scene\"","duration":7}` を保存し、ファイルメニュー「別ファイルで保存する...」から `block-editor-sb3-roundtrip.sb3` をダウンロード。
- done: ZIP 内の `project.json` を確認。通常の text shadow のインライン文字列として JSON が保存され、日本語・引用符・数値が完全一致。トップレベルと対象ブロックに専用の下書き・schema・revision 等の追加キーなし。
- done: `extensions: ["blockeditordemo"]` と `extensionURLs` のローカル拡張 URL が保持されることを確認。
- blocked（検証環境の制約）: 内蔵ブラウザの File System Access API の OS ファイル選択は操作できず、「コンピューターから読み込む」の picker 経路は未完了。アプリ実装のエラーではない。
- done: ダウンロードしたファイルを一切変更せず、開発サーバーの無視対象 `build/` に置いて TurboWarp 標準の `project_url` 経路で読み込む。拡張を事前登録していない新しい画面で、保存済み拡張 URL から拡張・編集 API・既存アイコンの入口が復元。
- done: 再読込したフォームに同じ日本語・引用符・duration=7 が表示される。duration=0 で Save が無効。Cancel 後は7を保持。有効値9を保存でき、Undoで7、Redoで9へ戻る。
- done: 別の新規画面で機能フラグ OFF のまま同じ sb3 を読み込み、同じ JSON を表示。編集用 `[data-block-editor-icon]` は0個。
- done: 手動検証のみのため、実装コード・依存関係の変更と全テストの再実行はなし。

検証ファイル: `/Users/hiroya/Downloads/block-editor-sb3-roundtrip.sb3`（2688 bytes）。
SHA-256: `594f98af96b8e11a8989050c26c2b94b0fdc97cc033626c20c36c0d3170f391a`。
読み込み URL: `http://localhost:8000/editor.html?blockEditorDialogs=1&project_url=http%3A%2F%2Flocalhost%3A8000%2Fblock-editor-sb3-roundtrip.sb3`。
サンプル拡張の URL は localhost:8000 のため、他のマシンでは対応する配信元が必要。

残り: OS picker による再読込、複数環境、全テーマ・翻訳、production 全体ビルド。
ロールバック: `blockEditorDialogs=1` を外して再読込する。通常引数の保存済み JSON は残る。
