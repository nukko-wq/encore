最高！CRUDまで通ったなら、次は**「同一のURL正規化ロジック」＋「NodeでのCheerio抽出」＋「キャッシュ（link_previews）」**を一気に入れるのが最短で安定します。以下の順で進めれば OK です。



実装ステップ（順番どおり）

依存関係を入れる
cheerio / @mozilla/readability / jsdom / iconv-lite を追加します（Node 抽出＋日本語サイトの文字化け対策）。



共有の URL 正規化モジュールを作る（Edge/Node/Client 共通）
lib/url-normalization.ts に normalizeUrl / validateNormalization / makeAbsoluteUrl を実装。

役割：ホスト名の小文字化、デフォルトポートの除去、フラグメント削除、トラッキングパラメータの一括除去、クエリキーのソート、末尾スラッシュ統一。

makeAbsoluteUrl は <base href> にも対応して相対→絶対を安全に解決。
→ これをフロントのフォーム送信時とサーバ抽出時の両方で必ず使うのがコツ。



Node ランタイムの抽出 API を作る（重処理は Node で）
app/api/preview/route.ts を export const runtime = 'nodejs' で作成し、以下を実装：

POST { url } を受け取る

（可能なら）SSRFガードで URL を検証 → fetch で HTML 取得

cheerio で title/description/og:image/favicons/siteName を抽出

画像とアイコンは makeAbsoluteUrl で絶対 URL 化

description が空なら Readability で本文の先頭をUnicode安全にトリミングして補う

JSON で { success, data, source:'node' } を返す
※ 実装方針は「Edgeは薄い処理／Nodeで本処理」が基本（Vercel Hobby で堅実）。



link_previews テーブルを用意（キャッシュ）

カラム例：url(normalized), title, description, image, favicon, site_name, source, status, fetched_at, revalidate_at, retry_count …

url には正規化済み URLを保存（ユニーク）。TTL は revalidate_at で管理。

取得成功なら status='success'、一部だけ取れたら partial、失敗時は failed としておくと運用しやすい。



メタデータ統合サービスを作る（フロントからはこれだけ叩く）
lib/services/metadata/index.ts に MetadataService.extractMetadata(url) を実装：

URLを正規化（Edge 経由の /api/preview/normalize を挟んでも良い／失敗時はローカル正規化にフォールバック）

/api/preview/cache-check（Node）でキャッシュ存在＆TTLを見る

キャッシュ無し or 期限切れ → /api/preview（Node）で抽出

失敗したら外部API（Microlink）へオプションでフォールバック（後段階）

link_previews に保存して返す
この“段階的フォールバック”まで雛形があるので、それに乗せるのが最短です。



ブックマーク保存フローと接続

既存の createBookmark 内で URL を正規化して保存しつつ、非同期で MetadataService.extractMetadata を走らせて link_previews を更新。

UI はまずサーバ返却の素データ→ 後からキャッシュ更新を反映（楽）。



フロント側でも同じ正規化を適用

BookmarkForm 提交時に normalizeUrl を使う（クライアントとサーバの正規化を同一実装にするのが最重要）。



実装時のチェックリスト（短距離ラン）

 yarn add cheerio @mozilla/readability jsdom iconv-lite（＋必要な型）



 lib/url-normalization.ts を作成（Client/Server/Extensionで共通使用）



 app/api/preview/route.ts（Node）で抽出＆Readability フォールバック 



 link_previews 作成・ユニーク制約・TTL（revalidate_at）運用 



 MetadataService.extractMetadata で 正規化→キャッシュ→Node抽出→保存の直列化 



 BookmarkForm で normalize を適用（差し戻し対策） 



気をつけること（落とし穴まとめ）

同一正規化の徹底：Client と Server で微妙に違う正規化をすると重複やキャッシュミスが起きます。必ず同一実装を共有。



Node で重処理：Cheerio/Readability/文字コード判定は Edge ではなく Node で。Vercel Hobby だと特に安定します。



画像/アイコンの選定：og:image:secure_url > og:image(サイズあり) > twitter:image > apple-touch-icon > icon(SVG優先) のようにHTTPS と解像度を優先。data: スキームは除外。



相対URLの絶対化：<base href> があるページは相対解決を誤りやすい。makeAbsoluteUrl を必ず通す。



文字化け対策：iconv-lite で Shift_JIS/EUC-JP 等に対応。Content-Type と <meta charset> の不一致に備え、再デコードのフォールバックを持つと堅い。



SSRF と大型レスポンス：プライベートIP/localhost/危険ポートは弾く、Content-Type: text/html のみ許可、リダイレクト回数・本文サイズに上限を。（最初は最低限でもOK、後で強化）



TTL/再取得ポリシー：revalidate_at を設けて期限切れだけ再取得。失敗は指数バックオフで粘り過ぎない。



外部APIは後段階：Microlink 等は明示的にフラグで有効化＆レート制限/ログを入れてから使う。

