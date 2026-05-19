// config.js
// ここでゲームの基本設定、設定1〜6の確率、使用するメディア素材のパスを定義します。

const CONFIG = {
  // --- 動作設定 ---
  currentSetting: 1, // 現在の設定 (1〜6)

  // --- メディア素材のパス ---
  // 後でご自身の素材（動画や画像）のファイル名に合わせて書き換えてください。
  media: {
    // 状態の背景動画/画像
    background_normal: "assets/videos/normal_bg.mp4", // 通常時の背景動画
    background_cz: "assets/videos/cz_bg.mp4",         // チャンスゾーンの背景動画
    background_at: "assets/videos/at_bg.mp4",         // AT中の背景動画
    background_battle: "assets/videos/battle_bg.mp4", // バトル中の背景動画

    // 特殊演出・カットイン画像
    cutin_rare: "assets/images/cutin_rare.png",       // レア役成立時のカットイン
    win_image: "assets/images/win.png",               // 勝利・確定時の画像
    lose_image: "assets/images/lose.png",             // 敗北時の画像

    // リール図柄画像 (必要に応じて)
    symbol_bell: "assets/images/bell.png",
    symbol_replay: "assets/images/replay.png",
    symbol_watermelon: "assets/images/watermelon.png",
    symbol_cherry: "assets/images/cherry.png",
    symbol_blank: "assets/images/blank.png",
  },

  // --- 確率・抽選設定 (分母の数値を指定) ---
  // 例: 65536の乱数の中で、当選する範囲を決めるなど（ここでは簡易的にパーセンテージや確率分母として設定します）
  probabilities: {
    rare_role: [35.0, 34.0, 33.0, 32.0, 30.0, 28.0],
    cz_entry_from_rare: [25, 27, 30, 32, 35, 40],
    at_entry_in_cz_defense: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5], // ~35% over 10G
    at_entry_in_cz_extermination: [5.0, 5.0, 5.0, 5.0, 5.0, 5.0], // ~57% over 15G
    st_battle_rate: [20, 20, 20, 20, 20, 20],
    st_win_rate: [76, 76, 76, 76, 76, 76], // Default ST win rate ~76%
},

  // --- ゲームシステム設定 ---
  system: {
    st_games: 25,
    ceiling_games: 1000,
}
};

// 設定値を取得するためのヘルパー関数
function getProbability(key) {
    const settingIndex = CONFIG.currentSetting - 1;
    if (CONFIG.probabilities[key]) {
        return CONFIG.probabilities[key][settingIndex];
    }
    return 0;
}
