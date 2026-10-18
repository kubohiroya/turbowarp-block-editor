# 段階2の公開Git配布

管理: https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/31

`feat/schema/stage2-source-forms` → `main`。Sourceを正本とする固定Schema編集とprepared-source-v1保存を追加する。GUIは起動時固定の`blockEditorSourceForms`既定OFFと`blockEditorDialogs`を必要とする。既存API、8公開入口、CSS、rawの無変更保存を維持する。

先行ローカル検証は共通212ケース、全体の関連659ケースと実GUI5代表×8手順。再実行を加算していない。共通ローカルartifact SHA-256は`f3f66138902e4fb869540029460f800492ae0a23d29aacdd90eaf6d2b0766672`、sourceSha256は`aef366417f026ececbcb718f8001f3b5dddc5e34a2fdb3bc69d5390ce2e9118e`。このartifactは未commit基準d910ed0…であり公開Gitから再生成するartifactとは区別する。

公開順序: 共通 → Scene Graph / Camera Source → consumerとGUI。公開Git SHAは各consumer manifest・lock・実解決・build-infoへ揃える。npm公開を必要としない。

受け入れ基準: ./schemaのpure型、prepared公開型、旧型の互換、単一/子孫session、同じ候補の検査/commit、複数引数atomic、登録失効を維持する。GUIの数値入力・enum/ref/anchor表示とraw保持を確認する。無効なYAML alias/tagやコメントを消す置換はFormで拒否しSourceへ明示的に戻す。

ロールバック: sourceForms OFFで再読込。必要ならconsumer→producer→共通の逆依存順でrevertし、manifest・lock・実解決を一体で戻す。rawの自動移行は行わない。merge・npm公開・Pages手動再公開は本工程に含めない。

公開Git artifactの検証結果とCI URLはPR本文および集約記録へ追記する。履歴のローカル検証は置換しない。
