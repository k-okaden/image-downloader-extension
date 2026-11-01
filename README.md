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
- Saved files go to `Downloads/downloaded-images/`
  保存先は `ダウンロード/downloaded-images/`

## Install / インストール

1. Clone or download this repository / このリポジトリをクローンまたはダウンロード
2. Open `chrome://extensions` / `chrome://extensions` を開く
3. Turn on **Developer mode** / 「デベロッパーモード」をON
4. Click **Load unpacked** and select this folder / 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択

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
