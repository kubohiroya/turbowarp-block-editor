# 固定Schemaのpure検証API

`@kubohiroya/turbowarp-extension-data-editor/schema`はDOM・React・RJSFをimportせず、同梱resourceだけで同期検証する。既存の登録API・GUIフラグ・保存データは変更しない。

`compileSchemaBundle(bundle)`は`compiled`、`schema-error`、`execution-error`を区別する。成功した`validator.validate(data, {consumerId})`は`valid`、`invalid`、`execution-error`を返す。入力診断は`toValidationIssues()`で従来の表示用型へ変換できる。

bundleは`identity`・`dialect`・`root`・`resources`・`provenance`を持つ。方言は`draft-07`または`2020-12`を必ず指定する。各resourceの`retrievalUri`はfragmentなしの絶対URI。HTTP形式でもネットワークへアクセスせず、URNも使える。`$id`・相対/絶対ref・再帰refをローカルで解決し、実効IDが異なる場所と衝突するbundleは拒否する。bundleごとのAjv instanceで同じIDの異版を隔離する。

artifactの`canonical-schema`は`canonicalSources`、`generated-schema`は`generatedFiles`と`generatedFrom`へ対応させる。参照用Schemaと生成処理はcompile入力にしない。正本・生成物・参照用・生成処理の同一repository/path/symbolを重複分類しない。metadataにあるファイル・URLを探索して読み込む機能はない。

Schemaと入力を専用snapshotへコピーして検証する。coercion・default補完・追加property削除を行わず、frozen入力も扱う。privateなSchema snapshot内でURI/方言の同義識別子を正規化するが、所有側のSchema・rawデータ・正本や生成物を書き換えない。JSONの有限数・文字列・真偽値・null・密な配列・plain objectを受け付ける。循環、class instance、accessor、非JSON値を拒否し、getter・toJSON・入力iteratorを実行しない。

snapshotは最大100,000訪問値・深さ128に制限し、超過は`limit-exceeded`の実行診断とする。制限のためにデータを切り捨てて成功扱いにはしない。Schemaの非同期検証は受け付けない。標準formatは直接依存のajv-formatsにあるものを使い、未知formatを黙って無視しない。

診断は固定codeとscope、必要なresource URI・JSON Pointer・keywordを持つ。required/additionalPropertiesは問題の子項目へPointerを付け、URI fragmentをschemaPathへ分解する。raw値・Ajvのparams・例外本文をコピーしない。未知ref・Schema不正とengine実行失敗を混同しない。

同期owner合成とRJSFの明示経路はS1-3で追加済み。owner形式adapterと配布はS1-4で追加し、16契約をS1-5で横断確認した。既存フォームへ自動接続しない。新入口の利用を外すことで従来の経路へ戻せる。

実装根拠: [Ajvの方言](https://ajv.js.org/json-schema.html)、[Schema登録と隔離](https://ajv.js.org/guide/managing-schemas.html)。

## S1-3: 同期owner検証と明示フォーム

`validateSchemaInput(compiled, data, {context, ownerValidate?})` はcontextを先に検査し、構造検証に成功したときだけ同期ownerを1回呼ぶ。`context`にはconsumerId、有限のnowMs、JSON互換settingsが必要。候補とcontextの保護snapshotを渡し、入力を正規化値へ置換しない。Promise/thenableはasync-owner-unsupported、例外はowner-validation-failed、不正な結果はowner-result-invalid。不正contextはowner-context-invalid。拒否Promiseも処理して未処理rejectionを残さない。

`/rjsf`の`createSchemaBundleEditor`と`registerSchemaBundle`は、従来optionsのschemaの代わりにschemaBundle、呼出しごとの`validationContext: () => context`、任意のownerValidateを受ける。構造・同期owner検証はlive/save/未mount保存で共通。legacy validateDataはこの検証が成功した後、保存時だけ実行する。新経路のreadはdefaultを補わず、既存createSchemaEditorのdefault初期化は維持する。

`SchemaBundleEditorOptions`の型引数を省略した場合は`null`設定を使う。`SchemaValidationContext` / `SyncOwnerValidator`と同じ既定であり、options変数にも`settings: null`を指定できる。設定を使う場合は明示型またはfactoryの推論を使う。public型の検査は省略・inline・明示型と不正設定の負例を含む。

RJSF v5用には正本を変えないprivateな表示Schemaを作る。閉じたresource graphのID/anchor/refを解決し、wrapper内のfragment pointerへ展開する。private表示側で不要になったID宣言を除くが、正本・検証制約は変更しない。検証の正本は常に元bundleのengineで、RJSFへextraErrorsを渡す。JSON Pointerの特殊キーを保持し、共通field-errorsのARIA表示・訂正・解除へ接続する。

2020-12 prefixItems、dynamic/recursive ref、RJSFが展開を終了できないobject再帰は、フォーム登録時に明示的に拒否する。配列items経由の再帰と両方言の同梱refは合成フォームで確認する。これらの表示制限はheadless engineの受理範囲を狭めない。owner16契約の実フォームは段階2で個別に検証する。

この工程は拡張へのeditor登録、GUI依存更新、binding、候補UIを追加しない。新APIを呼ばない既存利用者の挙動は維持する。

## S1-4pの配布

段階1中はnpmへ未公開のAPIを既存の0.1.0公開版と取り違えないよう、ownerの追加pure型依存を検証済みGit commitへ固定する。Git依存のprepareで既存buildを実行し、dist/JS/型/CSS/webpack4/build-infoを生成する。ローカルfile:/tmp依存は公開manifestへ残さない。npm publishや既存GUI依存の変更はこの作業に含めない。

既存hostがBlockEditorRegistrationAPI/BlockEditorServiceを実装する場合、新しいregisterSchemaBundleは任意のcapabilityとして追加する。既存の3 memberだけを持つobjectも代入できる。createBlockEditorServiceの戻り値ではSchemaBundleBlockEditorRegistrationAPIとしてこのcapabilityを保証し、外部hostでは存在を確認して利用する。ownerのGit依存はpureファイルだけでなく./rjsfの修正版宣言も照合する。固定するcommitと実解決の対応は公開時の検証記録に残す。

ownerのvalidate*Sourceは元source/未正規化データと診断を分けて返す。形式不正・未知variantで生のparser例外を診断へ混ぜない。Camera系は既存readerと同じtrim/BOM・ROSのtrim後サイズ条件を維持するが、返すsourceは原文を保持する。lib-editor/schemasのemit copyは配布用生成物であり、bundleのartifact.roleは元のSchema正本/TypeBox・Spec生成物の由来を表す。

旧SchemaEditorOptions.schema経路は既存format/error/defaultの互換性とprovenance不在を考慮し、従来のRJSF validatorを継続する。明示bundleだけをpure engineへ接続し、それぞれlive/save/未mountで同じ判定を使う。webpack4 helperには新しい/schemaの事前build入口も追加し、既存4入口とCSS aliasを保つ。
