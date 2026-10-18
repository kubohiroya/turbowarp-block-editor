# 段階1 修正版のGit artifact固定

2026-10-18。共通Issue #18/#20の段階1修正をfeat/schema/stage1-commonでcommit・pushし、この修正版を含む40桁commitへ8 ownerのmanifest・lock・実解決を揃える。PR・merge・npm公開や段階2以降の実装は対象外。

このartifactはR4のSchemaBundleEditorOptions既定nullと、再レビュー済みの共通API・診断・106関連テスト・135 emitの検証補助を含む。共通のpure実装は旧a1ab4f4とbyte一致し、RJSF宣言の修正も含めて配布する。既存API・公開入口・CSS・既定OFFフラグは維持する。

依存更新は共通 → scene-graph / Camera Sourceおよび独立owner → 3D Scene Runtime / Camera Calibration / Motionの順。consumerが参照するproducerも新commonへ依存するcommitへ固定し、同じ版番号だけで同一artifactと判断しない。配置の既存Camera Source 0.7.0など無関係なruntime依存は変更しない。

公開前のレビュー済みsnapshotはschema-stage1-verification.json、schema-stage1-dependencies.json、schema-stage1-review-fixes-20261018.ja.mdへ履歴として保持する。これらの未コミット状態・旧pin・古いHEADは採取時点の値であり、本commitが未公開であることや現在の依存先を意味しない。

ownerごとに実解決のmanifest/版/commit、build-info、pure 12ファイル、RJSF宣言、producer bundle、間接AR 0.3.0/plan、package境界、変更生成物のhashを確認して公開記録を付ける。レビュー後のソースと検証前提が維持される106テストをHEAD更新だけで繰り返さず、依存更新後の型・関連owner回帰・16契約・135 emitを必要範囲で検証する。依存は標準frozen installでも確認する。

このpackage自身のcommit SHAを文書へ埋め込む循環は避け、Git archiveのsource-revision stampとdist/build-infoのrevisionを取得先commitに照合する。coordinatorのstage-1-publication-20261018.json / .ja.mdに全9ブランチの最終SHA、remote照合、artifact hashと結果を保存する。

参照GUIはまだ公開0.1.0を使う。後続UI接続前には、必要な修正版を含むartifactをGUIにも選び、manifest・lock・実解決を揃え、capability・raw形式保持・保存直前の再検証を確認する。owner依存更新だけでこの開始条件まで満たしたとは扱わない。

ロールバックは旧pin/lockと対応commitへ戻すか、新bundle入口の利用を止める。GUIは従来のblockEditorDialogsをOFFにして再読込できる。保存sourceを移行しないため逆変換は不要。
