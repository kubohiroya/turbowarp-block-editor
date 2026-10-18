# 通常CI成功ゲート

公開・検証の正本: [共通Issue #26](https://github.com/kubohiroya/turbowarp-extension-data-editor/issues/26)。
共通 `.github/workflows/pages.yml` がbuild、CIゲート、deploy、公開後E2Eを所有します。
GUIフォークには公開用workflowを置きません。

## 公開条件

- 共通mainのイベントSHAとサイト成果物のsiteRevisionを一致させます。
- 共通 `ci.yml` のmain push CI全体が同一SHAでcompleted/successの場合だけ公開します。
- ゲートはcaller自身のrepoの標準tokenを利用し、repo/head repo、workflow ID、event、branch、完全SHAを照合します。
- 一致する最新run番号と詳細APIの最新attemptを確認。queued/実行中は15秒間隔、全体30分上限で待機します。
- 失敗・cancel・timeout・skip・不完全なAPI・権限不足は拒否し、古い成功を代用しません。
- ゲート自身にCI起動・再実行・承認・cancel・Pages権限はありません。
- `normal-ci-gate-<run id>-<attempt>` のdecision.jsonとsummaryに採用SHA/run/attempt/観測時刻/理由を保存します。

公開jobはbuildとgateのsuccessに依存し、直前に共通main鮮度と固定GUI SHAのCI成功を再確認します。
GUI CIの読取りは `scripts/site/source.mjs` が同じ判定本体を利用します。
公開APIだけを使い、未完了や確認不能なら短い上限で拒否します。
PagesやE2E自身を通常CIの代用にせず、公開後E2E失敗と公開前の抑止を区別します。
同一SHA確認とdeployは原子的ではないため、観測時刻と最終鮮度確認を残します。

## 検証・ロールバック

境界テストは `node --test test/ci/*.test.mjs`、サイト入口は `node --test test/site/*.test.cjs`。
既存の `ci-gate-probe.yml` は読み取り専用ゲートと公開代替sentinelを検証します。
意図した負の対照ではgate=failure、sentinel=skipped、assert=successが期待値です。
実公開を故意に壊さず、隔離fixtureだけを使います。
rollbackは公開workflow停止、または前の検証済みサイト設定へrevertしてCI経由で再公開します。
確認不能を理由にgateを解除しません。[Pages運用](github-pages.md)を参照してください。

## 最新attemptの自動実検証

共通側の `ci-gate-rerun-test.yml` は毎週月曜11:37 JST（UTC `37 2 * * 1`）にdefault branchのmainで起動し、手動でも同じsuiteを実行できます。同一SHA・同一CI runの3 attemptと4つの読み取り専用observerを自動で検査します。GUIの変更、通常CIの書換え、一時branchの作成/削除、PATの登録は不要です。

```sh
gh workflow run ci-gate-rerun-test.yml \
  --repo kubohiroya/turbowarp-extension-data-editor --ref main
```

統括だけが週次scheduleを持ち、fixture/observerは手動dispatchのみです。定期入口はmainと指定cronだけを許可し、証跡とsummaryに実際のtriggerを残します。既存の公開版E2E（月曜11:17 JST）から20分ずらしています。実GitHubテストをpush/PRから自動起動しません。通常CIは既存の `node --test test/ci/*.test.mjs` により、統括ロジック・fixture・誤run/attempt・権限境界・timeout等のローカルテストを実行します。

GitHubのscheduleはdefault branchの最新commitを対象とし、起動が遅れる場合があります。手動起動は同じ統括本体の実行確認であり、真正scheduleイベントを手動生成したものではありません。定期起動は `event=schedule` とartifactの `trigger` / `schedule`、suiteのsuccessを確認します。[GitHub公式のschedule仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)を参照してください。

### 確認する順序

1. 専用fixtureの初回attemptを成功させ、baseline observerが通過することを確認。
2. 同じfixture runを再実行。最新attempt 2実行中に、CI状態をobserver job取得の前後で照合し、ゲートが待機中で後続sentinelが未開始であることを確認。
3. attempt 2を意図的に失敗させ、ゲートが最新failureを拒否し、後続がskipされることを確認。失敗後に新しく起動するobserverでも古いsuccessを採用しないことを確認。
4. 同じrunをattempt 3へ再実行。実行中は待機し、最新successの後だけ通過することを確認。CI終了→ゲートの観測→ゲート完了→後続開始の時刻順序も検査。

fixtureは `ci-gate-rerun-fixture.yml` の専用workflowで、通常CIとは別です。観測用の待機はattempt 2/3で各180秒、fixture jobは5分上限です。テスト全体の待機上限は25分、統括jobは35分上限。runner混雑により実行中の観測窓を逃した場合は成功扱いせず失敗させ、summary/evidenceを確認してsuiteを再実行します。

統括のconcurrencyはrepository/ref単位で直列です。親run ID/attemptからsuite IDを作り、子runのworkflow ID・title・repo/head repo・SHA・branch・eventを照合します。子workflowの初回起動は新しいrun、fixture再実行だけは同じrunのattempt 2/3です。branchが途中で進んだ場合や、別fixture runが割り込んだ場合は拒否します。

### 権限と証跡

統括jobだけが `contents: read` / `actions: write` を持ちます。Actionsのwrite権限はrepo単位ですが、統括コードはこの共通repoと専用のfixture/observer workflowに限定し、自分で生成・照合したfixture runだけを再実行します。GUIを対象にできず、git/contentsへのwriteもありません。

fixture、observer、呼び出す公開ゲートはread-onlyです。すべての経路にPages/OIDCのwrite権限・environment・deploy処理はありません。sentinelは依存関係を確かめるためのログ出力だけです。新たなCI起動と再実行は統括へ置き、公開ゲートAPI自身のread-onlyという責務を維持します。

observerの `assert-probe` がゲートのJSON artifactを読み、fixture run ID・完全SHA・最新attempt・結論を再照合します。統括はassert-probeの成功と構造化proofを確認し、API snapshotと時刻順序も照合します。ログのダウンロード先へGitHub tokenを転送しません。

- 親run: `ci-rerun-test-<run ID>-<attempt>` artifactに途中経過を含む `evidence.json`、summaryに結果とfixture runリンク。
- 子observer: 既存の `normal-ci-gate-<run ID>-1` と `ci-rerun-proof-<run ID>-1` artifactに判断と照合結果。
- artifactの保持は7日。意図した負の対照は子workflow全体がfailureになりますが、assert-probeがsuccessであることを親が検査し、suite全体はsuccessとなります。

失敗時にも途中のrun ID・API観測・理由を保存します。自動のbranch削除や他workflowのcancel/retryは行いません。親が失敗しても子workflowはそれぞれのtimeout内で終了し、実公開には影響しません。実公開版のE2Eやdeploymentはこのsuiteで起動しません。

[workflow_dispatchはGITHUB_TOKENからも子workflowを起動できる](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)仕組みを使います。公開後E2Eや通常CIへの呼出しは追加しません。

週次設定のrollbackはcronとschedule許可の追加分をrevertし、手動のみへ戻します。自動テスト全体を止める場合は統括workflowを無効化します。GUIの固定SHA、アプリ配布版、公開ゲートの運用は変更不要です。

## 真正scheduleの独立検証と運用記録

`ci-gate-rerun-report.yml` は統括の完了をworkflow_runで受け、元runのevent=schedule、
親/子artifact、最新attempt、実権限、GUI/サイトの前後観測を独立に検証します。
手動runはineligibleとし、真正schedule成功に置き換えません。
verifyはcontents:read/actions:readのみ。結果はsummary/report.jsonに7日間保存します。
失敗と証跡不足を区別し、API障害を成功へ変換しません。

運用記録先を同repoのIssue #26へ移したため、専用GitHub App・PAT・秘密鍵は不要です。
別jobの標準GITHUB_TOKENにIssues:writeを付け、固定された同repo Issueへ定型記録します。
投稿jobにPages/OIDCやコードwriteを付けず、GUIのIssueへは書き込みません。
CI_RERUN_REPORT_ENABLED未設定はOFF。導入検証後に共通Actions variableをtrueにします。
元run/attemptとreporter SHAを照合して投稿直前に最新attemptを再確認し、
マーカー・全ページ検索・直列実行で重複を抑止します。POST応答が失われたら再読し、再POSTしません。

```sh
gh workflow run ci-gate-rerun-report.yml \
  --repo kubohiroya/turbowarp-extension-data-editor --ref main \
  -f run_id=<actual-scheduled-run-id>
```

完了イベントだけでは未起動／永久待機は検出しません。未起動監視は別段階です。
GUI前後観測は2時点だけで、途中の変更・復元を検出したとは主張しません。
App案は撤回し、Appの作成・インストール・秘密鍵の登録は行いません。
rollbackは投稿変数OFF、必要ならreport workflow停止。週次suite・GUI・Pagesは維持します。
