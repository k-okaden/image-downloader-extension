# Image Download Buttons

A small Chrome extension (Manifest V3) that adds a ⬇️ button to every image on the page. Click the button to save that image.

ページ上のすべての画像に ⬇️ ボタンを表示し、クリックでその画像を保存できる Chrome 拡張機能です。

## Features / 機能

- Adds a download button to every sufficiently large image (24px or larger)
  十分な大きさ(24px以上)の画像すべてにボタンを表示
- Works with `<img>` tags **and** CSS `background-image` elements
  `<img>` タグと CSS の `background-image` の両方に対応
- Follows dynamic pages (SPA navigation, pagination, modals, infinite scroll) without a reload
  ページ再読み込みなしで画像が切り替わるサイト(SPA、ページ送り、モーダル、無限スクロール)にも追従
- **Focus download mode** (v0.2): turn on the toggle at the top right of the page, then press `D` to save the largest image currently visible on screen
  **集中ダウンロードモード**(v0.2): ページ右上のトグルをONにすると、`D` キーで画面内に見えている一番大きい画像を保存。ON/OFFは全タブ共通で記憶され、入力欄での入力中は反応しません
- **Continuous download mode** (v0.3): a separate `連続DL` toggle below the focus toggle. Turn it on and click `◀ 開始` or `開始 ▶` to save every large image on screen, press ← / → to go to the next set, and repeat. It stops when no new images appear (the end), or when you press `Esc`, click `停止`, or turn the toggle off
  **連続ダウンロードモード**(v0.3): 集中DLの下にある `連続DL` トグルで独立してON/OFF。ONにして `◀ 開始` / `開始 ▶` を押すと、画面内の大きい画像(3枚・6枚など)を全部保存 → ←/→キーで次へ、を繰り返します。新しい画像が出てこなくなったら(最後まで行ったら)自動で停止。`Esc` キー・`停止` ボタン・トグルOFFでも止まります。キーでページごと切り替わるサイトでも、同じタブ内なら続きから再開します
- Saved files go to `Downloads/downloaded-images/`
  保存先は `ダウンロード/downloaded-images/`

## Install / インストール

1. Clone or download this repository / このリポジトリをクローンまたはダウンロード
2. Open `chrome://extensions` / `chrome://extensions` を開く
3. Turn on **Developer mode** / 「デベロッパーモード」をON
4. Click **Load unpacked** and select this folder / 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択

## If a save dialog appears for every image / 1枚ごとに保存ダイアログが出る場合

The extension already saves without a dialog, but Chrome's own setting overrides it. Turn off **"Ask where to save each file before downloading"** at `chrome://settings/downloads` (this applies to all downloads in Chrome).

拡張機能側はダイアログなしで保存する設定になっていますが、Chrome本体の設定が優先されます。`chrome://settings/downloads` の **「ダウンロード前に各ファイルの保存場所を確認する」** をOFFにしてください(Chromeのすべてのダウンロードに適用されます)。

## Debugging / デバッグ

Set `DEBUG = true` at the top of `content.js` to show a small badge with the number of detected images and to log scan results to the console.

`content.js` 冒頭の `DEBUG` を `true` にすると、検出件数のバッジ表示とConsoleログが有効になります。

## Notes / 注意事項

- **Respect copyright and each website's terms of use.** You are responsible for what you download and how you use it. Do not use this tool to bypass paywalls, access controls, or other restrictions set by a site.
  **著作権と各サイトの利用規約を守ってください。** 保存した画像の扱いは利用者の責任です。有料コンテンツの回避やアクセス制限の迂回には使用しないでください。
- This extension runs on all pages (`<all_urls>`) so that it can add buttons to images. It does not collect or transmit any data.
  すべてのページで動作しますが、データの収集・送信は行いません。
- Provided "as is" without warranty. See [LICENSE](LICENSE).

## License

[MIT](LICENSE)
