# オリジナル スマスロアプリ (素材入れ替え版)

このアプリは、ブラウザで動くパチスロ（スマスロ）風のゲームです。
ゴッドイーターや東京喰種のようなゲームフロー（通常時 → CZ → AT → バトル継続）の土台を備えています。

## 遊び方
1. `index.html` をブラウザ（Google ChromeやSafariなど）で開きます。
2. 左下のプルダウンから「設定(1〜6)」を選びます（設定が高いほど当たりやすくなります）。
3. 「レバーON (Space)」ボタンを押すか、キーボードのスペースキーを押してリールを回します。
4. 「左(Z)」「中(X)」「右(C)」ボタン、または対応するキーボードを押してリールを止めます。

## 素材（画像・動画）の差し替え方法

ご自身で用意したお友達の顔写真や動画を使って、ゲーム内の演出を変更することができます！

### 1. 素材をフォルダに入れる
以下のフォルダに、あなたの用意した画像や動画ファイルを入れてください。
- 画像ファイル: `slot_app/assets/images/`
- 動画ファイル: `slot_app/assets/videos/`

### 2. 設定ファイル (`js/config.js`) を書き換える
`slot_app/js/config.js` をメモ帳などのテキストエディタで開きます。
前半部分に `media` という項目があります。ここにご自身で入れたファイルの名前を書き込んでください。

```javascript
  media: {
    // 状態の背景動画/画像 (例：通常時の背景動画を normal_bg.mp4 にした場合)
    background_normal: "assets/videos/normal_bg.mp4",
    background_cz: "assets/videos/cz_bg.mp4",
    background_at: "assets/videos/at_bg.mp4",
    background_battle: "assets/videos/battle_bg.mp4",

    // 特殊演出・カットイン画像 (例：友達の顔画像を friends_face.png にした場合)
    cutin_rare: "assets/images/friends_face.png",
    win_image: "assets/images/win_face.png",
    lose_image: "assets/images/lose_face.png",
    // ...
```

※ファイルの拡張子（`.mp4`, `.png`, `.jpg` など）が合っているか確認してください。
指定したファイルがない場合は、代わりに背景色が変化するようになっています。

### 3. 当たり確率やゲーム数の変更（上級者向け）
同じく `config.js` の `probabilities`（確率）や `system`（ゲーム数）の数値を変更することで、「すぐ当たる超甘口設定」や「ATが100ゲーム続く」といったカスタマイズも可能です。
