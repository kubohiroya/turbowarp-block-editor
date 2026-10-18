# ドキュメント一覧

独自拡張の日本語文書はturbowarp-block-editorで管理します。scratch-guiには本家由来の資料を残し、専用エディターの文書を重複配置しません。

## 利用・GUI接続・公開

- [GUIの起動・専用編集・制約](block-editor.md)
- [子孫ブロックの一括編集](block-editor-descendants.md)
- [GitHub Pagesの日英サイト公開](github-pages.md)
- [専用エディターと.sb3の継続E2E・CI](block-editor-e2e.md)

GUI用ガイドの `src/`・`scripts/`・`site/`・`test/`・`.github/` はscratch-guiのパスです。GUI用のnpmコマンドはscratch-gui、共通API用のpnpmコマンドはturbowarp-block-editorのルートで実行します。両リポジトリは隣接配置します。

## 共通APIとアダプター

- [APIとホスト契約](api.md)
- [階層セッションの契約](descendants.md)
- [TurboWarpアダプターAPI](turbowarp-adapter.md)
- [webpack 4互換配布物と設定API](webpack4.md)

## 検証記録

- [初版の受け入れ確認](block-editor-acceptance.md)
- [.sb3保存・再読込の初期検証](block-editor-sb3-validation.md)

過去の記録にあるSHA・テスト件数・未確認項目は、その検証時点の結果です。最新の実装・CI・公開状況は[共通 #7](https://github.com/kubohiroya/turbowarp-block-editor/issues/7)、[GUI #15](https://github.com/kubohiroya/scratch-gui/issues/15)、[E2E #12](https://github.com/kubohiroya/scratch-gui/issues/12)で管理します。
