const LANGUAGE_KEY = "bankingPortalLanguage";
const PROGRESS_KEY = "bankingPortalProgress";
const languages = { en: "EN", hi: "हि", kn: "ಕ" };
const phishingTopicVideos = {
  en: ["assets/videos/phishing-basics.mp4", "assets/videos/phishing-how-it-works.mp4", "assets/videos/phishing-types.mp4"],
  hi: ["assets/videos/phishing-basics-hi.mp4", "assets/videos/phishing-how-it-works-hi.mp4", "assets/videos/phishing-types-hi.mp4"],
  kn: ["assets/videos/phishing-basics-kn.mp4", "assets/videos/phishing-how-it-works-kn.mp4", "assets/videos/phishing-types-kn.mp4"]
};
const $ = selector => document.querySelector(selector);
const safeRead = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
};
const emptyProgress = { animations: [], activities: [], quizzes: [] };
let savedProgress = { ...emptyProgress, ...safeRead(PROGRESS_KEY, {}) };
let currentLanguage = localStorage.getItem(LANGUAGE_KEY) || "";
let selectedAnimation = null;
let selectedPhishingTopic = null;
let activeGame = null;
let gameState = {};
let activeQuiz = null;
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;
let fraudChallenge = null;
let challengeTimer = null;
let challengeSpeechToken = 0;

function challengeData() { return quizChallengeContent[currentLanguage]; }
function clearChallengeTimer() {
  if (challengeTimer !== null) clearTimeout(challengeTimer);
  challengeTimer = null;
}
function stopChallengeNarration() {
  challengeSpeechToken++;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (fraudChallenge) fraudChallenge.sceneNarrationPending = false;
}

function text(key) { return bankingContent[currentLanguage].ui[key] || key; }
function storeProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(savedProgress)); }
  catch { showToast("Progress could not be saved in this browser."); }
}
function navigate(page) {
  location.hash = page === "home" ? "home" : page;
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function applyLanguage() {
  const dictionary = bankingContent[currentLanguage].ui;
  if (fraudChallenge) stopChallengeNarration();
  if (activeQuiz) activeQuiz = bankingContent[currentLanguage].quizzes.find(quiz => quiz.id === activeQuiz.id);
  document.documentElement.lang = currentLanguage;
  document.title = dictionary.heroTitle;
  document.querySelectorAll("[data-i18n]").forEach(element => {
    const value = dictionary[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  $("#brandName").textContent = dictionary.heroTitle;
  $("#footerBrand").textContent = dictionary.heroTitle;
  $("#homeBrand").setAttribute("aria-label", dictionary.homeLabel);
  $("#mainNavigation").setAttribute("aria-label", dictionary.navigationLabel);
  $("#artCaption").textContent = dictionary.artCaption;
  $("#changeLanguage").textContent = `${languages[currentLanguage]} ▾`;
  $("#changeLanguage").setAttribute("aria-label", dictionary.chooseLanguage);
  $("#languageHeading").textContent = dictionary.chooseLanguage;
  $("#languageBrand").textContent = dictionary.heroTitle;
  $("#languageGate .language-panel > p:not(.eyebrow)").textContent = dictionary.languageHelp;
  renderAnimations();
  renderGames();
  renderQuizzes();
  renderProgress();
  if (fraudChallenge && fraudChallenge.view === "scenario" && fraudChallenge.narrationOn && !fraudChallenge.scenePaused) {
    const scenario = challengeData().scenarios[fraudChallenge.scenarioIndex];
    speakChallengeScene(scenario.scenes[fraudChallenge.sceneIndex].narration);
  }
}

function selectLanguage(language) {
  if (!bankingContent[language]) return;
  currentLanguage = language;
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* The selected language still applies for this session. */ }
  selectedAnimation = null;
  selectedPhishingTopic = null;
  applyLanguage();
  $("#languageGate").classList.add("hidden");
  showToast(text("languageChanged"));
}

function renderAnimations() {
  if (!currentLanguage) return;
  const content = bankingContent[currentLanguage];
  const host = $("#animationPage");
  if (selectedAnimation === null) {
    host.innerHTML = `<div class="animation-grid">${content.animations.map((lesson, index) => `<article class="learning-card"><span class="card-index">${String(index + 1).padStart(2, "0")}</span><div><h2>${escapeHTML(lesson.title)}</h2><p>${escapeHTML(lesson.situation)}</p></div><button class="outline-button" type="button" data-animation="${index}">${text("animationWatch")} →</button></article>`).join("")}</div>`;
    host.querySelectorAll("[data-animation]").forEach(button => button.addEventListener("click", () => {
      selectedAnimation = Number(button.dataset.animation);
      selectedPhishingTopic = null;
      renderAnimations();
    }));
    return;
  }
  const lesson = content.animations[selectedAnimation];
  if (lesson.subtopics) {
    renderPhishingTopic(host, lesson);
    return;
  }
  const videoMarkup = lesson.videoSrc
    ? `<video class="topic-video" controls preload="metadata"><source src="${escapeHTML(lesson.videoSrc)}">${text("videoUnsupported")}</video>`
    : `<div class="video-placeholder"><span aria-hidden="true">▶</span><strong>${text("videoComingSoon")}</strong><p>${text("videoAddHint")}</p></div>`;
  host.innerHTML = `<div class="lesson-player video-lesson"><button class="back-button" id="animationBack">← ${text("animationsTitle")}</button><div class="lesson-player-head"><span class="eyebrow">${escapeHTML(lesson.title)}</span></div><div class="video-frame">${videoMarkup}</div><div class="takeaway-panel"><h2>${text("takeaway")}</h2><p>${escapeHTML(lesson.protect)}</p><h3>${text("reporting")}</h3><p>${escapeHTML(lesson.report)}</p></div></div>`;
  host.querySelector("#animationBack").addEventListener("click", () => { selectedAnimation = null; renderAnimations(); });
  const video = host.querySelector(".topic-video");
  if (video) video.addEventListener("ended", () => {
    const id = `animation-${selectedAnimation}`;
    if (!savedProgress.animations.includes(id)) savedProgress.animations.push(id);
    storeProgress();
    renderProgress();
    showToast(text("lessonComplete"));
  });
}

function renderPhishingTopic(host, lesson) {
  const ui = bankingContent[currentLanguage].ui;
  if (selectedPhishingTopic === null) {
    host.innerHTML = `<div class="lesson-player phishing-lesson"><button class="back-button" id="animationBack">← ${text("animationsTitle")}</button><div class="section-title"><h2>${escapeHTML(lesson.title)}</h2><p class="page-description">${text("phishingOptionsIntro")}</p></div><div class="phishing-topic-grid">${lesson.subtopics.map((topic, index) => `<button class="phishing-topic-option" type="button" data-phishing-topic="${index}"><span class="card-index">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHTML(topic.title)}</strong><small>${escapeHTML(topic.summary)}</small></span><span class="phishing-topic-arrow" aria-hidden="true">→</span></button>`).join("")}</div></div>`;
    $("#animationBack").addEventListener("click", () => { selectedAnimation = null; renderAnimations(); });
    host.querySelectorAll("[data-phishing-topic]").forEach(button => button.addEventListener("click", () => {
      selectedPhishingTopic = Number(button.dataset.phishingTopic);
      renderAnimations();
    }));
    return;
  }

  const topic = lesson.subtopics[selectedPhishingTopic];
  if (!topic) {
    selectedPhishingTopic = null;
    renderPhishingTopic(host, lesson);
    return;
  }
  const videoSrc = phishingTopicVideos[currentLanguage][selectedPhishingTopic];
  host.innerHTML = `<div class="lesson-player phishing-lesson"><button class="back-button" id="phishingBack">${text("phishingBackOptions")}</button><article class="phishing-topic-detail"><h2>${escapeHTML(topic.title)}</h2><div class="video-frame"><video class="topic-video" controls preload="metadata"><source src="${escapeHTML(videoSrc)}">${text("videoUnsupported")}</video></div></article></div>`;
  $("#phishingBack").addEventListener("click", () => { selectedPhishingTopic = null; renderAnimations(); });
}

function renderGames() {
  if (!currentLanguage) return;
  const host = $("#gamePage");
  const content = bankingContent[currentLanguage];
  if (!activeGame) {
    host.innerHTML = `<p class="safety-notice">${text("safeNotice")}</p><div class="game-grid">${content.games.map(game => `<article class="learning-card game-card"><span class="game-symbol">${game.id === "message" ? "✉" : game.id === "upi" ? "₹" : "▣"}</span><h2>${escapeHTML(game.title)}</h2><p>${escapeHTML(game.description)}</p><button class="outline-button" type="button" data-game="${game.id}">${text("play")} →</button></article>`).join("")}</div>`;
    host.querySelectorAll("[data-game]").forEach(button => button.addEventListener("click", () => startGame(button.dataset.game)));
    return;
  }
  if (activeGame === "message") renderMessageGame(host);
  if (activeGame === "upi") renderPaymentGame(host);
  if (activeGame === "atm") renderAtmGame(host);
}

function startGame(id) {
  activeGame = id;
  gameState = { inspected: false, covered: false, cardTaken: false, ended: false, complete: false };
  renderGames();
}
function completeGame() {
  gameState.complete = true;
  if (!savedProgress.activities.includes(activeGame)) savedProgress.activities.push(activeGame);
  storeProgress();
  renderGames();
  renderProgress();
}
function renderMessageGame(host) {
  const ui = bankingContent[currentLanguage].ui;
  host.innerHTML = `<div class="activity-panel"><button class="back-button" id="gameBack">← ${ui.gamesTitle}</button><h2>${ui.gameMessageTitle}</h2><p>${ui.messageInstruction}</p><div class="simulated-message" id="bankMessage" draggable="true"><small>${ui.smsLabel} · ${ui.suspicious}</small><strong>BankSecure</strong><p>${bankingContent[currentLanguage].messageGame.body}</p><span>${ui.fakeLinkLabel}: ${ui.suspiciousDomain}</span></div><button class="verify-zone" id="verifyZone">${ui.verifyDrop}</button><div class="game-feedback ${gameState.inspected ? "" : "hidden"}" id="messageFeedback">${ui.messageFound}<br><strong>${ui.verifySource}</strong><button class="primary-button" id="messageComplete">${ui.gameDone}</button></div></div>`;
  $("#gameBack").addEventListener("click", exitGame);
  const message = $("#bankMessage"), zone = $("#verifyZone");
  message.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", "bank-message"));
  message.addEventListener("click", () => inspectMessage());
  zone.addEventListener("dragover", event => event.preventDefault());
  zone.addEventListener("drop", event => { event.preventDefault(); inspectMessage(); });
  zone.addEventListener("click", inspectMessage);
  const finish = $("#messageComplete");
  if (finish) finish.addEventListener("click", completeGame);
}
function inspectMessage() {
  gameState.inspected = true;
  renderGames();
}
function renderPaymentGame(host) {
  const ui = bankingContent[currentLanguage].ui;
  host.innerHTML = `<div class="activity-panel"><button class="back-button" id="gameBack">← ${ui.gamesTitle}</button><h2>${ui.gamePaymentTitle}</h2><p>${ui.paymentInstruction}</p><div class="payment-screen"><span>${ui.callerRequest}</span><strong>₹ 2,500.00</strong><small>${ui.refundRequest} · ${ui.unknownContact}</small><p>${ui.trainingOnly}</p><div class="payment-actions"><button class="outline-button" id="inspectPayment">${ui.paymentInspect}</button><button class="danger-button" id="declinePayment">${ui.paymentReject}</button></div></div><div class="game-feedback ${gameState.inspected ? "" : "hidden"}" id="paymentDetails">${ui.paymentScam}${gameState.declined ? `<button class="primary-button" id="paymentComplete">${ui.gameDone}</button>` : ""}</div></div>`;
  $("#gameBack").addEventListener("click", exitGame);
  $("#inspectPayment").addEventListener("click", () => { gameState.inspected = true; renderGames(); });
  const decline = $("#declinePayment");
  if (decline) decline.addEventListener("click", () => { gameState.inspected = true; gameState.declined = true; showToast(ui.paymentReject); renderGames(); });
  const finish = $("#paymentComplete");
  if (finish) finish.addEventListener("click", completeGame);
}
function renderAtmGame(host) {
  const ui = bankingContent[currentLanguage].ui;
  const ready = gameState.covered && gameState.cardTaken;
  host.innerHTML = `<div class="activity-panel"><button class="back-button" id="gameBack">← ${ui.gamesTitle}</button><h2>${ui.gameAtmTitle}</h2><p>${ui.atmInstruction}</p><div class="atm-screen"><div class="atm-display">${gameState.ended ? ui.atmComplete : "••••  ••••  ••••"}<small>${gameState.covered ? ui.atmCovered : ui.transactions} · ${gameState.cardTaken ? ui.atmCardTaken : ui.cardInSlot}</small></div><div class="atm-controls"><button class="outline-button" id="coverKeypad" ${gameState.covered ? "disabled" : ""}>${ui.atmCover}</button><button class="outline-button" id="takeCard" ${gameState.covered ? "" : "disabled"} ${gameState.cardTaken ? "disabled" : ""}>${ui.atmCard}</button><button class="primary-button" id="endAtm" ${ready ? "" : "disabled"}>${ui.atmEnd}</button></div></div><div class="game-feedback ${gameState.ended ? "" : "hidden"}" id="atmFeedback">${ui.atmComplete}<button class="primary-button" id="atmComplete">${ui.gameDone}</button></div></div>`;
  $("#gameBack").addEventListener("click", exitGame);
  $("#coverKeypad").addEventListener("click", () => { gameState.covered = true; renderGames(); });
  $("#takeCard").addEventListener("click", () => { gameState.cardTaken = true; renderGames(); });
  $("#endAtm").addEventListener("click", () => { gameState.ended = true; renderGames(); });
  const finish = $("#atmComplete");
  if (finish) finish.addEventListener("click", completeGame);
}
function exitGame() { activeGame = null; gameState = {}; renderGames(); }

function renderQuizzes() {
  if (!currentLanguage) return;
  const host = $("#quizPage"), content = bankingContent[currentLanguage];
  const challenge = challengeData();
  if (fraudChallenge) {
    renderFraudChallenge(host, challenge);
    return;
  }
  if (!activeQuiz) {
    const challengeDone = safeRead("bankingFraudChallengeProgress", null);
    host.innerHTML = `<section class="challenge-intro"><div class="challenge-intro-copy"><p class="eyebrow">${escapeHTML(challenge.ui.eyebrow)}</p><h2>${escapeHTML(challenge.ui.title)}</h2><p>${escapeHTML(challenge.ui.intro)}</p><button class="primary-button" type="button" id="startFraudChallenge">${escapeHTML(challengeDone ? challenge.ui.replayChallenge : challenge.ui.start)} <span aria-hidden="true">→</span></button></div><div class="challenge-intro-art" aria-hidden="true"><span class="intro-orbit orbit-one"></span><span class="intro-orbit orbit-two"></span><span class="intro-shield">✓</span><span class="intro-spark spark-one">✦</span><span class="intro-spark spark-two">✦</span></div></section><div class="challenge-section-heading"><div><p class="eyebrow">${escapeHTML(challenge.ui.eyebrow)}</p><h2>${escapeHTML(challenge.ui.segments)}</h2></div><span class="challenge-total">${Object.keys(challenge.questions).length} ${escapeHTML(challenge.ui.questions)}</span></div><div class="challenge-segments">${challenge.segments.map((segment, index) => {
      const done = challengeDone && challengeDone.segments && challengeDone.segments[segment.id];
      return `<article class="challenge-segment-card segment-${segment.id}"><div class="segment-card-top"><span class="segment-icon" aria-hidden="true">${segment.icon}</span><span class="segment-number">${String(index + 1).padStart(2, "0")}</span></div><h3>${escapeHTML(segment.title)}</h3><p>${escapeHTML(segment.description)}</p><div class="segment-card-footer"><span>${done ? escapeHTML(challenge.ui.completed) : `${segment.questionIds.length} ${escapeHTML(challenge.ui.questions)}`}</span><button class="outline-button" type="button" data-challenge-segment="${index}">${escapeHTML(challenge.ui.beginSegment)} →</button></div></article>`;
    }).join("")}</div><h2 class="legacy-quiz-heading">${escapeHTML(text("quizzesTitle"))}</h2><div class="quiz-grid">${content.quizzes.map(quiz => `<article class="learning-card"><span class="card-index">✓</span><h2>${escapeHTML(quiz.title)}</h2><p>${quiz.questions.length} ${text("questionCount")}</p><button class="outline-button" type="button" data-quiz="${quiz.id}">${text("play")} →</button></article>`).join("")}</div>`;
    $("#startFraudChallenge").addEventListener("click", () => startFraudChallenge(0));
    host.querySelectorAll("[data-challenge-segment]").forEach(button => button.addEventListener("click", () => startFraudChallenge(Number(button.dataset.challengeSegment))));
    host.querySelectorAll("[data-quiz]").forEach(button => button.addEventListener("click", () => startQuiz(button.dataset.quiz)));
    return;
  }
  const question = activeQuiz.questions[quizIndex];
  host.innerHTML = `<div class="activity-panel quiz-panel"><button class="back-button" id="quizBack">← ${text("quizzesTitle")}</button><div class="quiz-meta">${text("question")} ${quizIndex + 1} / ${activeQuiz.questions.length}</div><h2>${escapeHTML(question.prompt)}</h2><div class="answer-list">${question.options.map((option, index) => `<button class="answer-option ${quizAnswered && index === question.correct ? "answer-correct" : ""}" type="button" data-answer="${index}" ${quizAnswered ? "disabled" : ""}>${escapeHTML(option)}</button>`).join("")}</div><div class="game-feedback ${quizAnswered ? (gameState.answerCorrect ? "" : "feedback-caution") : "hidden"}" id="quizFeedback">${quizAnswered ? `<strong>${gameState.answerCorrect ? text("correct") : text("incorrect")}</strong><p>${escapeHTML(question.explanation)}</p><button class="primary-button" id="quizNext">${quizIndex === activeQuiz.questions.length - 1 ? text("quizFinish") : text("quizNext")}</button>` : ""}</div></div>`;
  $("#quizBack").addEventListener("click", exitQuiz);
  host.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => answerQuiz(Number(button.dataset.answer))));
  const next = $("#quizNext");
  if (next) next.addEventListener("click", nextQuiz);
}

function startFraudChallenge(segmentIndex) {
  clearChallengeTimer();
  stopChallengeNarration();
  fraudChallenge = {
    view: "segment",
    segmentIndex,
    scenarioIndex: 0,
    sceneIndex: 0,
    questionIndex: 0,
    selected: null,
    answered: false,
    results: {},
    completedSegments: {},
    narrationOn: false
  };
  enterFraudSegment(segmentIndex);
}

function enterFraudSegment(segmentIndex) {
  clearChallengeTimer();
  stopChallengeNarration();
  fraudChallenge.segmentIndex = segmentIndex;
  fraudChallenge.questionIndex = 0;
  fraudChallenge.selected = null;
  fraudChallenge.answered = false;
  if (segmentIndex === 0) {
    fraudChallenge.view = "scenario";
    fraudChallenge.scenarioIndex = 0;
    fraudChallenge.sceneIndex = 0;
    runChallengeScene();
  } else fraudChallenge.view = "questions";
  renderQuizzes();
}

function challengeQuestionCount(segment) {
  return segment.questionIds.filter(id => fraudChallenge.results[id] !== undefined).length;
}

function renderFraudChallenge(host, data) {
  if (fraudChallenge.view === "results") {
    renderChallengeResults(host, data);
    return;
  }
  if (fraudChallenge.view === "segment-complete") {
    const nextIndex = data.segments.findIndex(segment => !fraudChallenge.completedSegments[segment.id]);
    const nextText = nextIndex >= 0 ? data.segments[nextIndex].title : data.ui.resultTitle;
    const segment = data.segments[fraudChallenge.segmentIndex];
    const segmentCorrect = segment.questionIds.filter(id => fraudChallenge.results[id]).length;
    const segmentMessage = segmentCorrect === segment.questionIds.length ? data.ui.allCorrect : data.ui.encouragement;
    host.innerHTML = `<section class="activity-panel challenge-complete"><span class="complete-mark" aria-hidden="true">✓</span><p class="eyebrow">${escapeHTML(data.ui.completed)}</p><h2>${escapeHTML(segment.title)}</h2><p>${escapeHTML(segmentMessage)}</p><div class="challenge-control-row"><button class="secondary-button" type="button" id="challengeHome">${escapeHTML(data.ui.backToSegments)}</button><button class="primary-button" type="button" id="challengeNextSegment">${nextIndex < data.segments.length ? `${escapeHTML(nextText)} →` : escapeHTML(data.ui.resultTitle)}</button></div></section>`;
    $("#challengeHome").addEventListener("click", exitFraudChallenge);
    $("#challengeNextSegment").addEventListener("click", () => {
      if (nextIndex >= 0) enterFraudSegment(nextIndex);
      else {
        saveFraudChallengeResults(data);
        fraudChallenge.view = "results";
        renderQuizzes();
        renderProgress();
      }
    });
    return;
  }
  if (fraudChallenge.view === "scenario") {
    renderChallengeScenario(host, data);
    return;
  }
  renderChallengeQuestion(host, data);
}

function renderChallengeScenario(host, data) {
  const scenario = data.scenarios[fraudChallenge.scenarioIndex];
  const scene = scenario.scenes[fraudChallenge.sceneIndex];
  const ui = data.ui;
  const currentQuestion = scene.questionId ? data.questions[scene.questionId] : null;
  const paused = Boolean(currentQuestion && fraudChallenge.scenePaused);
  const sceneContent = challengeSceneMarkup(scenario, scene, ui);
  const sceneElapsed = Math.min(scene.duration, Math.max(0, Date.now() - (fraudChallenge.sceneStartedAt || Date.now())));
  host.innerHTML = `<section class="activity-panel challenge-player"><div class="challenge-player-top"><button class="back-button" type="button" id="challengeHome">${escapeHTML(ui.backToSegments)}</button><span class="challenge-scenario-label">${escapeHTML(ui.scenario)} ${fraudChallenge.scenarioIndex + 1} / ${data.scenarios.length}</span></div><div class="challenge-progress-track" role="progressbar" aria-label="${escapeHTML(ui.progress)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(((fraudChallenge.scenarioIndex + fraudChallenge.sceneIndex / scenario.scenes.length) / data.scenarios.length) * 100)}"><span style="width:${((fraudChallenge.scenarioIndex + fraudChallenge.sceneIndex / scenario.scenes.length) / data.scenarios.length) * 100}%"></span></div><div class="scenario-head"><div><p class="eyebrow">${escapeHTML(ui.scenario)} ${fraudChallenge.scenarioIndex + 1}</p><h2>${escapeHTML(scenario.title)}</h2></div><div class="scenario-controls"><button class="outline-button" type="button" id="toggleNarration" aria-pressed="${fraudChallenge.narrationOn}" ${paused ? "disabled" : ""}>${escapeHTML(fraudChallenge.narrationOn ? ui.mute : ui.unmute)}</button><button class="outline-button" type="button" id="replayScenario" ${paused ? "disabled" : ""}>${escapeHTML(ui.replay)}</button></div></div><div class="story-scene kind-${scenario.kind} ${fraudChallenge.scenePaused ? "scene-is-paused" : ""} ${fraudChallenge.sceneIndex === scenario.scenes.length - 1 ? "scene-is-safe" : ""}" id="storyScene" style="--scene-duration:${scene.duration}ms;--scene-elapsed:${sceneElapsed}ms">${sceneContent}<div class="story-scene-caption"><span>${escapeHTML(ui.scene)} ${fraudChallenge.sceneIndex + 1} / ${scenario.scenes.length}</span><p>${escapeHTML(scene.narration)}</p></div></div><div class="scene-dots" aria-label="${escapeHTML(ui.progress)}">${scenario.scenes.map((_, index) => `<span class="${index <= fraudChallenge.sceneIndex ? "active" : ""}"></span>`).join("")}</div><div class="challenge-scene-footer"><span>${escapeHTML(ui.pauseLabel)}</span><button class="danger-button" type="button" id="restartChallenge">${escapeHTML(ui.restart)}</button></div><div id="challengeQuestionSlot">${paused ? challengeQuestionMarkup(currentQuestion, ui, scene.questionId) : ""}</div></section>`;
  $("#challengeHome").addEventListener("click", exitFraudChallenge);
  $("#toggleNarration").addEventListener("click", toggleChallengeNarration);
  $("#replayScenario").addEventListener("click", replayChallengeScenario);
  $("#restartChallenge").addEventListener("click", () => startFraudChallenge(0));
  if (paused) wireChallengeQuestion(scene.questionId, data);
}

function challengeSceneMarkup(scenario, scene, ui) {
  const safe = fraudChallenge.sceneIndex === scenario.scenes.length - 1;
  const avatar = `<div class="story-avatar ${scenario.kind === "otp" ? "avatar-man" : "avatar-woman"}" aria-hidden="true"><span class="avatar-hair"></span><span class="avatar-face"><i></i><b></b></span><span class="avatar-body"></span></div>`;
  const phone = scenario.kind === "kyc"
    ? `<div class="story-phone"><div class="phone-camera"></div><small>${escapeHTML(ui.fakeSms)}</small><div class="phone-bank-icon">B</div><p>URGENT! Your bank account will be blocked within 2 hours due to incomplete KYC. Update immediately:</p><span class="phone-link">${escapeHTML(ui.suspiciousLink)}</span><span class="phone-time">09:41</span></div>`
    : scenario.kind === "otp"
      ? `<div class="story-phone call-phone"><div class="phone-camera"></div><span class="call-avatar">☎</span><strong>${escapeHTML(ui.scammer)}</strong><small>${escapeHTML(ui.callScreen)}</small><div class="phone-otp">${escapeHTML(ui.otpScreen)}</div><span class="call-pulse">●</span></div>`
      : `<div class="story-phone qr-phone"><div class="phone-camera"></div><span class="qr-sim" aria-hidden="true"></span><strong>${escapeHTML(ui.qrScreen)}</strong><small>${escapeHTML(ui.product)}</small><span class="qr-warning">PIN?</span></div>`;
  const sceneText = safe ? `<div class="story-shield" aria-hidden="true">✓</div><div class="story-safe-message"><strong>${escapeHTML(scenario.kind === "kyc" ? ui.safeEnding : scenario.kind === "otp" ? ui.otpEnding : ui.upiEnding)}</strong>${scenario.kind === "kyc" ? `<span>${escapeHTML(ui.safeEndingCopy)}</span>` : ""}</div>` : `<span class="thought-bubble">${scenario.kind === "kyc" ? "!" : scenario.kind === "otp" ? "?" : "₹"}</span>`;
  return `<div class="story-backdrop"><span class="story-window"></span><span class="story-table"></span></div><div class="story-character">${avatar}<span class="character-label">${escapeHTML(scenario.kind === "kyc" ? ui.woman : scenario.kind === "otp" ? ui.customer : ui.seller)}</span></div><div class="story-device">${phone}</div><div class="story-beat">${sceneText}</div>${scene.questionId ? `<span class="scene-alert-pulse" aria-hidden="true">!</span>` : ""}`;
}

function challengeQuestionMarkup(question, ui, questionId) {
  if (!question) return "";
  const feedback = fraudChallenge.answered;
  return `<section class="challenge-question ${feedback ? "question-feedback" : ""}" id="challengeQuestion" role="dialog" aria-modal="true" aria-labelledby="challengeQuestionTitle"><div class="challenge-question-header"><span>${escapeHTML(ui.redFlags)}</span><span>${feedback ? escapeHTML(fraudChallenge.results[questionId] ? ui.correct : ui.incorrect) : ""}</span></div><h3 id="challengeQuestionTitle">${escapeHTML(question.prompt)}</h3><div class="challenge-options">${question.options.map((option, index) => `<button type="button" class="challenge-option ${fraudChallenge.selected === index ? "is-selected" : ""} ${feedback && index === question.correct ? "answer-correct" : ""}" data-challenge-answer="${index}" ${feedback ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option)}</span></button>`).join("")}</div>${feedback ? `<div class="challenge-explanation ${fraudChallenge.results[questionId] ? "" : "explanation-caution"}" role="status"><strong>${escapeHTML(fraudChallenge.results[questionId] ? ui.correct : ui.incorrect)}</strong><p>${escapeHTML(question.explanation)}</p></div>` : `<p class="challenge-select-hint hidden" id="challengeSelectHint">${escapeHTML(ui.selectAnswer)}</p>`}<div class="challenge-question-actions">${feedback ? `<button type="button" class="primary-button" id="continueScenario">${escapeHTML(ui.continue)} →</button>` : `<button type="button" class="primary-button" id="submitChallengeAnswer" ${fraudChallenge.selected === null ? "disabled" : ""}>${escapeHTML(ui.submit)}</button>`}</div></section>`;
}

function renderChallengeQuestion(host, data) {
  const segment = data.segments[fraudChallenge.segmentIndex];
  const questionId = segment.questionIds[fraudChallenge.questionIndex || 0];
  const question = data.questions[questionId];
  const count = fraudChallenge.questionIndex || 0;
  host.innerHTML = `<section class="activity-panel challenge-quiz-panel"><div class="challenge-player-top"><button class="back-button" type="button" id="challengeHome">${escapeHTML(data.ui.backToSegments)}</button><span class="challenge-scenario-label">${escapeHTML(data.ui.completed)}: ${challengeQuestionCount(segment)} / ${segment.questionIds.length}</span></div><div class="challenge-progress-track" role="progressbar" aria-label="${escapeHTML(data.ui.progress)}" aria-valuemin="0" aria-valuemax="${segment.questionIds.length}" aria-valuenow="${count}"><span style="width:${(count / segment.questionIds.length) * 100}%"></span></div><p class="eyebrow">${escapeHTML(segment.title)}</p><h2>${escapeHTML(question.prompt)}</h2><div class="challenge-options standalone-options">${question.options.map((option, index) => `<button type="button" class="challenge-option ${fraudChallenge.selected === index ? "is-selected" : ""} ${fraudChallenge.answered && index === question.correct ? "answer-correct" : ""}" data-challenge-answer="${index}" ${fraudChallenge.answered ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHTML(option)}</span></button>`).join("")}</div>${fraudChallenge.answered ? `<div class="challenge-explanation ${fraudChallenge.results[questionId] ? "" : "explanation-caution"}" role="status"><strong>${escapeHTML(fraudChallenge.results[questionId] ? data.ui.correct : data.ui.incorrect)}</strong><p>${escapeHTML(question.explanation)}</p></div>` : `<p class="challenge-select-hint hidden" id="challengeSelectHint">${escapeHTML(data.ui.selectAnswer)}</p>`}<div class="challenge-question-actions"><button type="button" class="primary-button" id="${fraudChallenge.answered ? "nextStandaloneQuestion" : "submitChallengeAnswer"}" ${!fraudChallenge.answered && fraudChallenge.selected === null ? "disabled" : ""}>${fraudChallenge.answered ? (count === segment.questionIds.length - 1 ? escapeHTML(data.ui.finishSegment) : escapeHTML(data.ui.nextQuestion)) : escapeHTML(data.ui.submit)}</button><button class="danger-button" type="button" id="restartChallenge">${escapeHTML(data.ui.restart)}</button></div></section>`;
  $("#challengeHome").addEventListener("click", exitFraudChallenge);
  $("#restartChallenge").addEventListener("click", () => startFraudChallenge(0));
  wireChallengeQuestion(questionId, data);
  const next = $("#nextStandaloneQuestion");
  if (next) next.addEventListener("click", nextStandaloneQuestion);
}

function wireChallengeQuestion(questionId, data) {
  const host = $("#challengeQuestionSlot") || $("#quizPage");
  host.querySelectorAll("[data-challenge-answer]").forEach(button => button.addEventListener("click", () => {
    if (fraudChallenge.answered) return;
    fraudChallenge.selected = Number(button.dataset.challengeAnswer);
    const submit = $("#submitChallengeAnswer");
    if (submit) submit.disabled = false;
    host.querySelectorAll("[data-challenge-answer]").forEach(option => option.classList.toggle("is-selected", Number(option.dataset.challengeAnswer) === fraudChallenge.selected));
  }));
  const submit = $("#submitChallengeAnswer");
  if (submit) submit.addEventListener("click", () => {
    if (fraudChallenge.selected === null || fraudChallenge.answered) {
      const hint = $("#challengeSelectHint");
      if (hint) hint.classList.remove("hidden");
      return;
    }
    fraudChallenge.answered = true;
    fraudChallenge.results[questionId] = fraudChallenge.selected === data.questions[questionId].correct;
    if (fraudChallenge.view === "scenario") stopChallengeNarration();
    if (fraudChallenge.view === "scenario") {
      $("#challengeQuestionSlot").innerHTML = challengeQuestionMarkup(data.questions[questionId], data.ui, questionId);
      wireChallengeQuestion(questionId, data);
    } else renderQuizzes();
  });
  const continueButton = $("#continueScenario");
  if (continueButton) continueButton.addEventListener("click", advanceChallengeScene);
}

function runChallengeScene() {
  clearChallengeTimer();
  const data = challengeData(), scenario = data.scenarios[fraudChallenge.scenarioIndex];
  const scene = scenario.scenes[fraudChallenge.sceneIndex];
  fraudChallenge.sceneStartedAt = Date.now();
  fraudChallenge.scenePaused = false;
  fraudChallenge.sceneMinimumComplete = false;
  fraudChallenge.sceneNarrationPending = false;
  fraudChallenge.answered = false;
  fraudChallenge.selected = null;
  renderQuizzes();
  if (fraudChallenge.narrationOn) speakChallengeScene(scene.narration);
  challengeTimer = setTimeout(() => {
    challengeTimer = null;
    fraudChallenge.sceneMinimumComplete = true;
    completeChallengeSceneIfReady();
  }, scene.duration);
}

function completeChallengeSceneIfReady() {
  if (!fraudChallenge || fraudChallenge.view !== "scenario" || !fraudChallenge.sceneMinimumComplete || fraudChallenge.sceneNarrationPending || fraudChallenge.scenePaused) return;
  const data = challengeData();
  const scene = data.scenarios[fraudChallenge.scenarioIndex].scenes[fraudChallenge.sceneIndex];
  fraudChallenge.scenePaused = true;
  const slot = $("#challengeQuestionSlot");
  if (scene.questionId && slot) {
    const stage = $("#storyScene");
    if (stage) stage.classList.add("scene-is-paused");
    slot.innerHTML = challengeQuestionMarkup(data.questions[scene.questionId], data.ui, scene.questionId);
    wireChallengeQuestion(scene.questionId, data);
  } else advanceChallengeScene();
}

function advanceChallengeScene() {
  clearChallengeTimer();
  const data = challengeData(), scenario = data.scenarios[fraudChallenge.scenarioIndex];
  fraudChallenge.sceneIndex++;
  fraudChallenge.answered = false;
  fraudChallenge.selected = null;
  if (fraudChallenge.sceneIndex < scenario.scenes.length) {
    runChallengeScene();
    return;
  }
  fraudChallenge.scenarioIndex++;
  fraudChallenge.sceneIndex = 0;
  if (fraudChallenge.scenarioIndex < data.scenarios.length) runChallengeScene();
  else {
    fraudChallenge.completedSegments.scenarios = true;
    fraudChallenge.view = "segment-complete";
    renderQuizzes();
  }
}

function nextStandaloneQuestion() {
  const segment = challengeData().segments[fraudChallenge.segmentIndex];
  fraudChallenge.questionIndex = (fraudChallenge.questionIndex || 0) + 1;
  if (fraudChallenge.questionIndex >= segment.questionIds.length) {
    fraudChallenge.completedSegments[segment.id] = true;
    fraudChallenge.view = "segment-complete";
  } else {
    fraudChallenge.answered = false;
    fraudChallenge.selected = null;
  }
  renderQuizzes();
}

function replayChallengeScenario() {
  clearChallengeTimer();
  stopChallengeNarration();
  fraudChallenge.sceneIndex = 0;
  fraudChallenge.answered = false;
  fraudChallenge.selected = null;
  runChallengeScene();
}

function toggleChallengeNarration() {
  fraudChallenge.narrationOn = !fraudChallenge.narrationOn;
  if (fraudChallenge.narrationOn) {
    const scenario = challengeData().scenarios[fraudChallenge.scenarioIndex];
    speakChallengeScene(scenario.scenes[fraudChallenge.sceneIndex].narration);
  } else {
    stopChallengeNarration();
    completeChallengeSceneIfReady();
  }
  const button = $("#toggleNarration");
  button.textContent = fraudChallenge.narrationOn ? challengeData().ui.mute : challengeData().ui.unmute;
  button.setAttribute("aria-pressed", String(fraudChallenge.narrationOn));
}

function speakChallengeScene(narration) {
  if (!fraudChallenge || !fraudChallenge.narrationOn || !("speechSynthesis" in window)) return false;
  challengeSpeechToken++;
  const token = challengeSpeechToken;
  const utterance = new SpeechSynthesisUtterance(narration);
  utterance.lang = currentLanguage === "hi" ? "hi-IN" : currentLanguage === "kn" ? "kn-IN" : "en-IN";
  fraudChallenge.sceneNarrationPending = true;
  const narrationFinished = () => {
    if (token !== challengeSpeechToken || !fraudChallenge) return;
    fraudChallenge.sceneNarrationPending = false;
    completeChallengeSceneIfReady();
  };
  utterance.onend = narrationFinished;
  utterance.onerror = narrationFinished;
  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    narrationFinished();
    return false;
  }
}

function renderChallengeResults(host, data) {
  const answered = Object.keys(fraudChallenge.results).length;
  const correct = Object.values(fraudChallenge.results).filter(Boolean).length;
  const percentage = answered ? Math.round((correct / answered) * 100) : 0;
  const scenarios = data.scenarios.map(scenario => {
    const ids = scenario.scenes.map(scene => scene.questionId).filter(Boolean);
    const score = ids.filter(id => fraudChallenge.results[id]).length;
    return { title: scenario.title, score, total: ids.length };
  });
  const missedTips = Object.entries(data.questions).filter(([id]) => fraudChallenge.results[id] === false).map(([, question]) => question.tip);
  const uniqueTips = [...new Set(missedTips)];
  const segments = data.segments.map(segment => {
    const score = segment.questionIds.filter(id => fraudChallenge.results[id]).length;
    return `<article class="result-segment"><span>${escapeHTML(segment.title)}</span><strong>${score} / ${segment.questionIds.length}</strong><div class="result-bar"><i style="width:${Math.round(score / segment.questionIds.length * 100)}%"></i></div></article>`;
  }).join("");
  host.innerHTML = `<section class="activity-panel challenge-results"><div class="result-medal" aria-hidden="true">★</div><p class="eyebrow">${escapeHTML(data.ui.eyebrow)}</p><h2>${escapeHTML(data.ui.resultTitle)}</h2><p>${escapeHTML(data.ui.resultIntro)}</p><div class="result-score"><strong>${correct} / ${answered}</strong><span>${escapeHTML(data.ui.score)} · ${percentage}%</span><div class="result-bar"><i style="width:${percentage}%"></i></div></div><div class="result-stats"><div><strong>${answered}</strong><span>${escapeHTML(data.ui.answered)}</span></div><div><strong>${correct}</strong><span>${escapeHTML(data.ui.correctAnswers)}</span></div></div><h3>${escapeHTML(data.ui.segmentResults)}</h3><div class="result-segments">${segments}</div><h3>${escapeHTML(data.ui.scenarioResults)}</h3><div class="result-scenarios">${scenarios.map(item => `<div><span>${escapeHTML(item.title)}</span><strong>${item.score} / ${item.total}</strong></div>`).join("")}</div><div class="recommendation-panel"><h3>${escapeHTML(data.ui.recommendations)}</h3>${uniqueTips.length ? `<ul>${uniqueTips.map(tip => `<li>${escapeHTML(tip)}</li>`).join("")}</ul>` : `<p>${escapeHTML(data.ui.allCorrect)}</p>`}${percentage < 70 ? `<p>${escapeHTML(data.ui.encouragement)}</p>` : ""}</div><p class="challenge-saved-note">${escapeHTML(data.ui.saved)}</p><button class="primary-button" type="button" id="replayFullChallenge">${escapeHTML(data.ui.replayChallenge)} →</button></section>`;
  $("#replayFullChallenge").addEventListener("click", () => startFraudChallenge(0));
}

function saveFraudChallengeResults(data) {
  const answered = Object.keys(fraudChallenge.results).length;
  const correct = Object.values(fraudChallenge.results).filter(Boolean).length;
  const summary = {
    completedAt: new Date().toISOString(),
    answered,
    correct,
    percentage: answered ? Math.round((correct / answered) * 100) : 0,
    segments: Object.fromEntries(data.segments.map(segment => [
      segment.id,
      {
        answered: segment.questionIds.filter(id => fraudChallenge.results[id] !== undefined).length,
        correct: segment.questionIds.filter(id => fraudChallenge.results[id] === true).length
      }
    ]))
  };
  try { localStorage.setItem("bankingFraudChallengeProgress", JSON.stringify({ ...summary, segments: Object.fromEntries(Object.entries(summary.segments).map(([id, result]) => [id, result.answered === data.segments.find(segment => segment.id === id).questionIds.length ? result : null])) })); }
  catch { showToast("Challenge results could not be saved on this device."); }
  if (!savedProgress.quizzes.includes("fraud-awareness-challenge")) {
    savedProgress.quizzes.push("fraud-awareness-challenge");
    storeProgress();
  }
}

function exitFraudChallenge() {
  clearChallengeTimer();
  stopChallengeNarration();
  fraudChallenge = null;
  renderQuizzes();
}
function startQuiz(id) {
  activeQuiz = bankingContent[currentLanguage].quizzes.find(quiz => quiz.id === id);
  quizIndex = 0; quizScore = 0; quizAnswered = false; gameState = {};
  renderQuizzes();
}
function answerQuiz(index) {
  quizAnswered = true;
  gameState.answerCorrect = index === activeQuiz.questions[quizIndex].correct;
  if (gameState.answerCorrect) quizScore++;
  renderQuizzes();
}
function nextQuiz() {
  if (quizIndex < activeQuiz.questions.length - 1) {
    quizIndex++; quizAnswered = false; renderQuizzes(); return;
  }
  if (!savedProgress.quizzes.includes(activeQuiz.id)) savedProgress.quizzes.push(activeQuiz.id);
  storeProgress();
  const score = quizScore;
  activeQuiz = null; quizAnswered = false;
  renderQuizzes(); renderProgress();
  showToast(`${text("score")}: ${score} / ${bankingContent[currentLanguage].quizzes[0].questions.length}`);
}
function exitQuiz() { activeQuiz = null; quizAnswered = false; renderQuizzes(); }

function renderProgress() {
  if (!currentLanguage) return;
  const ui = bankingContent[currentLanguage].ui;
  const stats = [
    [ui.progressLessons, savedProgress.animations.length],
    [ui.progressActivities, savedProgress.activities.length],
    [ui.progressAnimations, savedProgress.animations.length],
    [ui.progressQuizzes, savedProgress.quizzes.length]
  ];
  $("#progressGrid").innerHTML = stats.map(([label, count]) => `<article class="progress-card"><span>${count}</span><h2>${escapeHTML(label)}</h2></article>`).join("");
  $("#progressEmpty").textContent = stats.every(([, count]) => count === 0) ? ui.noProgress : "";
}

function handleRoute() {
  const requested = location.hash.slice(1) || "home";
  const page = document.querySelector(`.page[data-page="${requested}"]`) ? requested : "home";
  if (page !== requested) location.hash = page;
  updateActiveNavigation(page);
  if (page !== "quizzes" && fraudChallenge) stopChallengeNarration();
  document.querySelectorAll(".page").forEach(section => section.classList.toggle("active-page", section.dataset.page === page));
  if (page === "animations") renderAnimations();
  if (page === "games") renderGames();
  if (page === "quizzes") renderQuizzes();
  if (page === "quizzes" && fraudChallenge && fraudChallenge.view === "scenario" && fraudChallenge.narrationOn && !fraudChallenge.scenePaused) {
    const scenario = challengeData().scenarios[fraudChallenge.scenarioIndex];
    speakChallengeScene(scenario.scenes[fraudChallenge.sceneIndex].narration);
  }
  if (page === "progress") renderProgress();
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function initializeCustomCursor() {
  const cursor = $("#customCursor");
  if (!cursor || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || navigator.maxTouchPoints > 0) return;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, frame = 0;
  document.body.classList.add("custom-cursor-active");
  function animate() {
    frame = 0;
    currentX += (targetX - currentX) * 0.38;
    currentY += (targetY - currentY) * 0.38;
    cursor.style.transform = `translate3d(${currentX}px,${currentY}px,0) translate(-50%,-50%)`;
    if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) frame = requestAnimationFrame(animate);
  }
  window.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    targetX = event.clientX; targetY = event.clientY; cursor.classList.add("visible");
    if (!frame) frame = requestAnimationFrame(animate);
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("visible"));
}

function initializeImmersiveUI() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hero = $("#heroSecurityVisual");

  if (hero && finePointer) {
    hero.addEventListener("pointermove", event => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      hero.style.transform = `perspective(900px) rotateY(${x * 5}deg) rotateX(${y * -5}deg)`;
      hero.querySelectorAll(".hero-orbit").forEach((orbit, index) => {
        orbit.style.translate = `${x * (index + 1) * 8}px ${y * (index + 1) * 8}px`;
      });
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.transform = "";
      hero.querySelectorAll(".hero-orbit").forEach(orbit => orbit.style.translate = "");
    });
  }

  const tiltTargets = ".method-card,.learning-card,.challenge-segment-card,.progress-card,.help-card";
  function bindTilt(root = document) {
    if (!finePointer) return;
    root.querySelectorAll(tiltTargets).forEach(card => {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = "true";
      card.addEventListener("pointermove", event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `perspective(900px) rotateX(${y * -3}deg) rotateY(${x * 3}deg) translateY(-3px)`;
      });
      card.addEventListener("pointerleave", () => card.style.transform = "");
    });
  }

  bindTilt();

  const revealTargets = ".method-card,.learning-card,.challenge-segment-card,.progress-card,.help-card";
  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: .12 })
    : null;

  function refreshReveals(root = document) {
    root.querySelectorAll(revealTargets).forEach((element, index) => {
      if (element.classList.contains("is-visible")) return;
      element.classList.add("reveal-ready");
      element.style.transitionDelay = `${Math.min(index * 45, 180)}ms`;
      if (revealObserver) revealObserver.observe(element);
      else element.classList.add("is-visible");
    });
  }

  refreshReveals();

  const main = $("#main-content");
  if (main) {
    const contentObserver = new MutationObserver(mutations => {
      const hasAddedNodes = mutations.some(mutation => mutation.addedNodes.length);
      if (hasAddedNodes) {
        bindTilt(main);
        refreshReveals(main);
      }
    });
    contentObserver.observe(main, { childList: true, subtree: true });
  }
}

function updateActiveNavigation(page) {
  document.querySelectorAll("#mainNavigation a").forEach(link => {
    const active = link.getAttribute("href") === `#${page}`;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.route)));
  document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => selectLanguage(button.dataset.language)));
  $("#changeLanguage").addEventListener("click", () => $("#languageGate").classList.remove("hidden"));
  window.addEventListener("hashchange", handleRoute);
  initializeCustomCursor();
  initializeImmersiveUI();
  if (currentLanguage && bankingContent[currentLanguage]) {
    applyLanguage();
    $("#languageGate").classList.add("hidden");
  } else {
    $("#languageGate").classList.remove("hidden");
  }
  handleRoute();
});
