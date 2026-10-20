# 公開Editorの機能拡張セキュリティ

公開サイトの日英の「拡張版」「通常版」入口は、起動URLに`extensionSecurityBatch=1`を付け、`@kubohiroya/turbowarp-extension-security-dialog`の一覧を表示します。GUI全体のフラグ既定値はOFF、読み取りは起動時に一度だけです。拡張版に付けるブロック編集用フラグとは独立しています。

公開された`editor.html`を直接開く場合も、サイトの起動スクリプトがGUI bundleより先に動きます。指定がないときだけURLへ`extensionSecurityBatch=1`を設定し、既存のproject_url・言語・hash・history stateを保持します。明示した`extensionSecurityBatch=0`は変更しません。

共通ライブラリはプロジェクト中の拡張をまとめて確認し、すべての選択が確定するまで拡張コードを実行しません。公開rc.34のようなバンドルでは、先頭のName・ID・Description・By・License・Unsandboxedを保持して一覧に表示します。キャンセル確認の「いいえ」は選択を保持し、「はい」は読み込みを中止してEditorの初期画面へ戻ります。保存済みの選択も次回のOKを省略しません。

回帰確認はURL生成テストと`extension-security.spec.cjs`で行います。日英の公開入口から`project_url`を使って実際のSB3読み込みを起動し、許可前の未実行、一覧メタデータ、低い画面のOK、明示承認、再読込、キャンセルを確認します。公開後は無改変のrc.34でも確認し、build-infoと配布SB3のSHA-256・実画面をIssueへ記録します。

切り戻しはURLに`extensionSecurityBatch=0`を指定して再読込するか、公開入口と起動設定の追加をrevertしてCI後に再配信します。ライブラリ・GUIの固定を戻す場合は`package.json`とlock、`site/source.json`を既知の組み合わせへ戻します。承認を自動化せず、保存済みSB3を変更しません。

追跡: https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/58
