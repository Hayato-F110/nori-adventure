# リポジトリ公開のチェックリスト

方針（2026-11-04 決定、11-06 改訂）：GitHub Pages（NORI-16）までに、**11/10 までに**公開する。方法は「3. 公開の手順」のとおり、新しい公開リポジトリに移す。GitHub Free では、Pages とブランチ保護（ルールセット）は公開リポジトリでしか使えないため。

公開は取り消しがきかない（フォーク・キャッシュ・検索エンジンに残りうる）。**切り替える直前に、このチェックをもう一度行い、オーナーの最終確認をもらってから実行する。**

## 1. 公開前チェック

| #   | 確認すること                                                             | 方法                                                       | 2026-11-04 の結果                                                                                              |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | 秘密情報（APIキー・トークン・秘密鍵）が**履歴を含めて**ない              | 全コミットに対して、Hook と同じパターンで `git grep`       | 0件（Hook 自身の検出パターンのみ）                                                                             |
| 2   | `.env`・鍵ファイル・画像・動画が追跡されていない                         | `git ls-files` を拡張子で確認                              | なし                                                                                                           |
| 3   | 経歴・勤務先・メールアドレス・家族の情報がない                           | 全コミットに対して、キーワードで `git grep`                | なし（作業者の姓が20か所あったため、11/4 にすべて「オーナー」に置き換え。履歴には残る → 公開前に対応を決める） |
| 4   | コミットの作者が noreply アドレス                                        | `git log --all --format='%ae'`                             | noreply のみ                                                                                                   |
| 5   | `private/`・キックオフ文書が Git の対象外                                | `git status --ignored`                                     | 対象外                                                                                                         |
| 6   | スクリーンショット・録画が入っていない                                   | 2 と同じ                                                   | なし（`test-results/` は除外）                                                                                 |
| 7   | Actions のトークンの初期権限が読み取りのみ                               | `gh api repos/{owner}/{repo}/actions/permissions/workflow` | `read`                                                                                                         |
| 8   | 第三者のアセット（モデル・音・フォント）のライセンスが公開に対応している | `docs/assets/licenses.md`（S10 で作成）                    | まだアセットなし                                                                                               |

## 2. 公開の直後に有効にする設定（公開リポジトリでは無料）

| 設定                                           | 目的                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| main のルールセット                            | 直接 push・force push・削除を禁止。PR と CI（check・e2e）を必須に |
| Secret scanning ＋ Push protection             | 秘密情報の push を GitHub 側でも止める（Hook との二重化）         |
| Dependabot alerts / security updates           | 依存パッケージの脆弱性を知らせる                                  |
| CodeQL（default setup）                        | コードの静的解析（10月の kids-play と同じ）                       |
| Private vulnerability reporting と SECURITY.md | 脆弱性の連絡窓口                                                  |

## 3. 公開の手順（2026-11-06 改訂：新しいリポジトリに移す）

**なぜ今のリポジトリを公開しないか**：作業者の姓が、11/4 の7つのコミットと PR #1・#2・#5〜#9 の差分に残っている。GitHub の公式の資料によると、履歴を書き換えて force push しても、PR の記録（`refs/pull/*`、読み取り専用）に古いコミットが残る。GitHub Support が消すのは秘密情報だけ（[Removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)）。そこで、履歴から姓を消したコピーを、PR の記録のない新しい公開リポジトリに移す（2026-11-06 にオーナーが決定）。期限は 11/10（NORI-16）。

| #   | 誰       | すること                                                                                                                                                                                                                                      |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Claude   | 開いている PR を0にする（マージか閉じる）。1 のチェックをやり直し、結果をこの表に追記する                                                                                                                                                     |
| 2   | Claude   | `uv tool install git-filter-repo`（版は PyPI で確かめる）。スクラッチのフォルダに `git clone --no-local` で**まっさらな clone** を作る（filter-repo の決まり。`--force` は使わない）                                                          |
| 3   | Claude   | 置き換えの一覧（`姓==>オーナー` など）を**リポジトリの外**（スクラッチ）に書き、`git filter-repo --replace-text <一覧> --replace-message <一覧>` を実行する                                                                                   |
| 4   | Claude   | 書き換えた clone で、`git log --all -G<姓>`・`git log --all --grep=<姓>`・`git grep` が0件、`npm ci && npm run check` が通ることを確かめる                                                                                                    |
| 5   | オーナー | 最終確認。OK なら、古いリポジトリの名前を変える：`gh repo rename nori-adventure-archive -R Hayato-F110/nori-adventure --yes`（非公開のまま残す）                                                                                              |
| 6   | オーナー | 新しい公開リポジトリを作る：`gh repo create Hayato-F110/nori-adventure --public --description "4〜8歳向けのオリジナル3D乗り物アクションゲーム（Three.js）" --disable-wiki`（Claude の設定と auto モードで止められるため、オーナーが実行する） |
| 7   | オーナー | 書き換えた clone から、新しいリポジトリへ main を push する（Claude は main への push を deny にしている）                                                                                                                                    |
| 8   | Claude   | 「2. 公開の直後に有効にする設定」を有効にし、`gh api` で確かめる。Actions のトークンの初期権限が `read` か確かめる                                                                                                                            |
| 9   | Claude   | 手元の作業フォルダを、新しいリポジトリにつなぎ直す（`git remote set-url origin`）。古い履歴の残る手元の main を新しい履歴にそろえる操作は、内容を示してオーナーの承認をもらう                                                                 |

注意：

- 古い名前で新しいリポジトリを作ると、名前を変えた古いリポジトリへの転送は効かなくなる（[Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)）。古い URL が新しい公開リポジトリを指すので、今回はこれでよい
- 新しいリポジトリには、PR #1〜#22 の画面（説明・レビュー）は移らない。古いリポジトリで見られる。コミットの文にある「Merge pull request #19」などの番号は、新しいリポジトリの PR 番号とは別のもの
- 置き換えの一覧には姓が書かれているので、スクラッチのフォルダ以外に置かない。終わったら消す
- 手順は実行する日に、公式の資料でもう一度確かめる

## 4. 公開の記録（2026-11-07）

11/7 18:38（JST）に公開した（リポジトリの作成時刻）。古いリポジトリは `Hayato-F110/nori-adventure-archive`（非公開）として残っている。

| #    | 結果                                                                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | 開いている PR は 0。1章をやり直した：秘密情報のパターンは Hook 自身の検出パターンの2件だけ。追跡中のファイルは md・ts・json などで、画像・動画・鍵はない。作者・コミッターは noreply だけ。`private/`・キックオフ文書は対象外                                                                                                                                                                    |
| 2    | git-filter-repo 2.47.0（PyPI の最新）。`git clone --no-local --single-branch --branch main` でまっさらな clone を作った                                                                                                                                                                                                                                                                          |
| 3    | 置き換えは5つ（姓2つ、Jira のサイト名2つ、仕事の内容が分かる一文1つ）。サイト名と一文は、`privacy-reviewer` の指摘を受けてオーナーが決めた。職種・使う技術の説明は、氏名と勤務先がないので、そのまま公開する（オーナーが決定）                                                                                                                                                                   |
| 4    | 7つの言葉が、差分・コミットの文・今のファイルのすべてで0件。コミット数は81で同じ。元の main との差分は3ファイル・各1行。`npm ci && npm run check` は成功（単体テスト168件）                                                                                                                                                                                                                      |
| 5〜7 | オーナーが実行。`gh repo create` に `--source <clone> --remote origin --push` を足して6と7をまとめた。公開側の main は clone と同じコミット、ブランチは main だけ                                                                                                                                                                                                                                |
| 8    | `gh api` で確かめた：Secret scanning・Push protection は公開時から有効。Dependabot alerts・security updates、Private vulnerability reporting、CodeQL（default setup、JavaScript/TypeScript と Actions）を有効にした。ルールセット「main を守る」（削除・force push の禁止、PR と CI の `check`・`e2e` を必須、承認は0人、マージは merge だけ）。Actions のトークンは `read`、PR の承認はできない |
| 9    | `origin` はもともと同じ URL なので、つなぎ直しは要らなかった。手元の古い main は `archive-main` に名前を変え、`archive` リモートにつないだ（push 先も `archive` に固定）。新しい main は `origin/main` から作った（オーナーが承認）                                                                                                                                                              |

出典：[git-filter-repo の説明（v2.47.0）](https://github.com/newren/git-filter-repo/blob/v2.47.0/Documentation/git-filter-repo.txt)、[Repositories の REST API](https://docs.github.com/en/rest/repos/repos)、[Code scanning の REST API](https://docs.github.com/en/rest/code-scanning/code-scanning)、[Rules の REST API](https://docs.github.com/en/rest/repos/rules)

残り：`privacy-reviewer` の低い指摘（PC の構成の書き方、隔離の確認スクリプトがユーザー名を書くこと）は別の PR で直す。CSP の `'unsafe-inline'` は NORI-16 で直す。
