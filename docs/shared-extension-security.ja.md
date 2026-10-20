# 公開Editorの機能拡張セキュリティ

公開サイトと直接開く `editor.html` は、GUI標準の一括確認を使います。起動URLのスイッチと、URLを書き換える起動スクリプトは撤去しました。`project_url`・言語・hashを追加の有効化指定なしで利用できます。

共通ライブラリはプロジェクト中の拡張をまとめて確認し、すべての選択が確定するまで拡張コードを実行しません。公開rc.34のようなバンドルでは、先頭のName・ID・Description・By・License・Unsandboxedを保持して一覧に表示します。キャンセル確認の「いいえ」は選択を保持し、「はい」は読み込みを中止してEditorの初期画面へ戻ります。保存済みの選択も次回のOKを省略しません。

回帰確認はURL生成テストと`extension-security.spec.cjs`で行います。日英の公開入口から`project_url`を使って実際のSB3読み込みを起動し、許可前の未実行、一覧メタデータ、低い画面のOK、明示承認、再読込、キャンセルを確認します。公開後は無改変のrc.34でも確認し、build-infoと配布SB3のSHA-256・実画面をIssueへ記録します。

切り戻しはGUIの変更と `site/source.json` を既知の組み合わせへ戻して再配信します。承認を自動化せず、保存済みSB3を変更しません。

追跡: https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/58
