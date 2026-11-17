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
  if (!activeQuiz) {
    host.innerHTML = `<div class="quiz-grid">${content.quizzes.map(quiz => `<article class="learning-card"><span class="card-index">✓</span><h2>${escapeHTML(quiz.title)}</h2><p>${quiz.questions.length} ${text("questionCount")}</p><button class="outline-button" type="button" data-quiz="${quiz.id}">${text("play")} →</button></article>`).join("")}</div>`;
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
  document.querySelectorAll(".page").forEach(section => section.classList.toggle("active-page", section.dataset.page === page));
  if (page === "animations") renderAnimations();
  if (page === "games") renderGames();
  if (page === "quizzes") renderQuizzes();
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

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-route]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.route)));
  document.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => selectLanguage(button.dataset.language)));
  $("#changeLanguage").addEventListener("click", () => $("#languageGate").classList.remove("hidden"));
  window.addEventListener("hashchange", handleRoute);
  initializeCustomCursor();
  if (currentLanguage && bankingContent[currentLanguage]) {
    applyLanguage();
    $("#languageGate").classList.add("hidden");
  } else {
    $("#languageGate").classList.remove("hidden");
  }
  handleRoute();
});
