// game.js
// スロットのメインロジック、状態遷移、リール制御

// --- 定数・列挙型 ---
const GAME_STATE = {
    NORMAL: "NORMAL",
    CZ_DEFENSE: "CZ_DEFENSE", // アラガミ防衛戦
    CZ_EXTERMINATION: "CZ_EXTERMINATION", // 殲滅モード
    AT_STORY: "AT_STORY", // ストーリーパート
    AT_ST: "AT_ST", // アラガミ交戦 (ST)
    DEVOUR: "DEVOUR", // 神を喰らえ (枚数決定)
    AT_SUPER_HANNIBAL: "AT_SUPER_HANNIBAL", // 逆鱗ハンニバル討伐戦
    RESURRECTION_GATE: "RESURRECTION_GATE", // リザレクションゲート
    BLACK_PREDATOR: "BLACK_PREDATOR", // 漆黒の捕喰者 (上位ST)
    KAMIOCHI: "KAMIOCHI", // 神堕 (プレミアムAT)
};

const NORMAL_STAGE = {
    BASE: "BASE",
    HIGH: "HIGH",
    ULTRA: "ULTRA", // 前兆
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
let normalGames = 0; // 通常時消化ゲーム数 (天井管理)
let currentNormalStage = NORMAL_STAGE.BASE;
let czGamesLeft = 0;
let atStoryMedalsLeft = 0; // ストーリーパート残り枚数 (差枚数管理)
let atStGamesLeft = 0; // アラガミ交戦 (ST) 残りゲーム数
let hasReachedReverseScale = false; // 1000枚突破で逆鱗ハンニバル討伐戦へのフラグ
let currentATTotalMedals = 0; // 1回のATでの総獲得枚数
let currentSTTarget = null; // ST中の現在のアラガミ
let overkillPendingGames = 0; // Overkill用
let previousAtState = null; // 上位状態を維持するため

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
const eventVideoLayer = document.getElementById("event-video-layer");
const eventVideo = document.getElementById("event-video");

// シンボル表示用 (簡易)
const reelElements = [
    [document.getElementById("symbol-left-top"), document.getElementById("symbol-left-mid"), document.getElementById("symbol-left-bot")],
    [document.getElementById("symbol-center-top"), document.getElementById("symbol-center-mid"), document.getElementById("symbol-center-bot")],
    [document.getElementById("symbol-right-top"), document.getElementById("symbol-right-mid"), document.getElementById("symbol-right-bot")]
];

// --- 音声(Audio)オブジェクト管理 ---
const audioElements = {
    bgm: new Audio(),
    se: new Audio()
};
audioElements.bgm.loop = true; // BGMはループ再生

function playSE(src) {
    if (!src) return;
    const se = new Audio(src);
    se.play().catch(e => console.log("SE play prevented:", e));
}

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
    if (currentState === GAME_STATE.NORMAL) {
        normalGames++;

        // ステージ移行抽選 (ゲーム数やレア役で移行)
        if (normalGames % 100 === 0) {
            // ゾーン到達で前兆(ULTRA)へ
            currentNormalStage = NORMAL_STAGE.ULTRA;
            logMessage(`${normalGames}G ゾーン到達！ 前兆ステージへ移行`);
            updateDisplay(); // update visuals immediately
        } else if (role === SYMBOLS.RARE || role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON) {
            // レア役で高確(HIGH)へ
            if (currentNormalStage !== NORMAL_STAGE.ULTRA) {
                currentNormalStage = NORMAL_STAGE.HIGH;
                logMessage("レア役成立！ 高確ステージへ移行");
                playEventVideo("rare", 1500);
                setMediaForState(currentState);
                updateDisplay();
            }
        } else if (currentNormalStage !== NORMAL_STAGE.BASE && Math.random() < 0.05) {
            // 毎ゲーム5%で通常ステージに転落
            currentNormalStage = NORMAL_STAGE.BASE;
            setMediaForState(currentState);
            updateDisplay();
        }
        // 天井 (1000G)
        if (normalGames >= 1000) {
            logMessage("天井到達 (1000G) -> アラガミバースト(AT)へ");
            triggerAT();
            return;
        }

        // CZ抽選 (簡略化)
        if (role === SYMBOLS.RARE || role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON) {
            const czProb = getProbability("cz_entry_from_rare");
            if (Math.random() * 100 < czProb) {
                // CZ種別の振り分け (防衛戦 or 殲滅モード)
                if (Math.random() < 0.3) {
                    logMessage("殲滅モード(CZ)に当選！");
                    changeState(GAME_STATE.CZ_EXTERMINATION);
                } else {
                    logMessage("アラガミ防衛戦(CZ)に当選！");
                    changeState(GAME_STATE.CZ_DEFENSE);
                }
            }
        }
    } else if (currentState === GAME_STATE.CZ_DEFENSE || currentState === GAME_STATE.CZ_EXTERMINATION) {
        const atProb = (currentState === GAME_STATE.CZ_DEFENSE) ? getProbability("at_entry_in_cz_defense") : getProbability("at_entry_in_cz_extermination");

        // レア役は確率アップ
        let actualProb = atProb;
        if (role === SYMBOLS.RARE || role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON) {
             actualProb *= 3;
        }

        if (Math.random() * 100 < actualProb) {
            logMessage("CZ成功！ アラガミバースト(AT)へ！");
            showCutin("win");
            playSE(CONFIG.media.se_win);
            playEventVideo("win");
            setTimeout(() => triggerAT(), 1500);
        }
    } else if (currentState === GAME_STATE.AT_ST || currentState === GAME_STATE.BLACK_PREDATOR || currentState === GAME_STATE.AT_SUPER_HANNIBAL) {
        // ST中のバトル抽選
        let battleProb = getProbability("st_battle_rate");
        if (role === SYMBOLS.RARE || role === SYMBOLS.CHERRY || role === SYMBOLS.WATERMELON) {
             battleProb = 100; // レア役はバトル発展濃厚と仮定
        }

        if (Math.random() * 100 < battleProb) {
            // バトル発展 -> 勝率抽選 (簡略化して即時判定)
            const winRate = getProbability("st_win_rate");
            if (Math.random() * 100 < winRate) {
                logMessage("アラガミ撃破！！ -> 神を喰らえへ");
                if (atStGamesLeft > 0) {
                    overkillPendingGames += atStGamesLeft; // Overkill feature
                }
                previousAtState = currentState; // Remember the AT state
                showCutin("win");
                playSE(CONFIG.media.se_win);
                playEventVideo("win");
                setTimeout(() => changeState(GAME_STATE.DEVOUR), 1500);
                setTimeout(() => {
                    playSE(CONFIG.media.se_devour);
                    playEventVideo("devour", 3000);
                }, 1600);
            } else {
                logMessage("バトル敗北... ST継続");
            }
        }
    }
}

// --- メディア制御 ---
function setMediaForState(state) {
    let videoSrc = "";
    if (state === GAME_STATE.NORMAL) {
        if (currentNormalStage === NORMAL_STAGE.BASE) {
            bgVideo.style.backgroundColor = "#000";
            videoSrc = CONFIG.media.bg_normal_base;
        } else if (currentNormalStage === NORMAL_STAGE.HIGH) {
            bgVideo.style.backgroundColor = "#004"; // 青っぽく
            videoSrc = CONFIG.media.bg_normal_high;
        } else if (currentNormalStage === NORMAL_STAGE.ULTRA) {
            bgVideo.style.backgroundColor = "#400"; // 赤っぽく
            videoSrc = CONFIG.media.bg_normal_ultra;
        }
    }
    if (state === GAME_STATE.CZ_DEFENSE) {
        bgVideo.style.backgroundColor = "#550";
        videoSrc = CONFIG.media.bg_cz_defense;
    }
    if (state === GAME_STATE.CZ_EXTERMINATION) {
        bgVideo.style.backgroundColor = "#630";
        videoSrc = CONFIG.media.bg_cz_exterminate;
    }
    if (state === GAME_STATE.AT_STORY) {
        bgVideo.style.backgroundColor = "#500";
        videoSrc = CONFIG.media.bg_at_story;
    }
    if (state === GAME_STATE.AT_ST) {
        bgVideo.style.backgroundColor = "#800";
        videoSrc = CONFIG.media.bg_at_st;
    }
    if (state === GAME_STATE.DEVOUR) {
        bgVideo.style.backgroundColor = "#a0a";
        videoSrc = CONFIG.media.bg_at_story; // 神を喰らえ中は通常AT背景の上にイベント動画が乗るイメージ
    }
    if (state === GAME_STATE.AT_SUPER_HANNIBAL || state === GAME_STATE.BLACK_PREDATOR) {
        bgVideo.style.backgroundColor = "#202";
        videoSrc = CONFIG.media.bg_upper_at;
    }
    if (state === GAME_STATE.KAMIOCHI) {
        bgVideo.style.backgroundColor = "#f0f";
        videoSrc = CONFIG.media.bg_kamiochi;
    }

    // 素材が設定されている場合はvideoタグのソースを更新
    if (videoSrc) {
        if (!bgVideo.src.endsWith(videoSrc)) {
            bgVideo.src = videoSrc;
            bgVideo.play().catch(e => console.log("Video play was prevented"));
        }
    }

    // BGMの切り替え
    let bgmSrc = "";
    if (state === GAME_STATE.NORMAL) bgmSrc = CONFIG.media.bgm_normal;
    else if (state === GAME_STATE.CZ_DEFENSE || state === GAME_STATE.CZ_EXTERMINATION) bgmSrc = CONFIG.media.bgm_cz;
    else if (state === GAME_STATE.AT_STORY) bgmSrc = CONFIG.media.bgm_at_story;
    else if (state === GAME_STATE.AT_ST) bgmSrc = CONFIG.media.bgm_at_st;
    else if (state === GAME_STATE.AT_SUPER_HANNIBAL || state === GAME_STATE.BLACK_PREDATOR) bgmSrc = CONFIG.media.bgm_upper_at;
    else if (state === GAME_STATE.KAMIOCHI) bgmSrc = CONFIG.media.bgm_kamiochi;

    if (bgmSrc) {
        if (!audioElements.bgm.src.endsWith(bgmSrc)) {
            audioElements.bgm.src = bgmSrc;
            audioElements.bgm.play().catch(e => console.log("BGM play was prevented (user interaction required):", e));
        }
    } else {
        audioElements.bgm.pause();
    }
}


function playEventVideo(type, duration = 2000) {
    let src = "";
    if (type === "rare") src = CONFIG.media.event_rare;
    if (type === "win") src = CONFIG.media.event_win;
    if (type === "lose") src = CONFIG.media.event_lose;
    if (type === "devour") src = CONFIG.media.event_devour;

    if (!src) return;

    eventVideo.src = src;
    eventVideoLayer.classList.remove("hidden");
    eventVideo.play().catch(e => console.log("Event video play prevented"));

    // 一定時間後に隠す (本来は動画のendedイベントで隠すのが綺麗ですが、簡略化のため固定時間)
    setTimeout(() => {
        eventVideoLayer.classList.add("hidden");
        eventVideo.pause();
    }, duration);
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

    playSE(CONFIG.media.se_bet);

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
    playSE(CONFIG.media.se_push);
    logMessage("PUSHボタン押下！");
    // ここにカットインや特殊SEの再生などを後付け可能
}

function onLeverOn() {
    if (isReelSpinning || isComplete || betAmount < 3) return;

    playSE(CONFIG.media.se_lever);

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

    playSE(CONFIG.media.se_stop);

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
    if (currentRole === SYMBOLS.BELL) payout = (currentState === GAME_STATE.AT_STORY || currentState === GAME_STATE.KAMIOCHI) ? 15 : 10;
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
        if(currentState === GAME_STATE.AT_STORY || currentState === GAME_STATE.KAMIOCHI) {
             currentATTotalMedals += payout;
             atStoryMedalsLeft -= payout;
        }
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

    if (totalDiff >= ENDING_DIFF && (currentState.includes("AT_") || currentState === GAME_STATE.BLACK_PREDATOR || currentState === GAME_STATE.KAMIOCHI)) {
        totalDiff = 0;
        logMessage(`エンディング到達！ ツラヌキ要素発動！`);
        showCutin("win");
            playEventVideo("win");
        // ツラヌキ恩恵: 漆黒の捕喰者 or 神堕
        setTimeout(() => {
            if(Math.random() < 0.5) changeState(GAME_STATE.KAMIOCHI);
            else changeState(GAME_STATE.BLACK_PREDATOR);
        }, 2000);
        return;
    }

    logMessage(`全リール停止: [${currentRole}]`);

    if (currentState === GAME_STATE.AT_STORY) {
        if (atStoryMedalsLeft <= 0) {
            logMessage("ストーリーパート終了 -> アラガミ交戦(ST)へ");
            if (currentATTotalMedals >= 1000 && !hasReachedReverseScale) {
                hasReachedReverseScale = true;
                changeState(GAME_STATE.AT_SUPER_HANNIBAL);
            } else {
                changeState(GAME_STATE.AT_ST);
            }
        }
    } else if (currentState === GAME_STATE.AT_ST || currentState === GAME_STATE.BLACK_PREDATOR || currentState === GAME_STATE.AT_SUPER_HANNIBAL) {
        atStGamesLeft--;
        if (atStGamesLeft <= 0) {
            logMessage("STゲーム数消化...");
            if(currentState === GAME_STATE.AT_SUPER_HANNIBAL) {
                 logMessage("逆鱗ハンニバル討伐戦敗北 -> 通常へ");
                 changeState(GAME_STATE.NORMAL);
            } else {
                 logMessage("AT終了 -> 通常へ");
                 changeState(GAME_STATE.NORMAL);
            }
        }
    } else if (currentState === GAME_STATE.CZ_DEFENSE || currentState === GAME_STATE.CZ_EXTERMINATION) {
        czGamesLeft--;
        if (czGamesLeft <= 0) {
            logMessage("CZ終了 -> 通常へ");
            changeState(GAME_STATE.NORMAL);
        }
    } else if (currentState === GAME_STATE.DEVOUR) {
        // 1Gで上乗せ枚数を決定してストーリーパートへ
        let addMedals = 200 + Math.floor(Math.random() * 3) * 100; // 200~400枚

        // Overkill恩恵: 残りSTゲーム数 * 10枚 を上乗せ
        if (overkillPendingGames > 0) {
            const overkillBonus = overkillPendingGames * 10;
            addMedals += overkillBonus;
            logMessage(`Overkillボーナス！ +${overkillBonus}枚`);
            overkillPendingGames = 0; // 消費
        }
        atStoryMedalsLeft += addMedals;
        logMessage(`神を喰らえ！ +${addMedals}枚！ -> ストーリーパートへ`);

        if (previousAtState === GAME_STATE.BLACK_PREDATOR || previousAtState === GAME_STATE.KAMIOCHI || hasReachedReverseScale) {
            // 上位状態を維持
            changeState(previousAtState === GAME_STATE.KAMIOCHI ? GAME_STATE.KAMIOCHI : GAME_STATE.BLACK_PREDATOR);
        } else {
            changeState(GAME_STATE.AT_STORY);
        }
    } else if (currentState === GAME_STATE.RESURRECTION_GATE) {
        // リザレクションゲートは今回は簡略化してすぐ上位ATへ
        logMessage("リザレクションゲート突破！ 漆黒の捕喰者へ！");
        changeState(GAME_STATE.BLACK_PREDATOR);
    } else if (currentState === GAME_STATE.KAMIOCHI) {
        atStGamesLeft--;
        if(atStGamesLeft <= 0) {
             const success = Math.random() < 0.3; // 30%でループ
             if(success) {
                  logMessage("神堕ループ成功！ +510枚！");
                  atStoryMedalsLeft += 510;
                  atStGamesLeft = 4; // 4G STリセット
             } else {
                  logMessage("神堕終了 -> 通常へ");
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

function triggerAT() {
    currentATTotalMedals = 0;
    hasReachedReverseScale = false;
    atStoryMedalsLeft = 100; // 初回は100枚
    changeState(GAME_STATE.AT_STORY);
}

function changeState(newState) {
    if (newState === GAME_STATE.NORMAL) {
        normalGames = 0;
        currentNormalStage = NORMAL_STAGE.BASE;
    }

    currentState = newState;
    setMediaForState(newState);

    if (newState === GAME_STATE.AT_STORY) {
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.AT_ST) {
        atStGamesLeft = CONFIG.system.st_games;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.AT_SUPER_HANNIBAL) {
        atStGamesLeft = 50; // 逆鱗ハンニバルは50G
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.BLACK_PREDATOR) {
        atStGamesLeft = 25;
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.KAMIOCHI) {
        atStGamesLeft = 4; // 神堕は4G ST
        lampAt.classList.add("active-at");
    }
    else if (newState === GAME_STATE.NORMAL) {
        lampAt.classList.remove("active-at");
    }
    else if (newState === GAME_STATE.CZ_DEFENSE) {
        czGamesLeft = 10;
        lampAt.classList.remove("active-at");
    }
    else if (newState === GAME_STATE.CZ_EXTERMINATION) {
        czGamesLeft = 15;
        lampAt.classList.remove("active-at");
    }

    updateDisplay();
}

function updateDisplay() {
    let stateText = currentState;
    let gamesText = "G: --";

    stateDisplay.className = "";
    gamesDisplay.className = "";

    switch(currentState) {
        case GAME_STATE.NORMAL:
            if (currentNormalStage === NORMAL_STAGE.BASE) {
                stateDisplay.classList.add("neon-text-green");
                stateText = "通常 (エントランス)";
            } else if (currentNormalStage === NORMAL_STAGE.HIGH) {
                stateDisplay.classList.add("neon-text-blue");
                stateText = "高確 (カフェ)";
            } else if (currentNormalStage === NORMAL_STAGE.ULTRA) {
                stateDisplay.classList.add("neon-text-red");
                stateText = "前兆 (作戦区域)";
            }
            gamesText = `G: ${normalGames}`;
            break;
        case GAME_STATE.CZ_DEFENSE:
            stateDisplay.classList.add("neon-text-yellow");
            stateText = "アラガミ防衛戦";
            gamesText = `残り: ${czGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-yellow");
            break;
        case GAME_STATE.CZ_EXTERMINATION:
            stateDisplay.classList.add("neon-text-yellow");
            stateText = "殲滅モード";
            gamesText = `残り: ${czGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-yellow");
            break;
        case GAME_STATE.AT_STORY:
            stateDisplay.classList.add("neon-text-red");
            stateText = "ストーリーパート";
            gamesText = `残り: ${atStoryMedalsLeft} 枚`;
            gamesDisplay.classList.add("neon-text-red");
            break;
        case GAME_STATE.AT_ST:
            stateDisplay.classList.add("neon-text-red");
            stateText = "アラガミ交戦";
            gamesText = `残り: ${atStGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-red");
            break;
        case GAME_STATE.DEVOUR:
            stateDisplay.classList.add("neon-text-purple");
            stateText = "神を喰らえ";
            gamesText = "1G決着";
            gamesDisplay.classList.add("neon-text-purple");
            break;
        case GAME_STATE.AT_SUPER_HANNIBAL:
            stateDisplay.classList.add("neon-text-purple");
            stateText = "逆鱗ハンニバル討伐戦";
            gamesText = `残り: ${atStGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-purple");
            break;
        case GAME_STATE.RESURRECTION_GATE:
            stateDisplay.classList.add("neon-text-rainbow");
            stateText = "リザレクションゲート";
            gamesText = ` `;
            break;
        case GAME_STATE.BLACK_PREDATOR:
            stateDisplay.classList.add("neon-text-purple");
            stateText = "漆黒の捕喰者";
            gamesText = `残り: ${atStGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-purple");
            break;
        case GAME_STATE.KAMIOCHI:
            stateDisplay.classList.add("neon-text-rainbow");
            stateText = "神堕";
            gamesText = `残り: ${atStGamesLeft} G`;
            gamesDisplay.classList.add("neon-text-rainbow");
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
