# 固定入力の契約とnative host（S3-1/S3-2）

この実装は固定入力の型・Schema検査・同期prepared境界と、明示的に有効化する標準field transactionを追加する。固定フォーム、GUIフラグ、拡張側の登録は後続工程で実装する。既存SOURCE編集、`apiVersion: 1`、既存8 exportsとCSS buildは維持する。

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

hostはcommitの実書込み直前にも全identity・読取依存・登録寿命を再確認し、readonly変更を全件拒否する責務を持つ。registry経由のsessionは、commit待機中に登録が解除されたらrequestの`signal`をabortする。hostは実書込み直前にもsignalを確認し、失効時には無変更で拒否する。購読はcommit完了/拒否時に解除する。S3-2の標準field hostは全field適用・同期VMイベント・undo/redo・dirty・event groupをまとめてcommit/rollbackする。mockに加えて、固定した実ScratchBlocksとVM adapterのfixtureで保存と途中例外を確認する。headless native fixtureの結果を、まだ未接続の製品GUIやnative pickerのE2Eに代用しない。実GUI、23展開fixture、owner全境界・旧runtime比較、新artifact閉包も後続の受け入れ条件である。

切戻しはサービスのopt-inを外すことで新契約を公開しない状態に戻せる。旧host/旧登録の型・実行経路は維持する。今回のローカル差分は公開artifactでも依存pinでもなく、版を更新・公開しない。


## S3-2の標準field host

`/turbowarp`の`createTurboWarpBlockEditorHost({...options, enableFixedInputs: true})`でだけ`fixedInputs` portを作る。省略・falseでは旧TEXT hostを維持する。`attachTurboWarpBlockEditors`からの有効化・GUI起動時フラグはS3-3の範囲であり、サービスのopt-inとは別である。

hostはregistryの`resolveFixed(opcode)`が返すcallbackを含まないimmutable宣言を正本とする。同じ内容で再登録しても宣言identityは変わり、以前のsnapshotで保存できない。呼出し側のdeclarationによるreadonly集合の省略・偽造は認めない。旧`resolve()`のdescriptorは変えない。

標準allowlistは`text.TEXT`の`FieldTextInput`、`math_number.NUM`の`FieldNumber`、拡張namespace配下の静的menu shadowと親の直接`FieldDropdown`、`colour_picker.COLOUR`の`FieldColourSlider`である。実保存primitiveがstringで、VMとfield値が厳密に一致する場合だけ書込み候補にする。custom subclass・独自validator/field method・動的menu callback・reporterは実行せず書込み対象外とする。BOOLEAN socketを作ったりreporterをliteralへ置換したりしない。

新候補はfieldごとに純粋に全件検査してから適用する。数値は有限JSON数値token、menuは保存valueの既存静的候補、色は受理する色字句に制限し、field setterの結果と候補が厳密に一致しなければrollbackする。ownerの範囲・sentinel・単位・clampはここへ追加しない。既存未知menu値、数値の空白/alias、色の表記等は変更しない限りrawを保持する。

commit直前にproject/target、親・shadow・field・VM、読取依存、登録寿命、signalを再確認する。readonlyへのpatchや不正候補を一つ含む要求も全件拒否する。同期適用中のsetter・VM adapter・listener例外や中断では、この保存が変更したfield/VMと自己イベントのundo/redoを復旧し、この保存に由来するdirtyを増やさない。再入した外部操作の値・履歴・dirty通知と、外部のtarget/project切替後の履歴は保持し、古い状態へ巻き戻さない。成功時だけこの保存の一つのundo groupとdirty通知を作り、no-opではどちらも作らない。色fieldはrawだけでなくHSVとblockの表示色も復旧する。

固定入力のChangeは同期配送中に`recordUndo: false`でVMとlistenerへ渡し、全検査成功後に同じeventを`recordUndo: true`としてundo履歴へ追加する。redoのclearも成功時まで保留する。これにより失敗・project切替時に旧履歴を復元するための書戻しを避け、外部操作が持つ現在の履歴を保持する。旧SOURCEのevent配送は変更しない。保存対象と同じfieldへの外部Changeが再入した場合は外部値を残し、最初の外部eventのundo起点をこの保存開始前のrawに対応させる。未commit値をundoで復活させない。外部の色変更ではそのrawと表示状態も保持する。

branch groupの書込みとfixed descendants併用は、S3-3以降の対応が完了するまで拒否を維持する。独立したliteralは安定した読取文脈のもとで保存できる。23展開fixture・owner境界・依存pinの更新・C3配布完了をこの工程の成果として扱わない。
