# uplodah

シンプルでモダンな汎用ファイルアップロード/ダウンロードサーバー実装

![uplodah](./images/uplodah-120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/uplodah.svg)](https://www.npmjs.com/package/uplodah)
[![Docker Image Version](https://img.shields.io/docker/v/kekyo/uplodah.svg?label=docker)](https://hub.docker.com/r/kekyo/uplodah)

---

[(English is here)](./README.md)

(Document still under construction!)

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
- リバースプロキシとサブパス配信をサポート
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

アップロードされたファイルは、そのファイルと同じ場所に `metadata.json` ファイルが配置されます。
現在のバージョンでは、このファイルは中身が常に `"{}"` となっていて、具体的な情報が格納されていませんが、
このファイルが配置されていないと、そのファイルは認識されないことに注意して下さい。

`storage` ルールを使わない場合、同じファイル名ごとに履歴ディレクトリが作られます：

```
storage/
└── report.txt/
    ├── 20260406_203040_123/
    │   ├── metadata.json
    │   └── report.txt
    └── 20260406_204512_918/
        ├── metadata.json
        └── report.txt
```

`storage` ルールを構成した場合は、内部管理用のレイアウトに切り替わります：

```
storage/
└── .uplodah/
    └── groups/
        ├── root/
        │   └── report.txt/
        │       └── 20260406_203040_123/
        │           ├── metadata.json
        │           └── report.txt
        └── tree/
            └── dropbox/
                └── report.txt/
                    └── 20260406_204512_918/
                        ├── metadata.json
                        └── report.txt
```

`uploadId` は `YYYYMMDD_HHmmss_SSS` 形式のタイムスタンプを基準に生成され、同一ミリ秒で競合した場合は末尾に連番が付与されます。

### 仮想ディレクトリルール

`config.json` には、仮想ディレクトリのルールを定義することが出来ます。
この定義は存在しなくても良く、その場合は、クライアントが自由にサブディレクトリも含めてファイルを配置できます。

仮想ディレクトリ `storage: { ... }` を定義すると、その定義に存在しないサブディレクトリに配置することはできなくなります。
また、仮想ディレクトリ毎に機能設定を行うことが出来ます。

以下に `config.json` に指定する `storage` の例を示します:

```json
{
  "port": 5968,
  "storage": {      // 仮想ディレクトリを有効化
    "/": {},        // (ルートディレクトリ)
    "/foobar": {    // "/foobar"
      "expireSeconds": 86400  // ファイルの有効期限
    },
    "/archive": {   // "/archive"
      "readonly": true        // 読み取り専用
    },
    "/archive/incoming": {}   // "/archive/incoming"
  }
}
```

この例では：

- `/` は通常アップロード可能
- `/foobar` 配下のアップロードは 24 時間後に自動削除
- `/archive` 配下は読み取り専用
- `/archive/incoming` は `/archive` よりも具体的なルールなので再びアップロード可能

ルールの性質：

- キーは必ず `/` で始めます。
- バックスラッシュや `.` `..` は使用できません。
- 最も具体的に一致したディレクトリルールが適用されます。
- `storage` を定義した場合、未定義のディレクトリにはアップロードできません。
  ルートディレクトリにもファイルを配置できるようにするには、上記例のように明示的にルートディレクトリを含める必要があります。

### バックアップとリストア

データベースを使っていないため、単純にストレージディレクトリをバックアップすれば十分です：

```bash
cd /your/server/base/dir
tar -cf - ./storage | bzip2 -9 > backup-storage.tar.bz2
```

リストアは展開した後に同じ `storageDir` 設定で `uplodah` を起動するだけです。

ディレクトリ構造が破損した場合は、以下のことに注意して、同じ構造のディレクトリを構築すれば復元出来ます:

1. `<ファイル名>/<YYYYMMDD_HHmmss_fff[_num]>/` ディレクトリを作る。`_num`はオプションで、同じ日時で同時にファイルの配置がある場合の一意性を担保するための連番です。
2. 上記のディレクトリ内に `metadata.json` とファイルを配置する。

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
  "realm": "Awesome uplodah",
  "logLevel": "info",
  "trustedProxies": ["127.0.0.1", "::1"],
  "maxUploadSizeMb": 500,
  "storage": {
    "/": {},
    "/dropbox": {
      "expireSeconds": 86400
    },
    "/archive": {
      "readonly": true
    }
  }
}
```

すべてのフィールドはオプションです。必要なものだけを上書きしてください。

`storageDir` の相対パスは `config.json` を含むディレクトリから解決されます。

### 設定リファレンステーブル

すべての設定は **CLI > 環境変数 > config.json > デフォルト** の優先順位で解決されます。

| CLIオプション                 | 環境変数                        | config.jsonキー | 説明                                                   | 有効な値                                   | デフォルト            |
| :---------------------------- | :------------------------------ | :-------------- | :----------------------------------------------------- | :----------------------------------------- | :-------------------- |
| `-p, --port <port>`           | `UPLODAH_PORT`                  | `port`          | HTTP サーバーの待ち受けポート                          | 1-65535                                    | `5968`                |
| `-b, --base-url <url>`        | `UPLODAH_BASE_URL`              | `baseUrl`       | 外部公開 URL の固定ベース URL                          | 有効な URL                                 | 自動解決              |
| `-d, --storage-dir <dir>`     | `UPLODAH_STORAGE_DIR`           | `storageDir`    | ストレージルートディレクトリ                           | 有効なパス                                 | `./storage`           |
| `-c, --config-file <path>`    | `UPLODAH_CONFIG_FILE`           | N/A             | 設定ファイルのパス                                     | 有効なパス                                 | `./config.json`       |
| `-r, --realm <realm>`         | `UPLODAH_REALM`                 | `realm`         | UI タイトルおよびサーバー表示名                        | 文字列                                     | `uplodah [version]`   |
| `-l, --log-level <level>`     | `UPLODAH_LOG_LEVEL`             | `logLevel`      | ログ出力レベル                                         | `debug`, `info`, `warn`, `error`, `ignore` | `info`                |
| `--trusted-proxies <ips>`     | `UPLODAH_TRUSTED_PROXIES`       | `trustedProxies`| 信頼するプロキシ IP のカンマ区切りリスト               | IP アドレスのリスト                        | なし                  |
| `--max-upload-size-mb <size>` | `UPLODAH_MAX_UPLOAD_SIZE_MB`    | `maxUploadSizeMb`| 最大アップロードサイズ (MB)                            | 1-10000                                    | `100`                 |
| N/A                           | N/A                             | `storage`       | 仮想ディレクトリごとの保存ポリシー                     | オブジェクト                               | 未設定                |

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

## 備考

### 認証について

現在の `uplodah` は認証機能を実装していません。公開ネットワークで利用する場合は、リバースプロキシやゲートウェイ側で Basic 認証、OIDC、IP 制限などを追加してください。

### ヘルスチェック

`/health` は次のような応答を返します：

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### UI について

UI ビルドが見つからない環境では、ルート `/` の Web UI は無効になりますが、アップロード・一覧・ダウンロードなどの API ルートは引き続き利用できます。

## その他

このサーバープロジェクトは、 [nuget-server](https://github.com/kekyo/nuget-server/) の姉妹プロジェクトです。 

## ライセンス

Under MIT.
