export default {
    ja: {
        title: 'TurboWarp Extension Data Editor — ブロックに専用の編集画面を',
        description: 'kubohiroyaによるTurboWarpの独自拡張版。JSON Schemaから専用フォームを生成し、ブロックのデータを検証・編集できます。',
        skip: '本文へ', source: 'GitHubでソースコードを見る', badge: '実験版',
        eyebrow: 'TURBOWARP + CUSTOM BLOCK EDITORS',
        heading: 'ブロックに、<br>専用の編集画面を。',
        intro: 'TurboWarpの使い心地に、もうひとつの編集方法を。拡張ブロックのアイコンからフォームを開き、まとまったJSONデータをわかりやすく編集できます。',
        open: '拡張エディターを開く ↗', try: 'サンプルの使い方', plain: '通常版を開く',
        note: 'ブラウザで利用できます。ファイルは従来どおり .sb3 で保存します。',
        mockTitle: 'ブロックを編集', mockLabel: 'シーンの名前', mockValue: 'オープニング', mockDuration: '表示時間（秒）', cancel: 'キャンセル', save: '保存', caption: '専用フォームのイメージ — 実際の画面はエディターで確認できます',
        featuresHeading: '今回追加したこと',
        features: [
            ['アイコンから専用フォームへ', '配置した拡張ブロックのアイコンをクリック。ブロックのデータを、モーダルでまとめて編集できます。'],
            ['JSON Schemaが画面になる', 'JSON Schemaと保存先の引数を宣言すると、react-jsonschema-formが入力欄を生成。必須項目や範囲を検証し、不正な入力の保存を防ぎます。'],
            ['下書きから、確定へ', '編集は下書きに保持。保存でブロックへ反映し、キャンセルで破棄します。保存はUndo / Redoで戻せます。']
        ],
        tryHeading: 'まずはサンプルで',
        tryIntro: '小さなシーン設定フォームで、追加した編集方法を試せます。',
        urlLabel: '同梱サンプルのソース', copy: 'サンプルコードをコピー',
        steps: [
            '下のボタンでサンプルコードをコピーし、「拡張エディターを開く」を選びます。',
            '左下の「拡張機能を追加」→「カスタム拡張機能」→「テキスト」でコードを貼り付け、「サンドボックスなしで実行する」を選んで読み込みます。同梱サンプルがエディター内で動作します。',
            '「Block editor demo」のブロックを作業エリアへドラッグし、左のアイコンをクリックします。値を変え、保存またはキャンセルを試してください。'
        ],
        limits: '現在は通常の文字列入力に格納するJSONと、既存アイコンのある拡張ブロックが対象です。公開版は実験段階です。',
        creditsHeading: '本家へのクレジットと、このサイトについて',
        credits: [
            'このサイトは <strong>kubohiroya</strong> が独自拡張したフォークです。<a href="https://turbowarp.org/">TurboWarp</a>本家の公式サイトではなく、TurboWarp開発者による承認・提供を示すものではありません。',
            'エディターは <a href="https://github.com/TurboWarp/scratch-gui">TurboWarp / scratch-gui</a> と <a href="https://scratch.mit.edu/credits">Scratchの貢献者</a>の成果を基にしています。独自に追加した部分は、ブロック専用編集UIの登録、JSON Schemaフォーム、検証、下書きと保存の仕組みです。',
            'ScratchはScratch Foundationのプロジェクトで、<a href="https://scratch.org/">scratch.org</a>で無料で利用できます。このサイトはScratch、Scratch Team、Scratch Foundationと提携していません。',
            'TurboWarp GUIのライセンスは <a href="../LICENSE">GNU GPL v3</a> です。<a href="SOURCE">公開版のソース</a>、<a href="CORE">共通エディター基盤</a>、<a href="../credits.html">元のクレジット一覧</a>も参照できます。'
        ],
        footer: '独自拡張・公開：kubohiroya', build: 'ビルド', issues: '不具合・要望',
        languageNote: 'ブラウザの優先言語で日英を選択します。言語はいつでも切り替えられます。'
    },
    en: {
        title: 'TurboWarp Extension Data Editor — Give every block its own editor',
        description: 'An independent TurboWarp fork by kubohiroya. Generate dedicated forms from JSON Schema to validate and edit extension block data.',
        skip: 'Skip to content', source: 'View source on GitHub', badge: 'EXPERIMENTAL',
        eyebrow: 'TURBOWARP + CUSTOM BLOCK EDITORS',
        heading: 'Give every block<br>its own editor.',
        intro: 'A new way to edit, built on TurboWarp. Open a form from an extension block’s icon and work with structured JSON data in one place.',
        open: 'Open extended editor ↗', try: 'Try the sample', plain: 'Open standard editor',
        note: 'Runs in your browser. Save projects as .sb3 files as usual.',
        mockTitle: 'Edit block', mockLabel: 'Scene label', mockValue: 'Opening', mockDuration: 'Duration (seconds)', cancel: 'Cancel', save: 'Save', caption: 'FORM ILLUSTRATION — TRY THE ACTUAL UI IN THE EDITOR',
        featuresHeading: 'What this fork adds',
        features: [
            ['From icon to editor', 'Click the icon of a placed extension block to open a dedicated modal and edit its data in one place.'],
            ['A form from your schema', 'Declare a JSON Schema and a storage argument. react-jsonschema-form builds the controls, checks requirements and ranges, and prevents invalid saves.'],
            ['Draft, then commit', 'Changes stay in a draft until you save. Cancel discards the draft. A saved change can be undone and redone.']
        ],
        tryHeading: 'Start with a small sample', tryIntro: 'Explore the new editing flow with a simple scene settings form.',
        urlLabel: 'Bundled sample source', copy: 'Copy sample code',
        steps: [
            'Copy the sample code with the button below, then open the extended editor.',
            'Choose “Add Extension” → “Custom Extension” → “Text”. Paste the code, select “Run without sandbox”, and load it. This runs the bundled sample inside the editor.',
            'Drag a block from “Block editor demo” onto the workspace and click its left icon. Change a value, then try Save or Cancel.'
        ],
        limits: 'Currently supports JSON stored in standard text inputs and extension blocks with an existing icon. This is an experimental public build.',
        creditsHeading: 'Credits and about this site',
        credits: [
            'This is an independent fork extended and published by <strong>kubohiroya</strong>. It is not the official <a href="https://turbowarp.org/">TurboWarp</a> website and does not imply endorsement by the TurboWarp developers.',
            'The editor builds on <a href="https://github.com/TurboWarp/scratch-gui">TurboWarp / scratch-gui</a> and the work of the <a href="https://scratch.mit.edu/credits">Scratch contributors</a>. This fork adds block editor registration, JSON Schema forms, validation, and draft / save transactions.',
            'Scratch is a project of the Scratch Foundation, available for free at <a href="https://scratch.org/">scratch.org</a>. This site is not affiliated with Scratch, the Scratch Team, or the Scratch Foundation.',
            'The TurboWarp GUI is licensed under <a href="../LICENSE">GNU GPL v3</a>. See the <a href="SOURCE">published source</a>, <a href="CORE">shared editor package</a>, and <a href="../credits.html">original credits</a>.'
        ],
        footer: 'Extended and published by kubohiroya', build: 'Build', issues: 'Issues & feedback',
        languageNote: 'Japanese or English is selected from your browser’s preferred languages. You can switch at any time.'
    }
};
