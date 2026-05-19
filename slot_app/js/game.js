// game.js
// スロットのメインロジック、状態遷移、リール制御

// --- 定数・列挙型 ---
const GAME_STATE = {
    NORMAL: "NORMAL",
    CZ: "CZ",
    AT: "AT",
    BATTLE: "BATTLE",
    SUPER_AT: "SUPER_AT", // 上位AT (generic or specific)
    SUPER_AT_HANNIBAL: "SUPER_AT_HANNIBAL", // 上位AT: 逆襲のハンニバル
    SUPER_AT_ARIMA: "SUPER_AT_ARIMA", // 上位AT: 有馬ジャッジメント
    KAMIOCHI: "KAMIOCHI", // プレミアム上位AT「神堕」
    ADDON_ZONE: "ADDON_ZONE", // 上乗せ特化ゾーン (Overkill)
    UPPER_CHALLENGE: "UPPER_CHALLENGE" // 上位AT挑戦
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
let addonGamesLeft = 0; // 上乗せ特化ゾーン残りG数
let challengeGamesLeft = 0; // 上位AT挑戦残りG数
let overkillPendingGames = 0; // CZやバトル勝利時の余剰ゲーム数などを加算する
let hasChallengedUpperAt = false; // 1000枚突破で一度だけ挑戦するためのフラグ
let isReelSpinning = false;
let spinningReels = []; // [left, center, right] (true=spinning)
let currentRole = SYMBOLS.BLANK;

// クレジット・差枚数管理 (スマスロ機能)
let credit = 50;
let betAmount = 0; // 現在のベット数
let totalDiff = 0; // 差枚数 (有利区間管理)
let isComplete = false; // コンプリート機能発動フラグ

// 定数 (有利区間・コンプリート)
const ENDING_DIFF = 2400; // 有利区間完走ライン (簡易的に+2400枚)
const COMPLETE_DIFF = 19000; // コンプリート機能発動ライン

// DOMエレメント
const btnLever = document.getElementById("btn-lever");
const btnMaxBet = document.getElementById("btn-maxbet");
const btnPush = document.getElementById("btn-push");
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
    btnMaxBet.addEventListener("click", onMaxBet);
    btnPush.addEventListener("click", onPush);
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
        if (e.code === "ArrowUp" && !btnMaxBet.disabled) {
            e.preventDefault();
            btnMaxBet.click();
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
    const isRare = (role === SYMBOLS.RARE || role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON);

    if (currentState === GAME_STATE.NORMAL) {
        if (isRare) {
            const atProb = getProbability("at_direct_from_rare");
            if (Math.random() * 100 < atProb) {
                logMessage("通常時からAT直撃！ => 上乗せ特化ゾーンへ");
                showCutin("win");
                setTimeout(() => changeState(GAME_STATE.ADDON_ZONE), 1500);
                return;
            }

            const czProb = getProbability("cz_entry_from_rare");
            if (Math.random() * 100 < czProb) {
                logMessage("CZ当選！");
                showCutin("rare");
                setTimeout(() => changeState(GAME_STATE.CZ), 1500);
            } else {
                showCutin("rare");
            }
        }
    }
    else if (currentState === GAME_STATE.CZ) {
        let winProb = getProbability("at_entry_in_cz");
        if (isRare) winProb += 50;

        if (Math.random() * 100 < winProb) {
            logMessage("CZ成功！ AT確定 => 上乗せ特化ゾーンへ");
            showCutin("win");
            // CZの残りゲーム数をoverkillとしてATのゲーム数などに還元する仕様も可能
            if (czGamesLeft > 0) {
                logMessage(`Overkill! CZ残り${czGamesLeft}Gを特化ゾーンのG数に上乗せ！`);
                overkillPendingGames = czGamesLeft;
            }
            setTimeout(() => {
                changeState(GAME_STATE.ADDON_ZONE);
                addonGamesLeft += overkillPendingGames;
                overkillPendingGames = 0;
            }, 1500);
        } else if (isRare) {
            showCutin("rare");
        }
    }
    else if (currentState === GAME_STATE.AT || currentState === GAME_STATE.SUPER_AT || currentState === GAME_STATE.SUPER_AT_HANNIBAL || currentState === GAME_STATE.SUPER_AT_ARIMA || currentState === GAME_STATE.KAMIOCHI) {
        if (isRare) {
            const addGames = (role === SYMBOLS.RARE) ? 30 : 10;
            logMessage(`AT中レア役！ ${addGames}G 上乗せ！`);
            showCutin("rare");
            atGamesLeft += addGames;
        }

        // 1000枚突破で上位AT挑戦機能 (1回のみ)
        if (totalDiff >= 1000 && !hasChallengedUpperAt && (currentState === GAME_STATE.AT)) {
            logMessage("1000枚突破！ 上位ATへの挑戦権獲得！");
            hasChallengedUpperAt = true;
            setTimeout(() => changeState(GAME_STATE.UPPER_CHALLENGE), 1500);
        }
    }
    else if (currentState === GAME_STATE.BATTLE) {
        let winProb = getProbability("battle_win_rate");
        if (isRare) {
            logMessage("バトル中レア役！ 勝利確定！");
            winProb = 100;
        }

        if (winProb >= 100) {
             logMessage("バトル勝利！！ 特化ゾーンを経由してATへ");
             showCutin("win");
             if (battleGamesLeft > 1) {
                 logMessage(`Overkill! バトル残り${battleGamesLeft - 1}Gを特化ゾーンのG数に上乗せ！`);
                 overkillPendingGames = battleGamesLeft - 1;
             }
             setTimeout(() => {
                 changeState(GAME_STATE.ADDON_ZONE);
                 addonGamesLeft += overkillPendingGames;
                 overkillPendingGames = 0;
             }, 1500);
        }
    }
    else if (currentState === GAME_STATE.ADDON_ZONE) {
        // 特化ゾーン中の上乗せ抽選
        let addGames = 0;
        if (role === SYMBOLS.BELL) addGames = 5;
        else if (isRare) addGames = (role === SYMBOLS.RARE) ? 50 : 20;

        if (addGames > 0) {
            logMessage(`特化ゾーン: ${addGames}G 上乗せ！`);
            atGamesLeft += addGames; // 事前にATゲーム数に足しておく
            showCutin("rare");
        }
    }
    else if (currentState === GAME_STATE.UPPER_CHALLENGE) {
        // 上位AT挑戦中の抽選 (レア役で成功など)
        if (isRare) {
            logMessage("上位AT挑戦成功！！");
            showCutin("win");

            // どちらの上位ATに行くかランダム（ハンニバル or 有馬）
            setTimeout(() => {
                const nextAt = (Math.random() < 0.5) ? GAME_STATE.SUPER_AT_HANNIBAL : GAME_STATE.SUPER_AT_ARIMA;
                changeState(nextAt);
            }, 1500);

            // 成功した場合は挑戦ゲーム数を0にして終了を早める
            challengeGamesLeft = 0;
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
        // 特化ゾーンや上位ATなどに専用背景があればここに追加可能
    }

    // 素材が設定されている場合はvideoタグのソースを更新
    if (videoSrc) {
        if (!bgVideo.src.endsWith(videoSrc)) {
            bgVideo.src = videoSrc;
            bgVideo.play().catch(e => console.log("Video play was prevented"));
        }
    }

    // 視覚的に分かるように背景色を変更
    if (state === GAME_STATE.NORMAL) bgVideo.style.backgroundColor = "#111";
    if (state === GAME_STATE.CZ) bgVideo.style.backgroundColor = "#005";
    if (state === GAME_STATE.AT) bgVideo.style.backgroundColor = "#500";
    if (state === GAME_STATE.SUPER_AT || state === GAME_STATE.SUPER_AT_HANNIBAL || state === GAME_STATE.SUPER_AT_ARIMA) bgVideo.style.backgroundColor = "#800080";
    if (state === GAME_STATE.KAMIOCHI) bgVideo.style.backgroundColor = "#ffd700";
    if (state === GAME_STATE.BATTLE) bgVideo.style.backgroundColor = "#300";
    if (state === GAME_STATE.ADDON_ZONE) bgVideo.style.backgroundColor = "#008080"; // 特化ゾーン
    if (state === GAME_STATE.UPPER_CHALLENGE) bgVideo.style.backgroundColor = "#b22222"; // 挑戦
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
function onMaxBet() {
    if (isReelSpinning || isComplete || betAmount === 3) return;

    if (credit < 3) {
        credit += 50; // クレジットが足りない場合はオートチャージ
    }

    // 3枚BET
    let betDiff = 3 - betAmount;
    credit -= betDiff;
    totalDiff -= betDiff;
    betAmount = 3;

    payDisplay.innerText = "0";
    btnMaxBet.disabled = true;
    btnLever.disabled = false; // ベット完了でレバーON可能になる

    updateSegmentDisplay();
    logMessage("MAX BET完了 (3枚)");
}

function onPush() {
    // PUSHボタンが押された時の演出用（現状はダミーログとアニメーション効果）
    logMessage("PUSHボタン押下！");
    // ここにカットインや特殊SEの再生などを後付け可能
}

function onLeverOn() {
    if (isReelSpinning || isComplete || betAmount < 3) return;

    // 抽選
    currentRole = lottery();
    logMessage(`レバーON: 成立役=[${currentRole}]`);

    // リール回転開始
    isReelSpinning = true;
    betAmount = 0; // ベット枚数リセット
    spinningReels = [true, true, true];

    btnLever.disabled = true;
    btnMaxBet.disabled = true; // 回転中はBET不可
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

    btnMaxBet.disabled = false;

    let payout = 0;
    if (currentRole === SYMBOLS.BELL) payout = 10;
    else if (currentRole === SYMBOLS.CHERRY) payout = 2;
    else if (currentRole === SYMBOLS.WATERMELON) payout = 5;
    else if (currentRole === SYMBOLS.RARE) payout = 10;
    else if (currentRole === SYMBOLS.REPLAY) {
        credit += 3;
        totalDiff += 3;
    }

    if (payout > 0) {
        credit += payout;
        totalDiff += payout;
        payDisplay.innerText = payout;
    }

    updateSegmentDisplay();

    if (totalDiff >= COMPLETE_DIFF) {
        isComplete = true;
        logMessage("コンプリート機能発動！！ 稼働停止");
        changeState(GAME_STATE.NORMAL);
        btnLever.disabled = true;
        updateDisplay();
        return;
    }

    if (totalDiff >= ENDING_DIFF && (currentState === GAME_STATE.AT || currentState === GAME_STATE.SUPER_AT || currentState === GAME_STATE.SUPER_AT_HANNIBAL || currentState === GAME_STATE.SUPER_AT_ARIMA || currentState === GAME_STATE.KAMIOCHI)) {
        totalDiff = 0;

        if (Math.random() < 0.5) {
            logMessage(`エンディング到達！ 50%を射止めて「神堕」へ！！`);
            showCutin("win");
            setTimeout(() => changeState(GAME_STATE.KAMIOCHI), 2000);
        } else {
            logMessage(`エンディング到達！ 「上位AT」へ！`);
            showCutin("win");
            setTimeout(() => changeState(GAME_STATE.SUPER_AT_HANNIBAL), 2000);
        }
        return;
    }

    logMessage(`全リール停止: [${currentRole}]`);

    if (currentState === GAME_STATE.AT || currentState === GAME_STATE.SUPER_AT || currentState === GAME_STATE.SUPER_AT_HANNIBAL || currentState === GAME_STATE.SUPER_AT_ARIMA || currentState === GAME_STATE.KAMIOCHI) {
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
             const winProb = getProbability("battle_win_rate");
             const rand = Math.random() * 100;
             if (rand < winProb) {
                 logMessage(`バトル勝利！(${winProb}%) -> 特化ゾーンへ`);
                 showCutin("win");
                 setTimeout(() => changeState(GAME_STATE.ADDON_ZONE), 1500);
             } else {
                 logMessage("バトル敗北 -> 通常へ");
                 showCutin("lose");
                 changeState(GAME_STATE.NORMAL);
             }
        }
    } else if (currentState === GAME_STATE.ADDON_ZONE) {
        addonGamesLeft--;
        if (addonGamesLeft <= 0) {
            logMessage("特化ゾーン終了 -> ATへ");
            // すでにatGamesLeftに上乗せ分は加算されているので、状態をATに戻すだけ
            changeState(GAME_STATE.AT);
        }
    } else if (currentState === GAME_STATE.UPPER_CHALLENGE) {
        if (challengeGamesLeft > 0) challengeGamesLeft--;
        if (challengeGamesLeft <= 0) {
            logMessage("上位AT挑戦終了 -> 通常ATへ復帰");
            changeState(GAME_STATE.AT);
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
        // もし直前に上乗せ特化ゾーンから来たなどでゲーム数がすでにある場合は上書きしないか、加算する
        // 今回は初期ゲーム数を付与（すでに持っている場合は維持または加算。ここでは初期値セット）
        if (atGamesLeft <= 0) atGamesLeft = CONFIG.system.at_initial_games;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.SUPER_AT || newState === GAME_STATE.SUPER_AT_HANNIBAL || newState === GAME_STATE.SUPER_AT_ARIMA) {
        if (atGamesLeft <= 0) atGamesLeft = CONFIG.system.at_initial_games * 1.5;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.KAMIOCHI) {
        if (atGamesLeft <= 0) atGamesLeft = CONFIG.system.at_initial_games * 2;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.NORMAL || newState === GAME_STATE.CZ) {
        lampAt.classList.remove("active-at");
    }

    if (newState === GAME_STATE.CZ) czGamesLeft = CONFIG.system.cz_games;
    if (newState === GAME_STATE.BATTLE) battleGamesLeft = CONFIG.system.battle_games;
    if (newState === GAME_STATE.ADDON_ZONE) addonGamesLeft = CONFIG.system.addon_games;
    if (newState === GAME_STATE.UPPER_CHALLENGE) challengeGamesLeft = CONFIG.system.challenge_games;

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
        case GAME_STATE.SUPER_AT:
        case GAME_STATE.SUPER_AT_HANNIBAL:
        case GAME_STATE.SUPER_AT_ARIMA:
            stateDisplay.classList.add("neon-text-purple");
            if (currentState === GAME_STATE.SUPER_AT_HANNIBAL) stateText = "上位AT (逆襲のハンニバル)";
            else if (currentState === GAME_STATE.SUPER_AT_ARIMA) stateText = "上位AT (有馬ジャッジメント)";
            else stateText = "上位AT!!";
            gamesText = `残り: ${atGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-purple");
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
        case GAME_STATE.ADDON_ZONE:
            stateDisplay.classList.add("neon-text-rainbow");
            stateText = "上乗せ特化ゾーン!";
            gamesText = `残り: ${addonGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-rainbow");
            break;
        case GAME_STATE.UPPER_CHALLENGE:
            stateDisplay.classList.add("neon-text-purple");
            stateText = "上位AT挑戦中!";
            gamesText = `残り: ${challengeGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-purple");
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
