# 段階1 レビュー4件の修正・再検証

> この文書とschema-stage1-verification.json / schema-stage1-dependencies.jsonはcommit前に採取したレビュー済みsnapshot。未コミット状態や旧pinの記述は採取時点の履歴である。公開する修正版とowner依存更新は[schema-stage1-git-artifact-20261018.ja.md](schema-stage1-git-artifact-20261018.ja.md)に従う。

2026-10-18。既存Issueは共通#18/#20、Camera Calibration #38、3D Scene Runtime #1、Extension Template #29。既存ブランチのHEADは保持し、その上のローカル差分としてR1〜R4を修正した。原因調査・段階2以降・PR・merge・npm公開は行わず、今回commit/pushやIssueの編集も行っていない。

## 修正と受け入れ条件

| 指摘 | 修正 | 回帰・再レビュー条件 |
|---|---|---|
| R1 既存legacy互換性 | schema識別子をROS風の追加キーより優先 | image_width、camera_matrix等の追加キーでも既存parserと同じ受理、legacyのvariant・原文・raw dataを保持。通常ROS/twcs/camerasourceの既存ケースも成功 |
| R2 安全な診断 | runtime/templateのdecode失敗時にown data descriptorでconsumerIdを取得 | malformed JSON/YAML＋getter/null/undefined contextで例外なし、getter実行0、生例外文面なし、source保持。非空入力のcontext guardを維持。空sceneだけはcontext不要なno-op |
| R3 診断identity | 校正のtwcs/ROSはresource/provenanceを再利用しidentityを包み直す | 4 variantともcalibration-profile、compile/structure/semanticのscopeとconsumerIdが一致。producerのidentity/resource/provenanceは不変 |
| R4 公開型 | SchemaBundleEditorOptionsの既定をnullへ修正 | 型引数省略の変数、inline推論、明示settings型、サービス登録が成功。不正設定・関数等の負例を維持。pack済み宣言でも省略・inline・明示型を確認 |

修正前に新しい回帰を実行し、ownerで4つのruntimeテスト失敗と、既定型のnull→neverエラーを確認した。修正後は共通65、Calibration 12、Runtime 13、Template 16の関連計106テストが成功した。ownerの新規テストは5件で、既存の共通120・owner302の増分記録は保持する。今回それら全件を再実行したとは扱わない。

変更した4 repoで既存build、3 ownerで型検査と変更ファイルのlint、共通でpure/互換型fixtureを実行した。pureと隔離consumerはskipLibCheck:false。RJSFを含む互換型とpack済みUI optionsの型検査だけは、従来どおり依存宣言の既知制約によりskipLibCheck:true。これを依存宣言すべての厳格検査とは扱わない。

9 packageのsrc/Reactなしimport・禁止globalアクセス0・strict no-DOM型検査、共通52＋owner83＝135 emitの再生成SHA-256一致、共通CSS一致、webpack4 20出力の一覧とdist 75ファイルを確認した。16論理契約に加えて、校正4 variantの実package診断、legacyの衝突キー、scene/templateの不正contextを横断scriptへ追加した。TypeBox/Specの正本・生成JSON、UI分類、既定OFFフラグ、既存runtime API/保存データの変更はない。

## 依存artifactと未公開差分

ownerが使う共通pureは引き続きa1ab4f4、scene producerは7b8d67d、Camera Source producerは9a9a5c9の固定artifact。manifest/lockと実解決の版・hash、consumer内producer bundle fingerprint、共通pure 12ファイルのbyte一致を更新確認した。間接ARの0.3.0/plan JS・型も確認し、checkout 0.4.0を代用していない。

R4は./rjsfの公開型だけを変更し、pure 12ファイルは変わらない。ownerの純粋検証に不要なUI型変更のために依存pinを付け替えていない。固定a1ab4f4のRJSF型には今回の修正がなく、修正版のcommon worktreeから作ったローカルpackageとは区別する。段階2で新UI型を使う前に、修正版を含む正式なcommit/packageとmanifest・lock・実解決を揃える必要がある。存在しないGit revisionやローカルfile:/tmp依存をmanifestへ書かない。

build-infoのGit revisionは基準HEAD e389e707のままで、未コミット修正を含む証拠にはしない。現在のsource/emit/test/script hashとlocal snapshot識別子をschema-stage1-verification.jsonに記録する。正確なローカルtarballの取得先・SHA-256はcoordinator側のstage-1-review-fixes-20261018.jsonに記録し、記録自身を同梱するpackageとの循環hashを避ける。

## 再レビューと履歴

R1〜R4について元の反例が拒否/例外/型エラーを再発せず、上記の回帰・既存API・pure依存境界を満たすことを確認した。新しい未解決指摘はない。登録・binding・候補UI等の工程境界は従来計画のまま。

従来の検証文書20ファイルとHEAD一覧はcoordinatorのdocs/block-editor-inventory/implementation-history/stage-1-before-review-fixes-20261018/へ保存し、baseline.jsonに各SHA-256を記録した。修正前レビューと旧S1-0/S1-1の基準・採取ログも保持する。

ロールバックは新pure/bundle入口の利用停止、または今回の4 repoの修正差分を基準HEADへ戻すことで行う。保存sourceを移行していないため逆変換は不要。GUIの緊急切戻しは従来のblockEditorDialogsをOFFにして再読込する。
