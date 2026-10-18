# 固定Schemaのpure検証API

`@kubohiroya/turbowarp-extension-data-editor/schema`はDOM・React・RJSFをimportせず、同梱resourceだけで同期検証する。既存の登録API・GUIフラグ・保存データは変更しない。

`compileSchemaBundle(bundle)`は`compiled`、`schema-error`、`execution-error`を区別する。成功した`validator.validate(data, {consumerId})`は`valid`、`invalid`、`execution-error`を返す。入力診断は`toValidationIssues()`で従来の表示用型へ変換できる。

bundleは`identity`・`dialect`・`root`・`resources`・`provenance`を持つ。方言は`draft-07`または`2020-12`を必ず指定する。各resourceの`retrievalUri`はfragmentなしの絶対URI。HTTP形式でもネットワークへアクセスせず、URNも使える。`$id`・相対/絶対ref・再帰refをローカルで解決し、実効IDが異なる場所と衝突するbundleは拒否する。bundleごとのAjv instanceで同じIDの異版を隔離する。

artifactの`canonical-schema`は`canonicalSources`、`generated-schema`は`generatedFiles`と`generatedFrom`へ対応させる。参照用Schemaと生成処理はcompile入力にしない。正本・生成物・参照用・生成処理の同一repository/path/symbolを重複分類しない。metadataにあるファイル・URLを探索して読み込む機能はない。

Schemaと入力を専用snapshotへコピーして検証する。coercion・default補完・追加property削除を行わず、frozen入力も扱う。privateなSchema snapshot内でURI/方言の同義識別子を正規化するが、所有側のSchema・rawデータ・正本や生成物を書き換えない。JSONの有限数・文字列・真偽値・null・密な配列・plain objectを受け付ける。循環、class instance、accessor、非JSON値を拒否し、getter・toJSON・入力iteratorを実行しない。

snapshotは最大100,000訪問値・深さ128に制限し、超過は`limit-exceeded`の実行診断とする。制限のためにデータを切り捨てて成功扱いにはしない。Schemaの非同期検証は受け付けない。標準formatは直接依存のajv-formatsにあるものを使い、未知formatを黙って無視しない。

診断は固定codeとscope、必要なresource URI・JSON Pointer・keywordを持つ。required/additionalPropertiesは問題の子項目へPointerを付け、URI fragmentをschemaPathへ分解する。raw値・Ajvのparams・例外本文をコピーしない。未知ref・Schema不正とengine実行失敗を混同しない。

同期owner合成とRJSFの追加経路はS1-3、owner形式adapterと配布はS1-4で追加する。現時点のcompile APIを既存フォームへ自動接続しない。新入口の利用を外すことで従来の経路へ戻せる。

実装根拠: [Ajvの方言](https://ajv.js.org/json-schema.html)、[Schema登録と隔離](https://ajv.js.org/guide/managing-schemas.html)。
