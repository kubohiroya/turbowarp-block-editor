# 段階2の公開Git配布

管理: https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/31

`feat/schema/stage2-source-forms` → `main`。Sourceを正本とする固定Schema編集とprepared-source-v1保存を追加する。GUIは起動時固定の`blockEditorSourceForms`既定OFFと`blockEditorDialogs`を必要とする。既存API、8公開入口、CSS、rawの無変更保存を維持する。

先行ローカル検証は共通212ケース、全体の関連659ケースと実GUI5代表×8手順。再実行を加算していない。共通ローカルartifact SHA-256は`f3f66138902e4fb869540029460f800492ae0a23d29aacdd90eaf6d2b0766672`、sourceSha256は`aef366417f026ececbcb718f8001f3b5dddc5e34a2fdb3bc69d5390ce2e9118e`。このartifactは未commit基準d910ed0…であり公開Gitから再生成するartifactとは区別する。

公開順序: 共通 → Scene Graph / Camera Source → consumerとGUI。公開Git SHAは各consumer manifest・lock・実解決・build-infoへ揃える。npm公開を必要としない。

受け入れ基準: ./schemaのpure型、prepared公開型、旧型の互換、単一/子孫session、同じ候補の検査/commit、複数引数atomic、登録失効を維持する。GUIの数値入力・enum/ref/anchor表示とraw保持を確認する。無効なYAML alias/tagやコメントを消す置換はFormで拒否しSourceへ明示的に戻す。

ロールバック: sourceForms OFFで再読込。必要ならconsumer→producer→共通の逆依存順でrevertし、manifest・lock・実解決を一体で戻す。rawの自動移行は行わない。merge・npm公開・Pages手動再公開は本工程に含めない。

公開Git artifactの検証結果とCI URLはPR本文および集約記録へ追記する。履歴のローカル検証は置換しない。

## 0.2.0のリリース追補

2026-10-18、日本時間。ユーザーは段階2全体のcommit・push・PR・merge・npm公開を承認した。新規API追加に合わせ共通を0.2.0へminor更新する。文書レビューのdecode説明訂正を含む。先行0.1.0 Git/file artifactと過去659件の記録は採取時点の履歴として保持する。

安定版build段階ではfresh frozen install、全commonテスト、CI/site/infrastructure、typecheck、8公開入口・CSS・packを検証する。最終merge SHAからpackした同一tarballをnpmへ公開し、registry integrityとbuild-infoを照合する。producer/consumerは最終共通Git SHAへpin・lock・allowBuilds・実解決を揃える。GUIの起動時固定・既定OFFを維持する。

公開後の問題には、フラグOFFと逆依存順のrevertで対応する。公開済み版を削除せず、修正は新しいversionで公開する。

## 公開直前の依存audit追補

共通0.2.0はまだnpm未公開の時点で、direct fast-uri3.1.0に8high/1moderateのadvisoryを確認した。対象packageはfast-uriだけである。間接AJVで既に使っている3.1.8へ直接依存も固定し、lockの全fast-uri edgeを3.1.8へ統一する。Schemaの正本・owner・既存API・保存形式は変更しない。

0.2.0の公開前修正として別PRでmainへ統合し、後続pinには修正後の最終SHAを使う。旧4818a4dの検証は履歴として保持し、最終配布の証拠と区別する。fresh install後にaudit、Schema/ref/診断/Source/Form/8入口を含む全common検証、packを確認する。一次資料: https://github.com/advisories/GHSA-qw65-cvwx-89v3 および保存した9件のaudit JSON。
