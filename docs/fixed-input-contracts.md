# 固定入力の契約（S3-1）

この実装は固定入力の型・Schema検査・同期prepared境界を追加する。実Blockly/VMのfield transaction、固定フォーム、GUIフラグ、拡張側の登録は後続工程で実装する。既存SOURCE編集、`apiVersion: 1`、既存8 exportsとCSS buildは維持する。

## 有効化と互換性

`createBlockEditorService()`は既存SOURCE APIを返し、`registerFixedInputEditor`を公開しない。固定入力の契約を使うサービスは`createBlockEditorService({fixedInputs: true})`と明示する。旧host向けの`BlockEditorRegistrationAPI`上では新メソッドはoptionalのままである。GUIの起動時フラグとの接続はまだ行わない。

登録には`registerFixedInputEditor<C = null>(options)`、DOM不要の定義構築にはrootの`createFixedInputEditor<C = null>(options)`を使う。registryへ直接登録する場合は`registerFixed()`を使い、legacy `register()`やSOURCE専用`registerPrepared()`に渡さない。旧hostには`fixedInputs`を要求せず、新契約の定義だけを開けない状態にする。

`BlockEditorHost.fixedInputs`はoptionalで、対応ポートは`capability: 'fixed-inputs-v1'`、`readBlock(reference, declaration)`、`commit(request)`を持つ。サービスのopt-inだけでは対応hostにならない。descendantsへ固定入力を流す経路も、この工程では拒否する。

## 読取と保存

`FixedBlockSnapshot`は通常のraw引数と、契約ID/revision・generation・入力のfield/接続identity・読取専用集合・selector/dependentの宣言を持つ。rawの非有限値や負のzeroも専用captureで保持する。新しい書込み候補は有限の保存primitiveに限定し、既存rawと同じ制約で取り直さない。

`editableArguments`と`readOnlyArguments`は重複できない。固定metadataはこの宣言集合に対応させ、段階4などの非対象引数はrawのまま保持・比較する。読取専用引数の変更や接続identityの変化も競合となる。`captureFixedSnapshot`/`sameFixedSnapshot`を使い、旧snapshot captureによるmetadata消失を避ける。

各bindingはSchema bundleと同期の`read`、`encode`、`validateCandidate`を持つ。`read`は表示用のJSON投影を作り、投影できない既存rawではthrowしてreadonlyにする。rawの意味を推測して代替値へ変更しない。変更済み入力だけに対して、保存候補を一度`encode`し、その候補の再投影へSchema検査を行い、同じ候補をowner検査とcommitへ渡す。`validateCandidate(candidate, context, snapshot)`の第3引数から関連literalやreadonly値を純粋に確認できる。ownerの例外・診断本文をUIへそのまま表示しない。

selector/dependentの分岐判定はまだ実装しない。S3-1のfactoryとsessionは、宣言したdependency group内の変更を全件拒否する。groupが未変更なら独立入力だけを保存でき、非対応selectorの安全採取済みrawも保持できる。S3-3で明示したbranch検査を接続するまで、この拒否を緩めてselectorだけを部分保存しない。

draftは`inputs[argument]`ごとに`value`・`changed`と、必要に応じ数値`buffer`・明示修復`repair`を保持する。原文の正本はsnapshotに置く。数値bufferがある場合、投影値が同じでも字句を検査する。無効な`1e`を直前の投影値で保存しない。bufferは有限JSON number字句で投影値と一致する必要があり、codecは受け取った検証済みtokenをそのまま返す。取消・終了時以外のUIでのbuffer寿命、branchの保持/再表示はS3-3で接続する。

`parseFixedNumberInput`はrootと`./schema`から使える純粋な**新入力用**の関数である。有限JSON数値字句とtyped finite numberを扱い、`-0`・指数表記をtokenとして保持する。空文字・hex・`+1`・`.5`・非有限値・overflow・未完成bufferを拒否し、ownerの整数・sentinel・clamp・単位変換後の境界は追加しない。既存rawを開閉だけでこのparserへ通して書き換えない。`./schema`は引き続きReact/DOMを必要としない。

非投影rawの修復は、対応するliteral fieldに`repair: true`を明示して有効候補へ変更する場合だけに限る。reporter・未対応fieldを修復名目で置換しない。未変更入力や編集後に元の投影へ戻した入力は、原文のalias・空白等を保持する。

## 同期境界と後続の責務

owner設定型は既存`SchemaValidationContext<C>`のJSON設定制約に従い、既定は`C = null`。ポートの型消去にはJSON設定を保持する`FixedHostCommitRequest`を使う。同期callbackからのPromise/thenable、getter、独自iterator等を保存データとして実行せず拒否する。設定・候補・metadataは切り離して凍結し、登録解除後の保存も拒否する。

新しいfactory/固定入力登録のoptions・definition・bindingも通常の宣言objectのown data propertyから一度だけ採取する。accessorや独自iteratorを実行して宣言を得ることはせず、検査済みのcallback・opcode配列をそのまま登録する。旧legacy登録の宣言仕様は変更しない。

hostはcommitの実書込み直前にも全identity・読取依存・登録寿命を再確認し、readonly変更を全件拒否する責務を持つ。registry経由のsessionは、commit待機中に登録が解除されたらrequestの`signal`をabortする。hostは実書込み直前にもsignalを確認し、失効時には無変更で拒否する。購読はcommit完了/拒否時に解除する。全field適用・VMイベント・undo/dirtyを含むrollbackの実装はS3-2で行う。この工程のmock hostテストを実hostの原子性保証に代用しない。実GUI、23展開fixture、owner全境界・旧runtime比較、新artifact閉包も後続の受け入れ条件である。

切戻しはサービスのopt-inを外すことで新契約を公開しない状態に戻せる。旧host/旧登録の型・実行経路は維持する。今回のローカル差分は公開artifactでも依存pinでもなく、版を更新・公開しない。
