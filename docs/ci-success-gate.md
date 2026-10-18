# 通常CI成功ゲート

対象: [scratch-gui Issue #12](https://github.com/kubohiroya/scratch-gui/issues/12)。
GUI側は `.github/workflows/pages.yml` の共通workflow呼出しと `deploy.needs: [build, ci-gate]` を持ちます。
API判定・待機・証跡・境界テストはこの共通リポジトリが所有します。アプリ配布版、build用core SHA、公開E2E runnerは変更不要です。

## 呼出しAPI

`require-successful-ci.yml` の参照と `runner_revision` を同一の共通側完全SHAへ固定します。

```yaml
ci-gate:
  needs: build
  if: github.ref == 'refs/heads/develop'
  permissions:
    contents: read
    actions: read
  uses: kubohiroya/turbowarp-extension-data-editor/.github/workflows/require-successful-ci.yml@<full-tooling-SHA>
  with:
    runner_revision: <full-tooling-SHA>
    expected_revision: ${{ needs.build.outputs.revision }}
    workflow_file: node.js.yml
    branch: develop
    event: push
```

`expected_revision` は検証済みPages成果物の完全SHAです。共通workflowはcaller自身の `github.repository` と `github.token` を使い、指定workflowファイルをAPIでIDへ解決します。異なるrepoの成功で代用できません。
必要権限は `contents: read` と `actions: read` だけです。ゲートはCIを起動・承認・再実行・cancelしません。
共通ツールだけをcheckoutし、Node 22で実行します。依存のinstallやアプリの再buildは不要です。

## 公開条件と証跡

- repo/head repo、workflow ID、event、branch、完全SHAがすべて一致するworkflow runの最新run番号を採用し、詳細APIで最新attemptを確認します。
- workflow全体の `status=completed` / `conclusion=success` だけを許可します。古い成功、PR CI、Pages自身、同名checkは代用しません。
- 未登録・queued・実行中は15秒間隔、全体30分上限（job35分）で待機します。失敗・cancel・timeout・skip・不正状態・不完全な一覧・API障害/権限不足は拒否します。API障害をsuccess扱いするfallbackはありません。
- success直前に再度一覧と詳細を確認します。CI状態の照合とdeployは完全には原子的にできません。採用run/attemptと観測時刻を保存します。
- summaryと `normal-ci-gate-<run id>-<attempt>` artifactの `decision.json` に判断・SHA・CI ID/URL/attempt・conclusion・理由を残します。tokenやAPIエラー本文は出力しません。
- deployはbuildとゲートのsuccessに依存し、deploy直前にGUIの既存develop鮮度ガードを再実行します。公開jobに `always()` を付けないでください。

自動・手動Pagesの条件は同じです。未登録のCIを手動公開で迂回できません。
ゲート失敗時はdeployと公開後E2Eがskipし、前の公開物を保持します。これはUIテスト失敗とは区別します。
公開後E2E6件と手動/週次チェックは既存のままです。期待SHA省略時は成功したPages deploymentを選び、未公開のdevelop先端は採用しません。

## 検証・ロールバック

ローカル境界テスト: `node --test test/ci/*.test.mjs`。通常CIでも実行します。
実APIでの成功/失敗と後続jobのskipは、共通側の手動workflow `ci-gate-probe.yml` で検証します。
`expected_revision` とそのpush CIの `branch`、期待する `expect`（failure/success）を指定します。
probe自身にPages/OIDC/write権限やdeploy処理はありません。実CIが失敗するとgateがfailure、publish-sentinelがskipped、assert-suppressionがsuccessになります。workflow全体のfailureは期待された負の対照です。

失敗fixtureが必要な場合は、この共通repoの独立した一時branchに限り `ci.yml` をread-only・`exit 1` のCIへ変更してpushします。そのCIの失敗を確認後、mainのprobeから同じbranch/SHAを検証します。main/developや実公開用workflowを故意に壊さず、証跡保存後に一時branchを削除します。

rollbackはGUIのci-gate呼出しとdeployのneedsだけをrevertします。確認不能時に自動解除しません。既定OFFのアプリ機能と保存形式には影響しません。公開後E2E失敗時の既存切戻しは[Pages運用](github-pages.md)を参照してください。

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
