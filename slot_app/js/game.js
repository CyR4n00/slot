// game.js
// スロットのメインロジック、状態遷移、リール制御

// --- 定数・列挙型 ---
const GAME_STATE = {
    NORMAL: "NORMAL",
    CZ: "CZ",
    AT: "AT",
    BATTLE: "BATTLE",
    KAMIOCHI: "KAMIOCHI" // 上位AT「神堕」
};

const SYMBOLS = {
    BLANK: "ハズレ",
    BELL: "ベル",
    REPLAY: "リプレイ",
    CHERRY: "チェリー",
    WATERMELON: "スイカ",
    RARE: "強レア役"
};

// --- グローバル変数 ---
let currentState = GAME_STATE.NORMAL;
let atGamesLeft = 0;
let czGamesLeft = 0;
let battleGamesLeft = 0;
let isReelSpinning = false;
let spinningReels = []; // [left, center, right] (true=spinning)
let currentRole = SYMBOLS.BLANK;

// クレジット・差枚数管理 (スマスロ機能)
let credit = 50;
let totalDiff = 0; // 差枚数 (有利区間管理)
let isComplete = false; // コンプリート機能発動フラグ

// 定数 (有利区間・コンプリート)
const ENDING_DIFF = 2400; // 有利区間完走ライン (簡易的に+2400枚)
const COMPLETE_DIFF = 19000; // コンプリート機能発動ライン

// DOMエレメント
const btnLever = document.getElementById("btn-lever");
const btnStops = [
    document.getElementById("btn-stop-left"),
    document.getElementById("btn-stop-center"),
    document.getElementById("btn-stop-right")
];
const stateDisplay = document.getElementById("state-display");
const gamesDisplay = document.getElementById("games-display");
const settingSelect = document.getElementById("setting-select");
const messageLog = document.getElementById("message-log");
const creditDisplay = document.getElementById("credit-display");
const payDisplay = document.getElementById("pay-display");
const diffDisplay = document.getElementById("diff-display");
const lampAt = document.getElementById("lamp-at");
const lampComplete = document.getElementById("lamp-complete");

const bgVideo = document.getElementById("bg-video");
const cutinLayer = document.getElementById("cutin-layer");
const cutinImage = document.getElementById("cutin-image");

// シンボル表示用 (簡易)
const reelElements = [
    [document.getElementById("symbol-left-top"), document.getElementById("symbol-left-mid"), document.getElementById("symbol-left-bot")],
    [document.getElementById("symbol-center-top"), document.getElementById("symbol-center-mid"), document.getElementById("symbol-center-bot")],
    [document.getElementById("symbol-right-top"), document.getElementById("symbol-right-mid"), document.getElementById("symbol-right-bot")]
];

// --- 初期化処理 ---
function init() {
    updateDisplay();
    logMessage("ゲーム起動完了 (設定" + CONFIG.currentSetting + ")");

    // イベントリスナー
    btnLever.addEventListener("click", onLeverOn);
    btnStops.forEach((btn, index) => {
        btn.addEventListener("click", () => onStop(index));
    });

    settingSelect.addEventListener("change", (e) => {
        CONFIG.currentSetting = parseInt(e.target.value);
        document.getElementById("setting-display").innerText = "設定: " + CONFIG.currentSetting;
        logMessage("設定変更: " + CONFIG.currentSetting);
    });

    // キーボード操作対応
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && !btnLever.disabled) {
            e.preventDefault();
            btnLever.click();
        }
        if (e.code === "KeyZ" && !btnStops[0].disabled) btnStops[0].click();
        if (e.code === "KeyX" && !btnStops[1].disabled) btnStops[1].click();
        if (e.code === "KeyC" && !btnStops[2].disabled) btnStops[2].click();
    });

    setMediaForState(currentState);
}

// --- 抽選ロジック ---
function lottery() {
    const rareProb = getProbability("rare_role"); // 例: 30.0 -> 1/30
    const rand = Math.random() * rareProb;

    if (rand < 1.0) {
        // レア役当選
        const subRand = Math.random();
        if(subRand < 0.2) return SYMBOLS.RARE; // 20%で強レア役
        if(subRand < 0.6) return SYMBOLS.CHERRY;
        return SYMBOLS.WATERMELON;
    } else {
        // 通常小役
        const subRand = Math.random();
        if (subRand < 0.15) return SYMBOLS.REPLAY;
        if (subRand < 0.4) return SYMBOLS.BELL;
        return SYMBOLS.BLANK;
    }
}

// --- 状態遷移ロジック ---
function processStateTransition(role) {
    // レア役かどうかの判定
    const isRare = (role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON || role === SYMBOLS.RARE);

    if (isRare) {
        logMessage(`レア役成立！(${role}) 抽選開始...`);
        showCutin("rare");
    }

    if (currentState === GAME_STATE.NORMAL) {
        // 通常時: レア役でCZまたはAT直撃抽選
        if (isRare) {
            const rand = Math.random() * 100; // 0〜100%
            const directAtProb = getProbability("at_direct_from_rare");
            const czProb = getProbability("cz_entry_from_rare");

            if (rand < directAtProb) {
                // AT直撃
                logMessage("!!! AT直撃当選 !!!");
                setTimeout(() => changeState(GAME_STATE.AT), 1000); // すぐに移行せず少し間を置く
            } else if (rand < directAtProb + czProb) {
                // CZ当選
                logMessage("CZ当選！");
                setTimeout(() => changeState(GAME_STATE.CZ), 1000);
            }
        }
    }
    else if (currentState === GAME_STATE.CZ) {
        // CZ中: 毎ゲームAT抽選 (レア役は確定レベル、通常小役でもチャンス)
        let hitProb = getProbability("at_entry_in_cz");
        if (isRare) hitProb = 100; // レア役はAT確定(ゴッドイーターの神機解放風)
        else if (role === SYMBOLS.REPLAY || role === SYMBOLS.BELL) hitProb *= 1.5; // 小役でチャンスアップ

        const rand = Math.random() * 100;
        if (rand < hitProb) {
            logMessage("CZ成功！ AT突入！！");
            showCutin("win");
            setTimeout(() => changeState(GAME_STATE.AT), 1000);
        }
    }
    else if (currentState === GAME_STATE.AT || currentState === GAME_STATE.KAMIOCHI) {
        // AT中 / 神堕中: レア役でゲーム数上乗せ
        if (isRare) {
            let addGames = 10;
            if (currentState === GAME_STATE.KAMIOCHI) {
                 addGames = 30; // 上位AT「神堕」なら上乗せ性能が大幅アップ
            }
            logMessage(`AT中レア役！ ${addGames}G 上乗せ！`);
            showCutin("rare");
            atGamesLeft += addGames;
        }
    }
    else if (currentState === GAME_STATE.BATTLE) {
        // バトル中: 継続ジャッジ。レア役で勝利書き換え
        let winProb = getProbability("battle_win_rate");
        if (isRare) {
            logMessage("バトル中レア役！ 勝利確定！");
            winProb = 100;
        }

        // レア役を引いたら強制的に勝利扱いにする（簡易処理）
        if (winProb >= 100) {
             logMessage("バトル勝利！！ AT継続");
             showCutin("win");
             // 以前が神堕だったかどうかを記録するフラグ（今回は簡易的にすべて通常のATに戻すか、フラグで分岐する。ここでは通常ATに戻る仕様とするが、完走後は強制的に神堕スタートとなる）
             setTimeout(() => changeState(GAME_STATE.AT), 1500);
        }
    }
}

// --- メディア制御 ---
function setMediaForState(state) {
    let videoSrc = "";
    switch(state) {
        case GAME_STATE.NORMAL: videoSrc = CONFIG.media.background_normal; break;
        case GAME_STATE.CZ: videoSrc = CONFIG.media.background_cz; break;
        case GAME_STATE.AT: videoSrc = CONFIG.media.background_at; break;
        case GAME_STATE.BATTLE: videoSrc = CONFIG.media.background_battle; break;
    }

    // 素材が設定されている場合はvideoタグのソースを更新
    if (videoSrc) {
        // 現在のsrcと異なる場合のみ更新
        if (!bgVideo.src.endsWith(videoSrc)) {
            bgVideo.src = videoSrc;
            bgVideo.play().catch(e => console.log("Video play was prevented (expected if no file exists yet)"));
        }
    }

    // 素材がない場合でも視覚的に分かるように背景色を変更（プレースホルダー用）
    if (state === GAME_STATE.NORMAL) bgVideo.style.backgroundColor = "#111";
    if (state === GAME_STATE.CZ) bgVideo.style.backgroundColor = "#005";
    if (state === GAME_STATE.AT) bgVideo.style.backgroundColor = "#500";
    if (state === GAME_STATE.KAMIOCHI) bgVideo.style.backgroundColor = "#ffd700"; // 神堕は黄金色
    if (state === GAME_STATE.BATTLE) bgVideo.style.backgroundColor = "#300";
}

function showCutin(type) {
    cutinLayer.classList.remove("hidden");
    if(type === "rare") cutinImage.src = CONFIG.media.cutin_rare;
    if(type === "win") cutinImage.src = CONFIG.media.win_image;
    if(type === "lose") cutinImage.src = CONFIG.media.lose_image;

    setTimeout(() => {
        cutinLayer.classList.add("hidden");
    }, 1500);
}

// --- リール・操作制御 ---
function onLeverOn() {
    if (isReelSpinning || isComplete) return;

    // メダル投入処理 (1プレイ3枚掛け)
    if (credit < 3) {
        credit = 50; // クレジットが足りない場合はオートチャージ
    }
    credit -= 3;
    totalDiff -= 3;

    payDisplay.innerText = "0"; // 払い出し表示リセット
    updateSegmentDisplay();

    // 抽選
    currentRole = lottery();
    logMessage(`レバーON: 成立役=[${currentRole}]`);

    // リール回転開始
    isReelSpinning = true;
    spinningReels = [true, true, true];
    btnLever.disabled = true;
    btnStops.forEach(btn => btn.disabled = false);

    // リールUI更新
    reelElements.forEach((reelStr, i) => {
        reelStr.forEach(symbol => {
            symbol.innerText = "回転中";
            symbol.classList.add("blur");
        });
    });

    // 演出抽選・状態遷移処理を呼び出し
    processStateTransition(currentRole);
    updateDisplay();
}

function onStop(reelIndex) {
    if (!spinningReels[reelIndex]) return;

    spinningReels[reelIndex] = false;
    btnStops[reelIndex].disabled = true;

    // 停止したリールにシンボルを描画 (簡易的に成立役を表示)
    // 実際のパチスロのように滑りや出目を制御する場合は複雑になるため、ここでは真ん中に成立役を表示
    reelElements[reelIndex].forEach(symbol => symbol.classList.remove("blur"));
    reelElements[reelIndex][0].innerText = "〇";
    reelElements[reelIndex][1].innerText = (reelIndex === 1) ? currentRole : "〇"; // 真ん中の中央に役名
    reelElements[reelIndex][2].innerText = "〇";

    // 全リール停止判定
    if (!spinningReels.includes(true)) {
        onAllReelsStopped();
    }
}

function onAllReelsStopped() {
    isReelSpinning = false;
    btnLever.disabled = false;

    // 払い出し処理
    let payout = 0;
    if (currentRole === SYMBOLS.BELL) payout = 10; // ベルは10枚
    else if (currentRole === SYMBOLS.CHERRY) payout = 2; // チェリーは2枚
    else if (currentRole === SYMBOLS.WATERMELON) payout = 5; // スイカは5枚
    else if (currentRole === SYMBOLS.RARE) payout = 10;
    else if (currentRole === SYMBOLS.REPLAY) {
        credit += 3; // リプレイは3枚返却 (実質減らない)
        totalDiff += 3;
    }

    if (payout > 0) {
        credit += payout;
        totalDiff += payout;
        payDisplay.innerText = payout;
    }

    updateSegmentDisplay();

    // コンプリート機能判定
    if (totalDiff >= COMPLETE_DIFF) {
        isComplete = true;
        logMessage("コンプリート機能発動！！ 稼働停止");
        changeState(GAME_STATE.NORMAL);
        btnLever.disabled = true;
        updateDisplay();
        return;
    }

    // 有利区間完走判定
    if (totalDiff >= ENDING_DIFF && (currentState === GAME_STATE.AT || currentState === GAME_STATE.KAMIOCHI)) {
        logMessage(`エンディング到達 (+${totalDiff}枚) -> ツラヌキ(神堕)へ！`);
        totalDiff = 0; // 差枚数リセット（有利区間リセット）
        showCutin("win");
        setTimeout(() => changeState(GAME_STATE.KAMIOCHI), 2000);
        return;
    }

    logMessage(`全リール停止: [${currentRole}]`);

    // ゲーム数減算など
    if (currentState === GAME_STATE.AT || currentState === GAME_STATE.KAMIOCHI) {
        atGamesLeft--;
        if (atGamesLeft <= 0) {
            logMessage("AT終了 -> バトルへ");
            changeState(GAME_STATE.BATTLE);
        }
    } else if (currentState === GAME_STATE.CZ) {
        czGamesLeft--;
        if (czGamesLeft <= 0) {
            logMessage("CZ終了 -> 通常へ");
            changeState(GAME_STATE.NORMAL);
        }
    } else if (currentState === GAME_STATE.BATTLE) {
        battleGamesLeft--;
        if (battleGamesLeft <= 0) {
             // バトル最終ゲームでの判定
             const winProb = getProbability("battle_win_rate");
             const rand = Math.random() * 100;
             if (rand < winProb) {
                 logMessage(`バトル勝利！(${winProb}%) -> AT継続`);
                 showCutin("win");
                 setTimeout(() => changeState(GAME_STATE.AT), 1500);
             } else {
                 // バトル敗北処理
                 logMessage("バトル敗北 -> 通常へ");
                 showCutin("lose");
                 changeState(GAME_STATE.NORMAL);
             }
        }
    }

    updateDisplay();
}

// --- ユーティリティ ---
function updateSegmentDisplay() {
    creditDisplay.innerText = credit;
    diffDisplay.innerText = totalDiff;

    if (isComplete) {
        lampComplete.classList.add("active-complete");
    } else {
        lampComplete.classList.remove("active-complete");
    }
}

function changeState(newState) {
    currentState = newState;
    setMediaForState(newState);

    if (newState === GAME_STATE.AT) {
        atGamesLeft = CONFIG.system.at_initial_games;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.KAMIOCHI) {
        atGamesLeft = CONFIG.system.at_initial_games * 2; // 神堕はATゲーム数が初期から多い等の恩恵
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.NORMAL || newState === GAME_STATE.CZ) {
        lampAt.classList.remove("active-at");
    }

    if (newState === GAME_STATE.CZ) czGamesLeft = CONFIG.system.cz_games;
    if (newState === GAME_STATE.BATTLE) battleGamesLeft = CONFIG.system.battle_games;

    updateDisplay();
}

function updateDisplay() {
    let stateText = currentState;
    let gamesText = "G: --";

    stateDisplay.className = ""; // クラスリセット
    gamesDisplay.className = "";

    switch(currentState) {
        case GAME_STATE.NORMAL:
            stateDisplay.classList.add("neon-text-green");
            stateText = "通常";
            break;
        case GAME_STATE.CZ:
            stateDisplay.classList.add("neon-text-yellow");
            stateText = "CZ中";
            gamesText = `残り: ${czGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-yellow");
            break;
        case GAME_STATE.AT:
            stateDisplay.classList.add("neon-text-red");
            stateText = "AT中!!";
            gamesText = `残り: ${atGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-red");
            break;
        case GAME_STATE.KAMIOCHI:
            stateDisplay.classList.add("neon-text-rainbow");
            stateText = "神堕 !!";
            gamesText = `残り: ${atGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-rainbow");
            break;
        case GAME_STATE.BATTLE:
            stateDisplay.style.color = "#ff0000";
            stateText = "継続バトル!!";
            gamesText = `残り: ${battleGamesLeft} G`;
            break;
    }

    stateDisplay.innerText = stateText;
    gamesDisplay.innerText = gamesText;
}

function logMessage(msg) {
    messageLog.innerText = msg;
    console.log(msg);
}

// 起動
window.onload = init;
