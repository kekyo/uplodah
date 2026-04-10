# uplodah

シンプルでモダンな汎用ファイルアップロード/ダウンロードサーバー実装

![uplodah](./images/uplodah-120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/uplodah.svg)](https://www.npmjs.com/package/uplodah)
[![Docker Image Version](https://img.shields.io/docker/v/kekyo/uplodah.svg?label=docker)](https://hub.docker.com/r/kekyo/uplodah)

---

[(English is here)](./README.md)

## これは何？

ファイルのやり取りを独自にホストしたサーバーで行いたいという需要は、特にプライベートでの利用シーンで求められます。
友人・スモールオフィスにおける同僚とのやり取り、あるいは顧客とのファイル送受信でも必要になることがあるでしょう。

現代ではクラウドベースのストレージを使うことが一般的ではありますが、
一方で機密性の高いファイルをクラウドストレージに（一時的にしても）配置することには、
抵抗感があったり、厳密な組織ポリシーで禁止されているかも知れません。

どうすればこのような「単純なファイルの送受信」を、手間を掛けずに実現できるでしょうか?
apacheやnginxを使い、手動で細かい調整を施し、WebDAVを有効にしますか？
クライアント側には何を使用しますか？ ファイルの検索性については？

この "uplodah" は、あなたが探しているものかも知れません。
これは Node.js 上に構築された、ファイルのアップロードとダウンロードに特化したシンプルなサーバー実装です。

セットアップが非常に簡単（ゼロコンフィグすら可能）で、すぐに使い始められます。
データベースの管理などは一切不要です。
バックアップが必要なら、サブディレクトリをまるごとファイルコピーで保存して下さい。
特殊なツールなしに、簡単に元に戻せます。

モダンなブラウザベースの UI も提供されています:

![Browse](./images/browse.png)

- アップロード済みファイルを一覧表示できます。
- ファイル名や仮想ディレクトリごとに検索・整理できます。
- 最新版または特定版のダウンロード URL を確認できます。
- 複数ファイルのドラッグ＆ドロップアップロードが可能です。
- `curl` の API サンプルをその場でコピーできます。

### 主な機能

- **簡単セットアップ、数秒でアップロードサーバーを起動**
- データベース不要：アップロードファイルとメタデータをファイルシステムだけで管理
- シンプルなアップロード API：`POST` または `PUT` で `application/octet-stream` を送るだけ
- バージョン付き保管：同じファイル名の再アップロードを履歴として保持
- 柔軟なダウンロード：最新バージョンまたは特定アップロードID（日時ベース）を直接取得
- モダンな Web UI：
  - ファイル一覧・検索・展開表示
  - 仮想ディレクトリ単位の表示
  - 複数ファイルアップロード
  - API 実行例の表示とコピー
- 仮想ストレージルール：
  - ディレクトリごとのリードオンリー制御
  - ディレクトリごとの有効期限指定
- 認証機能：アップロード専用またはサーバー全体を、UIログイン・ユーザーロール・APIパスワードで保護可能
- リバースプロキシとサブパス配信をサポート
- Dockerイメージ利用可能
- ヘルスチェックエンドポイント `/health` を提供

## 動作環境

Node.js 20.19.0 以降

使用スタック: Node.js, TypeScript, Vite, Vitest, prettier-max, screw-up, Fastify, React, React MUI, dayjs, JSON5, async-primitives

---

## インストール

[Node.js](https://nodejs.org/ja/download) がシステムにインストールされていない場合は、インストールを行って下さい:

```bash
$ node --version
v24.11.1
```

Node.jsが使える状態なら、NPMコマンドを使用してインストールできます（表示は多少異なるかも知れません）:

```bash
$ npm install -g uplodah

added 157 packages in 8s

42 packages are looking for funding
  run `npm fund` for details
```

あるいは、 `npx` を使用して、直接起動できます:

```bash
$ npx uplodah
Need to install the following packages:
uplodah@0.1.0
Ok to proceed? (y)

[uplodah]: [2026/04/07 14:25:56.966]: [info]: uplodah [0.1.0] Starting...
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Config file: ./config.json
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Port: 5968
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Base URL: http://localhost:5968 (auto-detected)
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Storage directory: ./storage

    :
    :
```

## 使用方法

以下にいくつかの例を示します:

```bash
# デフォルトポート5968でサーバーを起動
uplodah

# カスタムポートとストレージディレクトリ
uplodah --port 3000 --storage-dir ./storage

# リバースプロキシ配下の公開URLを固定
uplodah --base-url https://files.example.com/uplodah

# 複数オプションをまとめて指定
uplodah --port 3000 \
  --storage-dir ./storage \
  --config-file ./config.json \
  --max-upload-size-mb 500
```

デフォルトでは次の URL で利用できます：

- Web UI: `http://localhost:5968/`
- ファイル一覧 API: `http://localhost:5968/api/files`
- アップロード API: `http://localhost:5968/api/upload/<file-name>`
- ダウンロード API: `http://localhost:5968/api/files/<file-name>`
- ヘルスチェック: `http://localhost:5968/health`

`--base-url` を指定すると、UI に表示されるダウンロード URL や API 実行例はその URL を基準に生成されます。

`--config-file` は構成ファイルのパスで、 uplodah の細かいカスタマイズを指定する場合に指定します。
もちろん、このファイルはオプションであり、デフォルト動作で問題ない場合は不要です。

### Web UI

ウェブUIはユーザーフレンドリーで、curlの使用方法やディレクトリ毎のファイル群のブラウズ、ファイル群のフィルター、ファイルのアップロード機能があります:

![File list](./images/filelist.png)

cURLを使用してアップロード・ダウンロードを行う例が表示されるので、これを使えば簡単にCLI統合出来ます:

![cURL example](./images/curl-example.png)

### ファイルのアップロード

アップロードはUIを使用して行うことが出来ます。
ファイルをドラッグアンドドロップで受け入れたり、同時に複数のファイルをアップロードするのも非常に簡単です:

![Upload](./images/upload.png)

そして、APIを使用してアップロードすることも出来ます。
以下の例は cURL を使用してルートディレクトリに `report.txt` をアップロードします:

```bash
curl -X POST http://localhost:5968/api/upload/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

`PUT` でも同じようにアップロードできます：

```bash
curl -X PUT http://localhost:5968/api/upload/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

アップロードが成功すると `201 Created` が返され、レスポンス本文には保存された `uploadId` とダウンロード URL が含まれます。`Location` ヘッダにもダウンロード先が設定されます。

TODO: JSON例

### 仮想ディレクトリ付きアップロード

`storage` ルールが構成されている場合は、仮想ディレクトリ配下にファイルをアップロードできます。
UIでは、アップロードパネル内のサブディレクトリ選択ドロップダウンから選択します。

APIを使用する場合は、パスにサブディレクトリパスを含めます。
以下の例では、 `/foobar` ディレクトリに `report.txt` を配置します:

```bash
curl -X POST http://localhost:5968/api/upload/foobar/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

この API パスは公開上のファイル名 `/foobar/report.txt` として扱われます。

注意点：

- `storage` を構成していない場合、許可されるのは `report.txt` のような単純なファイル名だけです。
- `storage` を構成した場合、アップロード可能なディレクトリは `storage` に定義されたパスだけになります。
- 特殊文字を含むパスは URL セグメントごとに適切にエンコードしてください。

### ダウンロード

ダウンロードを行う場合は、一覧表示からファイル名のエントリをクリックして開き、該当するファイルバージョンの "Download" ボタンをクリックします。
以前に説明したとおり、 uplodah は同一のファイルの複数のバージョンを保存できます。
その場合は、以下のようにアップロードされた日時で区別されているので、どのバージョンをダウンロードするのかを指定して下さい。
リストは最新のバージョンから順に表示されます:

![Download](./images/download.png)

cURLでダウンロードする場合も、どのバージョンをダウンロードするかを指定する必要があります。
これは、アップロード時に返されるJSONの情報で正確に示されますが、日時がわかっていればURLを構築可能です。
以下に例を示します。

最新バージョンをダウンロード（ファイル名のみ指定）:

```bash
curl -L "http://localhost:5968/api/files/report.txt" -o ./report.txt
```

特定バージョンをダウンロード（`YYYYMMDD_HHmmss_fff`の形式）:

```bash
curl -L "http://localhost:5968/api/files/report.txt/20260406_203040_123" -o ./report.txt
```

特定バージョンの日時の形式は、完全に同一日時に複数のアップロードがあった場合に、末尾に `_1`, `_2` ... のようなサフィックスが追加されることがあることに注意して下さい。

### ファイル一覧

cURLでファイル一覧を取得するには、以下のようにします:

```bash
curl "http://localhost:5968/api/files?skip=0&take=20"
```

一覧 API は、最新アップロード日時の新しい順でグループを返します。各グループには、そのファイル名に対応する全バージョン情報が含まれます。

---

## ファイルストレージの設定

### ストレージの場所

デフォルトでは、アップロードファイルは `./storage` に保存されます。
`--storage-dir` オプションまたは `storageDir` 設定で変更できます：

```bash
# デフォルトの ./storage を使用
uplodah

# カスタムディレクトリを使用
uplodah --storage-dir /srv/uplodah/storage
```

CLI オプションまたは環境変数で指定する相対パスは、実行ディレクトリ基準で解決されます。
`config.json` 内の `storageDir` は、その `config.json` が置かれているディレクトリ基準で解決されます。

### ストレージレイアウト

最初に説明したとおり、 uplodah は特殊なデータベースを一切使用しません。
このディレクトリ内にサブディレクトリとファイルが配置されるだけです。

保存済みアップロードとして認識されるのは、次の条件をすべて満たす場合だけです:

- バージョンディレクトリ名が `uploadId` としてパース可能であること
- `metadata.json` が存在し、有効な JSON としてパース可能であること
- 同じディレクトリ内に payload ファイルが存在し、そのファイル名が親のファイルグループディレクトリ名と一致すること

ストレージツリーは、公開パスをそのままストレージルート配下へ反映します:

```
storage/
├── report.txt/
│   └── 20260406_203040_123/
│       ├── metadata.json
│       └── report.txt
└── bropdox/
    └── report.txt/
        └── 20260406_204512_918/
            ├── metadata.json
            └── report.txt
```

`storage` ルールが有効な場合も、公開パスのディレクトリセグメントがファイルグループディレクトリの前にそのまま入るだけで、
内部専用の別ツリーは使用されません。

`uploadId` は `YYYYMMDD_HHmmss_fff` 形式のタイムスタンプを基準に生成され、同一ミリ秒で競合した場合は末尾に連番が付与されます。

### 仮想ディレクトリルール

`config.json` には、仮想ディレクトリのルールを定義することが出来ます。
この定義は存在しなくても良く、その場合は、ルートディレクトリ直下に通常のファイル名だけを配置できます。

仮想ディレクトリ `storage: { ... }` を定義すると、アップロード先は定義済み仮想ディレクトリ配下でなければなりません。
より深いサブディレクトリへアップロードする場合は、最も具体的に一致する仮想ディレクトリルールが適用されます。
また、仮想ディレクトリ毎に機能設定を行うことが出来ます。

以下に `config.json` に指定する `storage` の例を示します:

```json
{
  "port": 5968,
  "storage": {     // 仮想ディレクトリを有効化
    "/": {},       // (ルートディレクトリ)
    "/bropdox": {  // "/bropdox"
      "expireSeconds": 86400 // ファイルの有効期限
    },
    "/archive": {  // "/archive"
      "readonly": true // 読み取り専用
    },
    "/archive/incoming": {} // "/archive/incoming"
  }
}
```

この例では：

- `/` は通常アップロード可能
- `/bropdox` 配下の任意のサブディレクトリへのアップロードは 24 時間後に自動削除
- `/archive` 配下は読み取り専用
- `/archive/incoming` は `/archive` よりも具体的なルールなので、その配下では再びアップロード可能

ルールの性質：

- キーは必ず `/` で始めます。
- バックスラッシュや `.` `..` は使用できません。
- 最も具体的に一致したディレクトリルールが適用されます。
- `storage` を定義した場合、定義済み仮想ディレクトリ配下でないディレクトリにはアップロードできません。
  ルートディレクトリやその配下にもファイルを配置できるようにするには、上記例のように明示的にルートディレクトリ `/` を含める必要があります。

### バックアップとリストア

データベースを使っていないため、単純にストレージディレクトリをバックアップすれば十分です：

```bash
cd /your/server/base/dir
tar -cf - ./storage | bzip2 -9 > backup-storage.tar.bz2
```

リストアは展開した後に同じ `storageDir` 設定で `uplodah` を起動するだけです。

ディレクトリ構造が破損した場合は、以下のことに注意して、同じ構造のディレクトリを構築すれば復元出来ます:

1. `<公開パス>/<YYYYMMDD_HHmmss_fff[_num]>/` ディレクトリを作る。`_num` はオプションで、同じ日時で同時にファイルの配置がある場合の一意性を担保するための連番です。
2. 上記のディレクトリ内に、有効な JSON の `metadata.json` を配置する。
3. 同じディレクトリ内に payload ファイルを配置し、そのファイル名を親のファイルグループディレクトリ名と完全に一致させる。

ストレージディレクトリに直接アクセスした場合は、その変更は動作中の uplodah には反映されません。
uplodahを再起動する必要があります。

---

## 設定

`uplodah` は、コマンドラインオプション・環境変数・`config.json` を通じた設定をサポートしています。

設定は次の順序で適用されます（優先度が高い順）：

1. コマンドラインオプション
2. 環境変数
3. `config.json`
4. デフォルト値

## 設定ファイルの構造

カスタム設定ファイルを指定できます：

```bash
# コマンドラインオプションを使用
uplodah --config-file /path/to/config.json

# 環境変数を使用
export UPLODAH_CONFIG_FILE=/path/to/config.json
uplodah
```

指定されない場合、`uplodah` は現在のディレクトリで `./config.json` を探します。

`config.json` は JSON5 として読み込まれるため、コメントや末尾カンマも使用できます。

### config.json の構造

```json
{
  "port": 5968,
  "baseUrl": "https://files.example.com/uplodah",
  "storageDir": "./storage",
  "usersFile": "./users.json",
  "realm": "Awesome uplodah",
  "logLevel": "info",
  "trustedProxies": ["127.0.0.1", "::1"],
  "authMode": "none",
  "sessionSecret": "<your-secret-here>",
  "passwordMinScore": 2,
  "passwordStrengthCheck": true,
  "maxUploadSizeMb": 500,
  "storage": {
    "/": {},
    "/bropdox": {
      "expireSeconds": 86400
    },
    "/archive": {
      "readonly": true
    }
  }
}
```

すべてのフィールドはオプションです。必要なものだけを上書きしてください。

`storageDir` と `usersFile` の相対パスは `config.json` を含むディレクトリから解決されます。

### 設定リファレンステーブル

すべての設定は **CLI > 環境変数 > config.json > デフォルト** の優先順位で解決されます。

| CLIオプション                 | 環境変数                             | config.jsonキー         | 説明                                     | 有効な値                                   | デフォルト          |
| :---------------------------- | :----------------------------------- | :---------------------- | :--------------------------------------- | :----------------------------------------- | :------------------ |
| `-p, --port <port>`           | `UPLODAH_PORT`                       | `port`                  | HTTP サーバーの待ち受けポート            | 1-65535                                    | `5968`              |
| `-b, --base-url <url>`        | `UPLODAH_BASE_URL`                   | `baseUrl`               | 外部公開 URL の固定ベース URL            | 有効な URL                                 | 自動解決            |
| `-d, --storage-dir <dir>`     | `UPLODAH_STORAGE_DIR`                | `storageDir`            | ストレージルートディレクトリ             | 有効なパス                                 | `./storage`         |
| `-c, --config-file <path>`    | `UPLODAH_CONFIG_FILE`                | N/A                     | 設定ファイルのパス                       | 有効なパス                                 | `./config.json`     |
| `-u, --users-file <path>`     | `UPLODAH_USERS_FILE`                 | `usersFile`             | users.json ファイルへのパス              | 有効なパス                                 | `./users.json`      |
| `-r, --realm <realm>`         | `UPLODAH_REALM`                      | `realm`                 | UI タイトルおよびサーバー表示名          | 文字列                                     | `uplodah [version]` |
| `-l, --log-level <level>`     | `UPLODAH_LOG_LEVEL`                  | `logLevel`              | ログ出力レベル                           | `debug`, `info`, `warn`, `error`, `ignore` | `info`              |
| `--trusted-proxies <ips>`     | `UPLODAH_TRUSTED_PROXIES`            | `trustedProxies`        | 信頼するプロキシ IP のカンマ区切りリスト | IP アドレスのリスト                        | なし                |
| `--auth-mode <mode>`          | `UPLODAH_AUTH_MODE`                  | `authMode`              | 認証モード                               | `none`, `publish`, `full`                  | `none`              |
| N/A                           | `UPLODAH_SESSION_SECRET`             | `sessionSecret`         | セッション Cookie 用シークレット         | 文字列                                     | 自動生成            |
| N/A                           | `UPLODAH_PASSWORD_MIN_SCORE`         | `passwordMinScore`      | パスワードの最小強度スコア               | 0-4                                        | `2`                 |
| N/A                           | `UPLODAH_PASSWORD_STRENGTH_CHECK`    | `passwordStrengthCheck` | パスワード強度チェックを有効にする       | `true`, `false`                            | `true`              |
| `--max-upload-size-mb <size>` | `UPLODAH_MAX_UPLOAD_SIZE_MB`         | `maxUploadSizeMb`       | 最大アップロードサイズ (MB)              | 1-10000                                    | `100`               |
| N/A                           | N/A                                  | `storage`               | 仮想ディレクトリごとの保存ポリシー       | オブジェクト                               | 未設定              |
| N/A                           | `UPLODAH_AUTH_FAILURE_DELAY_ENABLED` | N/A                     | 認証失敗時の段階的遅延を有効にする       | `true`, `false`                            | `true`              |
| N/A                           | `UPLODAH_AUTH_FAILURE_MAX_DELAY`     | N/A                     | 認証失敗時の最大遅延時間 (ms)            | 数値                                       | `10000`             |
| `--auth-init`                 | N/A                                  | N/A                     | 対話的な管理者ユーザー作成で認証を初期化 | フラグ                                     | N/A                 |

---

## 認証機能

`uplodah` はユーザー認証をサポートしています。

| 認証モード | 詳細                                                                   | 認証の初期化 |
| :--------- | :--------------------------------------------------------------------- | :----------- |
| `none`     | デフォルト。認証を全く求めない                                         | 不要         |
| `publish`  | アップロードと管理UIのみ認証が必要。一覧取得とダウンロードは公開のまま | 必要         |
| `full`     | すべての操作で認証が必要（最初にログインが必要）                       | 必要         |

`uplodah` で認証を有効化する場合は、最初に `--auth-init` オプションを使って初期ユーザーを登録します。

### 初期化

初期管理者ユーザーを対話的に作成します：

```bash
uplodah --auth-init
```

このコマンドは以下を実行します：

1. 管理者ユーザー名の入力を求める
2. パスワードの入力を求める（強度チェック付き、マスク入力）
3. `users.json` を作成
4. 初期化後に終了（サーバーは起動しない）

Docker image で認証を有効にする場合も、同じボリュームに対してこのオプションを実行し、永続領域へ `users.json` を作成してください。

### セッション例

```
Initializing authentication...
Enter admin username: admin
Enter password: ********
Password strength: Good
Confirm password: ********
Creating admin user...

============================================================
Admin user created successfully!
============================================================
Username: admin
Role: admin
============================================================

Note: You need to generate an API password for API access.
You can do this through the web UI after logging in with your username and password.
============================================================
```

### ユーザー管理

`--auth-init` で追加したユーザーは自動的に管理者ユーザーになります。
管理者ユーザーは UI から他ユーザーの追加・削除を行え、パスワードリセットも可能です。

利用できるロールは次の通りです：

- `read`: ファイル一覧表示・参照・ダウンロード
- `publish`: `read` に加えてアップロード可能
- `admin`: `publish` に加えてユーザー管理可能

管理者ユーザーでも API パスワードを生成できますが、日常的なアップロード用アカウントとは分離して運用することを勧めます。

### APIパスワードの使用

`uplodah` では、UI にログインするパスワードと、API クライアントが使用するパスワードを分離しています。
API クライアントは HTTP Basic 認証で「APIパスワード」を使用します。

まずブラウザで UI にログインし、ユーザーメニューから API パスワード画面を開いて、ラベル付きの API パスワードを1つ以上生成してください。
API パスワードの平文は一度しか表示されないため、安全な場所に保存してください。

例：

```bash
# APIパスワードでアップロード
curl -X POST http://localhost:5968/api/upload/report.txt \
  -u publisher:xxxxxxxxxxxxxxxxxxxxxx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

```bash
# APIパスワードでファイル一覧取得（authMode=full では必須）
curl "http://localhost:5968/api/files?skip=0&take=20" \
  -u reader:xxxxxxxxxxxxxxxxxxxxxx
```

```bash
# APIパスワードで最新版をダウンロード（authMode=full では必須）
curl -L "http://localhost:5968/api/files/report.txt" \
  -u reader:xxxxxxxxxxxxxxxxxxxxxx \
  -o ./report.txt
```

`publish` モードでは、HTTP Basic 認証が必要なのはアップロード API のみです。
`full` モードでは、すべての API ルートで Basic 認証が必要になり、ブラウザ UI はログイン後に作成されたセッションで動作します。

### パスワード強度要件

`uplodah` は `zxcvbn` ライブラリを使用して、強いパスワード要件を適用します：

- 0-4 のスケール（弱い〜非常に強い）でパスワード強度を評価
- デフォルト最小スコア：2（Good）
- 一般的なパスワード、辞書語、パターンをチェック
- パスワード作成中にフィードバックを提供

`config.json` でパスワード要件を設定：

```json
{
  "passwordMinScore": 2, // 0-4, default: 2 (Good)
  "passwordStrengthCheck": true // default: true
}
```

`uplodah` はログイン用パスワードと API パスワードの両方を SALT 付きハッシュとして保持するため、平文パスワードはディスク上に保存されません。
ただし、HTTPS (TLS) を使用しない場合は `Authorization` ヘッダに平文の API パスワードが含まれるため、盗聴される危険があります。
信頼できるローカルネットワークの外へ公開する場合は、通信を HTTPS で保護してください。

---

## リバースプロキシとの相互運用性

サーバーは、リバースプロキシの背後での実行を想定しています。
たとえば、`https://files.example.com/uplodah` という公開 URL でエンドポイントを配信し、内部では別ポートの Node.js サーバーとして動かす構成です。

### URL の解決

サーバーは次の優先順位で公開 URL を解決します：

1. 固定ベース URL：`--base-url` または `baseUrl`
2. `Forwarded` ヘッダ
3. `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port`
4. 通常の `Host` ヘッダ

また、サブパス配信を行う場合は次のどちらかでパスプレフィックスを解決できます：

- `baseUrl` にパスを含める
- `X-Forwarded-Path` ヘッダを送る

最も確実なのは `baseUrl` を固定する方法です：

```bash
uplodah --base-url https://files.example.com/uplodah
```

この場合の公開 URL は次のようになります：

- Web UI: `https://files.example.com/uplodah/`
- ファイル一覧 API: `https://files.example.com/uplodah/api/files`
- ダウンロード API: `https://files.example.com/uplodah/api/files/report.txt`

信頼するプロキシを明示したい場合は、`trustedProxies` を構成できます：

```bash
uplodah --trusted-proxies "10.0.0.10,10.0.0.11"
```

環境変数でも同じ内容を指定できます：

```bash
export UPLODAH_BASE_URL=https://files.example.com/uplodah
export UPLODAH_TRUSTED_PROXIES=10.0.0.10,10.0.0.11
export UPLODAH_CONFIG_FILE=/srv/uplodah/config.json
export UPLODAH_STORAGE_DIR=/srv/uplodah/storage
export UPLODAH_MAX_UPLOAD_SIZE_MB=500
```

---

## Dockerの使用

Dockerイメージは複数のアーキテクチャで利用可能です：

- `linux/amd64` (x86_64)
- `linux/arm64` (aarch64)

イメージをプルする際、Dockerは自動的にプラットフォームに適したアーキテクチャを選択します。

### クイックスタート

次のような永続化のためのディレクトリを構成したとします（推奨）:

```
docker-instance/
├── data/
│   └── config.json
└── storage/
    └── (アップロード済みファイル群)
```

次のようにして実行します:

```bash
# 最新バージョンをプルして実行
docker run -d -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  kekyo/uplodah:latest

# またはDocker Composeで
cat > docker-compose.yml << EOF
version: '3'
services:
  uplodah:
    image: kekyo/uplodah:latest
    ports:
      - "5968:5968"
    volumes:
      - ./data:/data
      - ./storage:/storage
    environment:
      - UPLODAH_BASE_URL=http://localhost:5968
EOF

docker-compose up -d
```

`uplodah` は以下で利用可能になります：

- Web UI: `http://localhost:5968/`
- ファイル一覧 API: `http://localhost:5968/api/files`
- アップロード API: `http://localhost:5968/api/upload/<file-name>`
- ダウンロード API: `http://localhost:5968/api/files/<file-name>`
- ヘルスチェック: `http://localhost:5968/health`

### パーミッション要件

Dockerコンテナはセキュリティのため `uplodah` ユーザー（UID 1001）として実行されます。
マウントするディレクトリには、このユーザーがファイルを読み書きできるよう適切なパーミッションを設定する必要があります。

**マウントディレクトリに適切なパーミッションを設定：**

```bash
# ディレクトリが存在しない場合は作成
mkdir -p ./data ./storage

# UID 1001（コンテナ内のuplodahユーザー）に所有権を設定
sudo chown -R 1001:1001 ./data ./storage
```

**重要**: 適切なパーミッションが設定されていない場合、以下の操作で `Permission denied` エラーが発生します：

- アップロード先ディレクトリの作成
- `/storage` へのアップロードファイル書き込み
- `/storage` 内の有効期限切れファイル削除
- `/data/config.json` の読み取り

### 基本的な使用方法

```bash
# デフォルト設定で実行（ポート5968、設定と保存先はマウントボリュームを使用）
docker run -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  kekyo/uplodah:latest

# 公開ベースURLを固定して実行
docker run -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  -e UPLODAH_BASE_URL=https://files.example.com/uplodah \
  kekyo/uplodah:latest
```

環境変数やコマンドラインオプションを使用しても設定を変更できますが、最も簡単に設定を行うには、`config.json` を使用するのが良いでしょう。

Docker imageにはマウントポイントが設定されているので、上記の例のように `/data` と `/storage` をマウントし、`/data/config.json` を配置することで、設定を柔軟に行うことが出来ます。以下に `config.json` の例を示します:

```json
{
  "port": 5968,
  "baseUrl": "http://localhost:5968",
  "realm": "Awesome uplodah",
  "logLevel": "info",
  "maxUploadSizeMb": 500,
  "storage": {
    "/": {},
    "/bropdox": {
      "expireSeconds": 86400
    },
    "/archive": {
      "readonly": true
    }
  }
}
```

注意: デフォルトのコンテナコマンドはすでに `--config-file /data/config.json --storage-dir /storage` を指定しています。
別のストレージディレクトリや設定ファイルパスを使いたい場合は、コンテナのコマンドラインを明示的に上書きしてください。

### ボリュームマウントと設定

- `/data`：`config.json` など、設定ファイルを配置する既定ディレクトリ
- `/storage`：アップロードファイルの既定保存先ディレクトリ

**デフォルトの動作**：Dockerイメージはデフォルトで `--config-file /data/config.json --storage-dir /storage` で実行されます。

**設定の優先順位**（優先度が高い順）：

1. カスタムコマンドライン引数（CMDを上書きする場合）
2. コマンドラインで固定されていない設定に対する環境変数（例：`UPLODAH_BASE_URL`）
3. `/data/config.json` から読み込まれる `config.json` の値
4. `uplodah` 本体の組み込みデフォルト値

### systemdによる自動起動例

systemdでコンテナを自動起動する方法は、様々な手法が考えられます。以下はPodmanを使用してsystemdサービスを構成する単純な例です。
これは、Podmanにquadletが導入される前に使用していた単純なサービスユニットファイルです。
これを配置してsystemdに認識させることで、`uplodah` を自動的に起動させることが出来ます:

`/etc/systemd/system/container-uplodah.service`:

```ini
# container-uplodah.service

[Unit]
Description=Podman container-uplodah.service
Documentation=man:podman-generate-systemd(1)
Wants=network-online.target
After=network-online.target
RequiresMountsFor=%t/containers

[Service]
Environment=PODMAN_SYSTEMD_UNIT=%n
Restart=always
RestartSec=30
TimeoutStopSec=70
ExecStart=/usr/bin/podman run \
        --cidfile=%t/%n.ctr-id \
        --cgroups=no-conmon \
        --rm \
        --sdnotify=conmon \
        --replace \
        -d \
        -p 5968:5968 \
        --name uplodah \
        -v /export/data:/data -v /export/storage:/storage docker.io/kekyo/uplodah:latest
ExecStop=/usr/bin/podman stop \
        --ignore -t 10 \
        --cidfile=%t/%n.ctr-id
ExecStopPost=/usr/bin/podman rm \
        -f \
        --ignore -t 10 \
        --cidfile=%t/%n.ctr-id
Type=notify
NotifyAccess=all

[Install]
WantedBy=default.target
```

---

## Dockerイメージのビルド (高度)

`uplodah` のDocker imageのビルドは、Podmanを使用しています。

### Podmanによるマルチプラットフォームビルド（推奨）

提供されているマルチプラットフォームビルドスクリプトを使用して、Podmanですべてのサポートされているアーキテクチャ用にビルド：

```bash
# すべてのプラットフォーム用にビルド（ローカルのみ、プッシュなし）
./build-docker-multiplatform.sh

# ビルドしてDocker Hubにプッシュ
./build-docker-multiplatform.sh --push

# 特定のプラットフォームのみビルド
./build-docker-multiplatform.sh --platforms linux/amd64,linux/arm64

# カスタムDocker Hubユーザー名でプッシュ
OCI_SERVER_USER=yourusername ./build-docker-multiplatform.sh --push

# 既存のマニフェストを検査
./build-docker-multiplatform.sh --inspect
```

**重要**：クロスプラットフォームビルドには、最初にQEMUエミュレーションを設定する必要があります：

```bash
# オプション1：QEMUコンテナを使用（推奨）
sudo podman run --rm --privileged docker.io/multiarch/qemu-user-static --reset -p yes

# オプション2：システムパッケージをインストール
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y qemu-user-static
# Fedora/RHEL:
sudo dnf install -y qemu-user-static

# QEMUが動作していることを確認：
podman run --rm --platform linux/arm64 alpine:latest uname -m
# 出力されるべき: aarch64
```

QEMUなしでは、ネイティブアーキテクチャ用にのみビルドできます。

---

## 備考

### ヘルスチェック

`/health` は次のような応答を返します：

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

## その他

このサーバープロジェクトは、 [nuget-server](https://github.com/kekyo/nuget-server/) の姉妹プロジェクトです。

## ライセンス

Under MIT.
