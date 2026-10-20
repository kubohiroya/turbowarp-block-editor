# 共通フォームレイアウト（Issue #49）

タブ・ラベル付きグループ・グリッドをJSONの表示定義として宣言する。標準RJSFフォーム（`src/rjsf.ts`）と原文保持型Source/FormのReact Tree（`src/source-view.tsx`）で、`src/layout.ts` の検査と `src/layout-view.tsx` の描画を共有する。Schemaや保存データに表示用の階層を足さない。

## 起動時フラグ

ホストがサービス生成時に `createBlockEditorService({commonLayout: true})` を渡す。既定は **OFF**。`src/config/feature-flags.ts` が値をコピーして固定し、extensionの登録情報ではONにできない。既存 `fixedInputs` フラグの既定値は変更しない。

サービスを使わない場合も、ホストが `createSchemaEditor(options, {commonLayout: true})`、`createSchemaBundleEditor(options, {commonLayout: true})`、`createSourceEditor(options, {commonLayout: true})` と明示する。フラグOFFまたは表示定義なしでは従来の順序とコントロールを使う。

## 宣言形式 v1

`SchemaEditorOptions.uiSchema`、`SchemaBundleEditorOptions.uiSchema`、`SourceVariant.uiSchema` の対象objectに次を置く。配列要素は従来どおり `uiSchema.items`、入れ子objectはそのプロパティ名の下に宣言する。`ui:options.extensionDataLayout` は本パッケージ独自のオプションであり、RJSF標準オプションではない。型は `/rjsf` から `EditorLayout`・`EditorLayoutItem` としてexportする。

```js
const uiSchema = {
  'ui:options': {
    extensionDataLayout: {
      version: 1,
      items: [{tabs: [
        {label: '基本', items: [
          {group: '識別', items: [{field: 'name'}]}
        ]},
        {label: '画像', items: [
          {grid: 2, items: [{field: 'width'}, {field: 'height'}]}
        ]}
      ]}]
    }
  }
};
```

`field` は **当該objectの直下のリテラルなキー**。`a.b`、`a/b`、`a~b` はそれぞれ1つのキーで、パスには展開しない。入れ子の項目はそのobjectのuiSchemaで指定する。未分類の既知項目と追加プロパティはレイアウトの後に表示する。任意項目がまだ存在しないSource/Formでは、その値を自動作成せず、既存の追加コントロールから追加できる。

`items` の順が表示順・キーボードのTab移動順となる。グリッドは行優先で指定列数に配置し、600px以下で1列へ戻す。groupやgridやtabsは入れ子にできる。制限は深さ8・合計256ノード・tabsあたり16パネル・grid 1〜4列・ラベル128文字。未知バージョン・未知オプション・重複または不明なfield・上限制約違反は、対象object全体で適用を中止し、診断を表示して従来描画に戻す。Schemaに定義された任意項目への参照は、値が未作成でも有効。

定義はJSONのみ。関数、React要素、任意コンポーネントの評価は行わない。Schemaの制約、既定値、coercion、未知キーの保存方針は変更しない。現行RJSF v5自体の対応範囲も変わらない。特にRJSFの内部処理が落とすprototype名のプロパティは、このレイアウトでも新たに対応しない。Source/FormのTreeではそのようなリテラルキーも扱える。

完全なサンプルは [`examples/common-layout.mjs`](../examples/common-layout.mjs)。

## 入力・検証・アクセシビリティ

- タブの全パネルはマウントを維持し、非表示パネルだけ `hidden` にする。1つのdraftと保存トランザクションを共有し、パネルごとの別フォームや別保存を作らない。
- タブ移動では原文の再生成、format/variant変更、既定値挿入を行わない。Source/Formの既存の原文パッチ、未確定数値、Sourceでの修復、Discard form editsを維持する。
- 非表示パネルのエラーもタブの件数に反映する。保存検証に失敗した場合、エラーのある最初のパネルを開き、入力へフォーカスする。常時の検証更新だけでは選択中のタブを変えない。ルート単位の診断は既存ホストのエラー表示に残る。
- `tablist`・`tab`・`tabpanel`、`aria-selected`・`aria-controls`・`aria-labelledby`、エディター間で一意のIDを設定する。左右キー・Home・Endで選択とフォーカスを移動する。IME中のキーとEscapeは横取りしない。保存中はタブ操作も無効にする。
- RJSFの既存の項目番号、追加プロパティのキー編集、項目メニュー、追加・削除、エラー表示は既存テンプレートを使う。

## RJSF公式ガイドと実装の対応

使用中のRJSFは5.24.13、Reactは16.14。公式v5ガイドの以下に従い、フォーム全体を置き換えず **ObjectFieldTemplateに渡されたproperties.contentを配置し直す**。元のテンプレートにタイトル・description・追加操作を任せ、共通側がグループとタブを描画する。

- [v5 ObjectFieldTemplate](https://rjsf-team.github.io/react-jsonschema-form/docs/version-5.24.10/advanced-customization/custom-templates/#objectfieldtemplate)
- [v5 uiSchema](https://rjsf-team.github.io/react-jsonschema-form/docs/version-5.24.10/api-reference/uiSchema/)
- [v5 Custom Widgets and Fields](https://rjsf-team.github.io/react-jsonschema-form/docs/version-5.24.10/advanced-customization/custom-widgets-fields/)
- [v5 Objects](https://rjsf-team.github.io/react-jsonschema-form/docs/version-5.24.10/json-schema/objects/)

v6のLayoutGridField/LayoutHeaderFieldは採用しない。Source/Formは再帰Schema・prefixItems・原文保持のため独立Treeのままとし、生成済みの子コントロールだけ共通配置コンポーネントへ渡す。

## Camera Source #52との依存

専用 `turbowarp-camera-source-block-editor` は作らない。Camera SourceはSchema bundle・uiSchema・純粋なowner検証callbackを渡し、ホストの共通data-editorがSchema compile、一般JSON/YAML codec、描画を所有する。Camera Source本体の編集用依存除去は別作業であり、#49の追加だけで自動的には起こらない。Camera Source #52の実装と組み合わせて利用する。既存API v1へ未知のui:optionsを渡せるため旧ホストは従来表示を継続し、共通機能を利用するホストのみ#49を含む配布物へ更新してフラグを有効にする。

## 受け入れ基準・検証

- [x] 既定OFF、起動時固定、定義なしと不正定義で従来描画。
- [x] RJSF通常／BundleとSource/Formで同じJSON契約、未分類項目を保持。
- [x] 隠れたパネルの入力とエラーを保持し、保存時に表示・フォーカス。
- [x] 原文no-op、コメント、未知キー、未確定数値、Cancelと1回の保存を検証。
- [x] React 16とwebpack4配布ビルドを維持。

最小の再実行コマンド（ビルド済みdistに対して）:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --test test/layout.test.mjs test/schema-editor.test.mjs test/schema-bundle-editor.test.mjs test/source-view.test.mjs test/source-prepared.test.mjs test/react-dialog.test.mjs test/webpack4.test.mjs
node test/e2e/layout/browser.mjs
```

ブラウザ検証はローカルHTTPとPlaywright Chromiumを使用し、実装された両経路の画面を `test-results/layout/desktop.png`・`mobile.png` に保存する。モックアップではない。ただし、この検証用ページは実TurboWarp GUI・実カメラ・packaged作品のE2Eを代替しない。

Playwright既定のブラウザがない環境では、`LAYOUT_CHROMIUM_EXECUTABLE` に検証対象のChromium実行ファイルを指定できる。

## ロールバック

ホストの `commonLayout` をfalseにしてサービスを再生成・アプリを再読込する。canonical Schemaと保存形式は変更していないため、保存済みJSON/YAMLの移行は不要。uiSchemaの宣言は旧ホストに残しても無視される。未保存draftを維持したままのホット切替は提供しないため、既存モーダルは保存またはCancelしてから再読込する。

## ローカル運用記録

- start: `feat/editor/common-form-layout` で #49 を実装。Camera Source #52は独立branchで並行実装し、layout契約確定後に接続検証。
- done: 共通契約・両描画経路・テスト・公式参照・ロールバックを追加。公開操作とGitHub Issueの更新は別途承認対象。
- 2026-10-20 検証: 対象107テスト中105成功、環境指定を要する既存の型・GUI能力検査2件はskip。プロジェクト型検査、webpack4ビルド、公開layout型consumer、Chromium/React 16での両描画経路・非表示エラー・数値入力保持・キー操作・幅390pxで1列・一括保存・フラグOFFを確認。Camera Source #52とのローカル接続4ケース（Source: twcs/legacy/ROS、RJSF: twcs）も成功。
