# plan1 特定版 URL の衝突と同時アップロード時の ID 重複

`uplodah` はアップロードのたびにバージョンを識別する `uploadId` を発行し、最新版の URL と、そのとき保存した特定版の URL を返す。タグ `1.3.0`（`6b68c1e88a53cd8ae8a4bf262948c951575f3ec4`）では、特定版の URL が別のファイルを返す条件と、同時アップロードが同じ `uploadId` で保存される条件を確認した。どちらもソースを静的に調べた結果であり、実行時の再現と運用環境での発生状況は未確認である。[ダウンロードの仕様][download-spec]・[アップロード成功時の応答][response]

## アップロード時のパス検査

アップロード API は受け取った公開パスをデコードする。保存処理は前後のスラッシュを取り除き、途中の空の要素、`.`、`..`、バックスラッシュを含む要素を拒否する。書き込む前に、対象ディレクトリへの保存を許す `store` 権限も確認する。保存領域に外部を指すシンボリックリンクがない通常の Linux 環境では、公開パスの親ディレクトリ参照による保存ルート外への書き込み経路は見つからなかった。[アップロード受付][upload]・[パスの検査][path]・[保存権限の確認][permissions]

## 発行済みの特定版 URL が別のファイルを返す

特定版の URL はファイルの公開パスの末尾に `uploadId` を加えた形で、アップロード応答の `Location` ヘッダーにも入る。ダウンロード時はまず URL 全体を一つの公開パスとして解釈し、そのファイルの最新版を探す。最新版が見つからない場合に初めて末尾を `uploadId` として特定版を探す。[URL の生成][urls]・[ダウンロード先の決定][resolve]

サブディレクトリへのアップロードを許す `storage` ルールがあり、その場所への保存権限を持つ利用者がいると、あるファイルの特定版 URL と別のファイルの最新版 URL が重なり得る。この場合、元のデータがディスクに残っていても、配布済みの特定版 URL は別のファイルを返す。`storage` ルールを設定しない既定構成では、アップロード先がルート直下のファイル名に限られるため、この URL の衝突は起きない。[保存先の設定と既定動作][storage-rules]・[ディレクトリの判定][directories]

## 同じ公開パスへの同時アップロードで ID が重なる

`uploadId` はミリ秒単位の時刻を基に決め、同じ ID のディレクトリがすでにあれば末尾に連番を付ける。ID を選ぶ処理はディレクトリの存在を調べるだけで、作成はその後の保存処理で行う。その際、同名のディレクトリがすでにあっても書き込みを続ける。[ID の仕様][id-spec]・[ID の採番][allocate]・[ディレクトリの作成と保存][write]

同じ公開パスへの二つのアップロードが同一ミリ秒に重なると、どちらも同じ ID を空きと判断し得る。両方がそのディレクトリにデータとメタデータを書き込むと、各アップロードの内容を後から個別に取得できなくなる。この競合は既定のルート直下へのアップロードでも起こり得る。

## 問題解消の完了条件

- 元のデータが保存されている間は、許可されたサブディレクトリに別のファイルが追加されても、発行済みの特定版 URL から当初の内容を取得できる。最新版の URL はその公開パスの最新版を返す。
- 同じ公開パスへ同一ミリ秒に二つのアップロードが成功した場合、それぞれに異なる `uploadId` が返り、各 ID に対応する元のデータとメタデータを取得できる。

[download-spec]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/README_ja.md#L219-L234
[response]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/routes/api/upload/index.ts#L121-L137
[upload]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/routes/api/upload/index.ts#L95-L119
[path]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L365-L392
[permissions]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L578-L600
[urls]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L726-L741
[resolve]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/routes/api/files/index.ts#L615-L650
[storage-rules]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/README_ja.md#L299-L305
[directories]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L534-L560
[id-spec]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/README_ja.md#L297
[allocate]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L1147-L1161
[write]: https://github.com/kekyo/uplodah/blob/6b68c1e88a53cd8ae8a4bf262948c951575f3ec4/src/services/storageService.ts#L1278-L1296
