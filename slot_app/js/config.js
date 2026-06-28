// config.js
// ここでゲームの基本設定、設定1〜6の確率、使用するメディア素材のパスを定義します。

const CONFIG = {
  // --- 動作設定 ---
  currentSetting: 1, // 現在の設定 (1〜6)

  // --- メディア素材のパス ---
  // 後でご自身の素材（動画や画像）のファイル名に合わせて書き換えてください。
  media: {
    // ------------------------------------
    // 【通常時のステージ背景動画】 (常時ループ再生)
    // ------------------------------------
    bg_normal_base: "assets/videos/bg_stage_base.mp4",     // デフォルトステージ (エントランス等)
    bg_normal_high: "assets/videos/bg_stage_high.mp4",     // 高確示唆ステージ (カフェ等)
    bg_normal_ultra: "assets/videos/bg_stage_ultra.mp4",   // 超高確/前兆ステージ (作戦区域・鎮魂の灰寺など熱い状態)

    // ------------------------------------
    // 【特殊状態の背景動画】 (常時ループ再生)
    // ------------------------------------
    bg_cz_defense: "assets/videos/bg_cz_defense.mp4",      // CZ: アラガミ防衛戦
    bg_cz_exterminate: "assets/videos/bg_cz_exterminate.mp4",// CZ: 殲滅モード
    bg_at_story: "assets/videos/bg_at_story.mp4",          // AT: ストーリーパート (メダルを増やす区間)
    bg_at_st: "assets/videos/bg_at_st.mp4",                // AT: アラガミ交戦 (ST区間)
    bg_upper_at: "assets/videos/bg_upper_at.mp4",          // 上位AT: 逆鱗ハンニバル / 漆黒の捕喰者
    bg_kamiochi: "assets/videos/bg_kamiochi.mp4",          // プレミアムAT: 神堕

    // ------------------------------------
    // 【イベント・アクション動画】 (一瞬だけ再生される動画)
    // ------------------------------------
    event_rare: "assets/videos/event_rare.mp4",           // レア役成立時 (ドヤ顔、叫びなど)
    event_win: "assets/videos/event_win.mp4",             // バトル勝利・AT確定時 (大喜び、派手な演出)
    event_lose: "assets/videos/event_lose.mp4",           // バトル敗北時 (がっかり、悔しがる)
    event_devour: "assets/videos/event_devour.mp4",       // 神を喰らえ演出 (上乗せ枚数決定の瞬間のド派手な動画)

    // リール図柄画像 (必要に応じて)
    symbol_bell: "assets/images/bell.png",
    symbol_replay: "assets/images/replay.png",
    symbol_watermelon: "assets/images/watermelon.png",
    symbol_cherry: "assets/images/cherry.png",
    symbol_blank: "assets/images/blank.png",

    // ------------------------------------
    // 【音声・BGM・SE】 (後からご自身のmp3等に差し替えてください)
    // ------------------------------------
    bgm_normal: "assets/audio/bgm_normal.mp3",           // 通常時のBGM
    bgm_cz: "assets/audio/bgm_cz.mp3",                   // CZ中のBGM
    bgm_at_story: "assets/audio/bgm_at_story.mp3",       // ATストーリーパートBGM
    bgm_at_st: "assets/audio/bgm_at_st.mp3",             // AT(ST)中のBGM
    bgm_upper_at: "assets/audio/bgm_upper_at.mp3",       // 上位ATのBGM
    bgm_kamiochi: "assets/audio/bgm_kamiochi.mp3",       // 神堕BGM

    se_bet: "assets/audio/se_bet.mp3",                   // MAX BET音
    se_lever: "assets/audio/se_lever.mp3",               // レバーON音
    se_stop: "assets/audio/se_stop.mp3",                 // 停止ボタン音
    se_push: "assets/audio/se_push.mp3",                 // PUSHボタン音
    se_win: "assets/audio/se_win.mp3",                   // 当たり・勝利音
    se_devour: "assets/audio/se_devour.mp3",             // 神を喰らえ音
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
