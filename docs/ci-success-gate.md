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
