// --- TruthLayer – Real-Time AI Output Verifier Frontend Logic ---



// Presets
const PRESETS = {
    true: "Water boils at 100 degrees Celsius under standard atmospheric pressure. The Earth orbits the Sun once every 365.25 days. Paris is the capital and most populous city of France.",
    false: "Albert Einstein invented the incandescent lightbulb in 1945. Leonardo da Vinci designed the first functional iPhone during the Renaissance. Humans can survive without breathing oxygen for up to three weeks.",
    mixed: "William Shakespeare wrote Hamlet in the early 17th century. He was also the first man to walk on the moon in 1969. Stratford-upon-Avon is Shakespeare's birthplace."
};

// State
let verificationData = null;
let activeSentenceIndex = null;

const THRESHOLD_TRUE = 75;
const THRESHOLD_FALSE = 35;

// DOM Elements
const inputText = document.getElementById("input-text");
const charCount = document.getElementById("char-count");
const btnVerify = document.getElementById("btn-verify");


// Presets Btns
const presetTrue = document.getElementById("preset-true");
const presetFalse = document.getElementById("preset-false");
const presetMixed = document.getElementById("preset-mixed");

// Results
const resultsContainer = document.getElementById("results-container");
const overallScoreText = document.getElementById("overall-score-text");
const scoreRing = document.getElementById("score-ring");
const scoreBadge = document.getElementById("score-badge");

// Stats Counts
const countTrue = document.getElementById("count-true");
const countUncertain = document.getElementById("count-uncertain");
const countFalse = document.getElementById("count-false");
const countTotal = document.getElementById("count-total");

// Sentence Markup
const sentenceMarkupContainer = document.getElementById("sentence-markup-container");

// Inspector
const inspectorEmptyState = document.getElementById("inspector-empty-state");
const inspectorDetails = document.getElementById("inspector-details");
const inspectorStatusBadge = document.getElementById("inspector-status-badge");
const inspectorSentenceText = document.getElementById("inspector-sentence-text");
const inspectorConfidenceBar = document.getElementById("inspector-confidence-bar");
const inspectorConfidenceVal = document.getElementById("inspector-confidence-val");
const inspectorExplanation = document.getElementById("inspector-explanation");
const inspectorSourceContainer = document.getElementById("inspector-source-container");
const inspectorSourceTitle = document.getElementById("inspector-source-title");
const inspectorSourceExtract = document.getElementById("inspector-source-extract");
const inspectorSourceUrl = document.getElementById("inspector-source-url");

// Loading Overlay
const loadingOverlay = document.getElementById("loading-overlay");
const loadingStepText = document.getElementById("loading-step-text");
const loadingProgressBar = document.getElementById("loading-progress-bar");

// Initialize Progress Ring Circumference
const RING_CIRCUMFERENCE = 2 * Math.PI * 70; // r = 70, C ≈ 439.82
scoreRing.style.strokeDasharray = RING_CIRCUMFERENCE;
scoreRing.style.strokeDashoffset = RING_CIRCUMFERENCE;

// ----------------- SERVERLESS DECENTRALIZED NLP ENGINE -----------------
const STOPWORDS = new Set([
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", 
    "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", 
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", 
    "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", 
    "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", 
    "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", 
    "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", 
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", 
    "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "d", "ll", "m", "o", "re", "ve", "y", "ain", "aren", "couldn", "didn", "doesn", 
    "hadn", "hasn", "haven", "isn", "ma", "mightn", "mustn", "needn", "shan", "shouldn", 
    "wasn", "weren", "won", "wouldn"
]);

function splitSentences(text) {
    if (!text.trim()) return [];
    text = text.replace(/\s+/g, " ").trim();
    const abbreviations = [
        "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "inc", "co", "corp", "ltd",
        "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
        "eg", "ie", "vs", "us", "uk"
    ];
    
    const sentences = [];
    let current = [];
    const tokens = text.split(" ");
    
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        current.push(token);
        
        if (token.endsWith(".") || token.endsWith("?") || token.endsWith("!")) {
            const word = token.slice(0, -1).toLowerCase().replace(/[^a-z]/g, "");
            if (abbreviations.includes(word)) continue;
            if (word.length === 1 && token[0] === token[0].toUpperCase()) continue;
            
            sentences.push(current.join(" "));
            current = [];
        }
    }
    
    if (current.length > 0) {
        sentences.push(current.join(" "));
    }
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

function extractKeywords(sentence) {
    const clean = sentence.replace(/[^\w\s-]/g, "");
    const words = clean.split(/\s+/);
    const keywords = [];
    
    let i = 0;
    while (i < words.length) {
        const word = words[i];
        if (word && word[0] === word[0].toUpperCase() && !STOPWORDS.has(word.toLowerCase())) {
            const phrase = [word];
            while (i + 1 < words.length && words[i+1] && words[i+1][0] === words[i+1][0].toUpperCase() && !STOPWORDS.has(words[i+1].toLowerCase())) {
                phrase.push(words[i+1]);
                i++;
            }
            keywords.push(phrase.join(" "));
        }
        i++;
    }
    
    for (const word of words) {
        const lower = word.toLowerCase();
        if (lower && !STOPWORDS.has(lower) && lower.length > 4) {
            if (!keywords.includes(word) && !keywords.some(kw => kw.includes(word))) {
                keywords.push(word);
            }
        }
    }
    
    return keywords.slice(0, 5);
}

async function queryWikipedia(queryStr, limit = 3) {
    if (!queryStr.trim()) return [];
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryStr)}&format=json&srlimit=${limit}&origin=*`;
    try {
        const response = await fetch(searchUrl);
        if (!response.ok) return [];
        const data = await response.json();
        const searchResults = data.query?.search || [];
        const articles = [];
        
        for (const res of searchResults) {
            const title = res.title;
            const pageId = res.pageid;
            const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
            try {
                const sumRes = await fetch(summaryUrl);
                if (sumRes.status === 200) {
                    const sumData = await sumRes.json();
                    const extract = sumData.extract;
                    const desktopUrl = sumData.content_urls?.desktop?.page || `https://en.wikipedia.org/?curid=${pageId}`;
                    if (extract) {
                        articles.push({
                            title,
                            extract,
                            url: desktopUrl
                        });
                    }
                }
            } catch (e) {
                console.warn(`Error fetching wiki summary for ${title}:`, e);
            }
        }
        return articles;
    } catch (e) {
        console.error("Wikipedia fetch failed:", e);
        return [];
    }
}

function calculateSimilarity(text1, text2) {
    const getWordFreq = (text) => {
        const words = text.toLowerCase().match(/\w+/g) || [];
        const freq = {};
        for (const w of words) {
            if (!STOPWORDS.has(w)) {
                freq[w] = (freq[w] || 0) + 1;
            }
        }
        return freq;
    };
    
    const freq1 = getWordFreq(text1);
    const freq2 = getWordFreq(text2);
    
    const words1 = Object.keys(freq1);
    const words2 = Object.keys(freq2);
    const intersection = words1.filter(w => w in freq2);
    
    const numerator = intersection.reduce((sum, w) => sum + (freq1[w] * freq2[w]), 0);
    const sum1 = words1.reduce((sum, w) => sum + Math.pow(freq1[w], 2), 0);
    const sum2 = words2.reduce((sum, w) => sum + Math.pow(freq2[w], 2), 0);
    const denominator = Math.sqrt(sum1) * Math.sqrt(sum2);
    
    const wordCosine = denominator ? (numerator / denominator) : 0;
    
    const getCharNgrams = (text, n = 3) => {
        const clean = text.toLowerCase().replace(/\s+/g, "");
        const ngrams = new Set();
        for (let i = 0; i <= clean.length - n; i++) {
            ngrams.add(clean.slice(i, i + n));
        }
        return ngrams;
    };
    
    const ngrams1 = getCharNgrams(text1);
    const ngrams2 = getCharNgrams(text2);
    const intersectionNgrams = new Set([...ngrams1].filter(x => ngrams2.has(x)));
    const unionNgrams = new Set([...ngrams1, ...ngrams2]);
    
    const jaccardChar = unionNgrams.size ? (intersectionNgrams.size / unionNgrams.size) : 0;
    
    return (0.8 * wordCosine) + (0.2 * jaccardChar);
}

function verifySentenceAccuracy(sentence, keywords, articles) {
    if (!articles || articles.length === 0) {
        return {
            score: 0,
            status: "false",
            source_title: null,
            source_url: null,
            source_extract: null,
            explanation: `No verified sources found for terms: ${keywords.length > 0 ? keywords.join(", ") : "None"}.`
        };
    }
    
    let bestMatch = articles[0];
    let highestSimilarity = 0.0;
    
    for (const article of articles) {
        const sim = calculateSimilarity(sentence, article.extract);
        if (sim > highestSimilarity) {
            highestSimilarity = sim;
            bestMatch = article;
        }
    }
    
    let score = 0;
    if (highestSimilarity >= 0.45) {
        score = 80 + Math.floor(Math.min(1.0, (highestSimilarity - 0.45) / 0.55) * 20);
    } else if (highestSimilarity >= 0.20) {
        score = 40 + Math.floor(((highestSimilarity - 0.20) / 0.25) * 39);
    } else {
        score = Math.floor((highestSimilarity / 0.20) * 39);
    }
    score = Math.max(0, Math.min(100, score));
    
    let status = "false";
    let explanation = "";
    
    if (score >= THRESHOLD_TRUE) {
        status = "true";
        explanation = `Verified by source. The statement aligns closely with records from Wikipedia article '${bestMatch.title}'.`;
    } else if (score >= THRESHOLD_FALSE) {
        status = "uncertain";
        explanation = `Uncertain or partially verified. Wikipedia article '${bestMatch.title}' contains relevant context, but some specific claims could not be fully cross-referenced.`;
    } else {
        status = "false";
        explanation = `Potential hallucination or unverified claim. The content contradicts or is not supported by findings in Wikipedia article '${bestMatch.title}'.`;
    }
    
    return {
        score,
        status,
        source_title: bestMatch.title,
        source_url: bestMatch.url,
        source_extract: bestMatch.extract,
        explanation
    };
}

// ----------------- CHAR COUNTER -----------------
inputText.addEventListener("input", () => {
    charCount.innerText = inputText.value.length;
});

// ----------------- PRESET HANDLERS -----------------
function fillPreset(type) {
    inputText.value = PRESETS[type];
    charCount.innerText = PRESETS[type].length;
    inputText.focus();
}

presetTrue.addEventListener("click", () => fillPreset("true"));
presetFalse.addEventListener("click", () => fillPreset("false"));
presetMixed.addEventListener("click", () => fillPreset("mixed"));

// ----------------- LOADING ANIMATION HELPERS -----------------
let loadingTimer = null;
function startLoadingAnimation() {
    loadingOverlay.style.display = "block";
    loadingProgressBar.style.width = "0%";
    
    const steps = [
        { text: "Segmenting paragraphs into semantic sentences...", progress: 15 },
        { text: "Extracting named entities and core keywords...", progress: 35 },
        { text: "Querying Wikipedia Knowledge Base API...", progress: 60 },
        { text: "Calculating semantic similarities with NLP...", progress: 85 },
        { text: "Generating explanation metrics...", progress: 95 }
    ];
    
    let currentStepIdx = 0;
    loadingStepText.innerText = steps[0].text;
    loadingProgressBar.style.width = `${steps[0].progress}%`;
    
    loadingTimer = setInterval(() => {
        if (currentStepIdx < steps.length - 1) {
            currentStepIdx++;
            loadingStepText.innerText = steps[currentStepIdx].text;
            loadingProgressBar.style.width = `${steps[currentStepIdx].progress}%`;
        }
    }, 1200);
}

function stopLoadingAnimation() {
    clearInterval(loadingTimer);
    loadingProgressBar.style.width = "100%";
    setTimeout(() => {
        loadingOverlay.style.display = "none";
    }, 400);
}

// ----------------- SCORE CALIBRATOR -----------------
function setScoreRing(score) {
    const offset = RING_CIRCUMFERENCE - (score / 100) * RING_CIRCUMFERENCE;
    scoreRing.style.strokeDashoffset = offset;
    
    // Set circle stroke color based on score status
    if (score >= THRESHOLD_TRUE) {
        scoreRing.style.stroke = "var(--color-success)";
        scoreBadge.innerText = "Highly Accurate";
        scoreBadge.className = "score-badge status-true";
    } else if (score >= THRESHOLD_FALSE) {
        scoreRing.style.stroke = "var(--color-warning)";
        scoreBadge.innerText = "Uncertain / Mixed";
        scoreBadge.className = "score-badge status-uncertain";
    } else {
        scoreRing.style.stroke = "var(--color-danger)";
        scoreBadge.innerText = "Likely Hallucinated";
        scoreBadge.className = "score-badge status-false";
    }
}

// ----------------- RENDER RESULTS -----------------
function renderResults(data) {
    verificationData = data;
    
    // Re-evaluate sentence statuses dynamically using local thresholds
    let trueCount = 0;
    let uncertainCount = 0;
    let falseCount = 0;
    
    data.results.forEach(res => {
        if (res.score >= THRESHOLD_TRUE) {
            res.status = "true";
            trueCount++;
        } else if (res.score >= THRESHOLD_FALSE) {
            res.status = "uncertain";
            uncertainCount++;
        } else {
            res.status = "false";
            falseCount++;
        }
    });
    
    // Update overall score and ring
    overallScoreText.innerText = data.overall_score;
    setScoreRing(data.overall_score);
    
    // Update numbers
    countTrue.innerText = trueCount;
    countUncertain.innerText = uncertainCount;
    countFalse.innerText = falseCount;
    countTotal.innerText = data.sentence_count;
    
    // Render sentence map
    sentenceMarkupContainer.innerHTML = "";
    data.results.forEach((res, index) => {
        const span = document.createElement("span");
        span.className = `verified-sentence status-${res.status}`;
        span.innerText = res.sentence + " ";
        span.setAttribute("data-index", index);
        span.addEventListener("click", () => inspectSentence(index));
        sentenceMarkupContainer.appendChild(span);
    });
    
    // 4. Reset inspector state
    inspectorDetails.style.display = "none";
    inspectorEmptyState.style.display = "flex";
    inspectorStatusBadge.innerText = "Select a Sentence";
    inspectorStatusBadge.className = "badge";
    
    // Show container
    resultsContainer.style.display = "block";
    
    // Auto-select first sentence to prompt user interaction
    if (data.results.length > 0) {
        inspectSentence(0);
    }
}

// ----------------- INSPECT SENTENCE -----------------
function inspectSentence(index) {
    activeSentenceIndex = index;
    const item = verificationData.results[index];
    
    // Toggle active highlighted span
    const allSpans = sentenceMarkupContainer.querySelectorAll(".verified-sentence");
    allSpans.forEach(span => {
        if (parseInt(span.getAttribute("data-index")) === index) {
            span.classList.add("active");
        } else {
            span.classList.remove("active");
        }
    });
    
    // Show inspector details
    inspectorEmptyState.style.display = "none";
    inspectorDetails.style.display = "block";
    
    // Set text and score details
    inspectorSentenceText.innerText = `"${item.sentence}"`;
    inspectorConfidenceVal.innerText = `${item.score}%`;
    inspectorConfidenceBar.style.width = `${item.score}%`;
    
    // Classify inspector confidence bar color
    inspectorConfidenceBar.className = `confidence-bar-fill status-${item.status}`;
    
    // Set Status Badge
    let statusText = "LIKELY TRUE";
    if (item.status === "uncertain") statusText = "UNCERTAIN";
    if (item.status === "false") statusText = "HALLUCINATION";
    
    inspectorStatusBadge.innerText = statusText;
    inspectorStatusBadge.className = `badge status-${item.status}`;
    
    // Set Explanation
    inspectorExplanation.innerText = item.explanation;
    
    // Set Reference Details
    if (item.source_title) {
        inspectorSourceContainer.style.display = "block";
        inspectorSourceTitle.innerText = item.source_title;
        inspectorSourceExtract.innerText = `"${item.source_extract}"`;
        inspectorSourceUrl.href = item.source_url;
    } else {
        inspectorSourceContainer.style.display = "none";
    }
    
    // Scroll inspector card into view on mobile
    if (window.innerWidth <= 1100) {
        document.getElementById("inspector-card").scrollIntoView({ behavior: "smooth" });
    }
}

// ----------------- VERIFY HANDLER (SERVERLESS) -----------------
async function handleVerify() {
    const text = inputText.value.trim();
    
    if (text.length < 10) {
        alert("Please enter a paragraph or text segment containing at least 10 characters.");
        return;
    }
    
    // Start loader
    btnVerify.disabled = true;
    const spinner = btnVerify.querySelector(".btn-spinner");
    const btnText = btnVerify.querySelector(".btn-text");
    spinner.style.display = "inline-block";
    btnText.innerText = "Analyzing Content...";
    
    startLoadingAnimation();
    
    try {
        let data;
        let usingBackend = false;
        
        try {
            console.log("Attempting to verify via FastAPI backend...");
            const response = await fetch("http://127.0.0.1:8000/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text })
            });
            
            if (response.ok) {
                data = await response.json();
                usingBackend = true;
                console.log("Backend verification successful!");
                addNotification("Verified using enterprise NLP backend", "success");
            } else {
                console.warn("Backend returned error status. Falling back to client-side...");
            }
        } catch (netErr) {
            console.warn("Could not connect to FastAPI backend. Running serverless client-side verification...", netErr);
            addNotification("Backend unavailable. Running client-side fallback.", "warning");
        }
        
        if (!usingBackend) {
            // Step 1: Sentence splitting
            const sentences = splitSentences(text);
            if (sentences.length === 0) {
                throw new Error("No sentences detected in the input.");
            }
            
            const results = [];
            let totalScore = 0;
            let trueCount = 0;
            let uncertainCount = 0;
            let falseCount = 0;
            
            // Process each sentence
            for (const sentence of sentences) {
                // Step 2: Keywords extraction
                const keywords = extractKeywords(sentence);
                const queryStr = keywords.join(" ");
                
                // Step 3: Fetch related Wikipedia summaries
                let articles = await queryWikipedia(queryStr);
                if (articles.length === 0 && keywords.length > 2) {
                    const backupQuery = keywords.slice(0, 2).join(" ");
                    articles = await queryWikipedia(backupQuery);
                }
                
                // Step 4: Verification calculations
                const verification = verifySentenceAccuracy(sentence, keywords, articles);
                
                if (verification.status === "true") trueCount++;
                else if (verification.status === "uncertain") uncertainCount++;
                else falseCount++;
                
                totalScore += verification.score;
                results.push({
                    sentence,
                    score: verification.score,
                    status: verification.status,
                    keywords,
                    source_title: verification.source_title,
                    source_url: verification.source_url,
                    source_extract: verification.source_extract,
                    explanation: verification.explanation
                });
            }
            
            const overallScore = Math.floor(totalScore / sentences.length);
            
            data = {
                overall_score: overallScore,
                sentence_count: sentences.length,
                true_count: trueCount,
                uncertain_count: uncertainCount,
                false_count: falseCount,
                results
            };
        }
        
        // Small delay to make sure steps loader is legible (improves UX)
        await new Promise(resolve => setTimeout(resolve, 3500));
        
        stopLoadingAnimation();
        renderResults(data);
        addNotification(`Verification complete. Truth Score: ${data.overall_score}%`, "success");
    } catch (e) {
        stopLoadingAnimation();
        addNotification(`Scan error: ${e.message}`, "danger");
        alert(`An error occurred during verification: ${e.message}`);
    } finally {
        btnVerify.disabled = false;
        spinner.style.display = "none";
        btnText.innerText = "Verify Accuracy";
    }
}

btnVerify.addEventListener("click", handleVerify);

// ----------------- NOTIFICATION HANDLERS -----------------
const btnNotifications = document.getElementById("btn-notifications");
const notificationDropdown = document.getElementById("notification-dropdown");
const btnClearNotifications = document.getElementById("btn-clear-notifications");
const notificationList = document.getElementById("notification-list");
const notificationBadge = document.getElementById("notification-badge");

let unreadCount = 2; // Initial unread count (two demo cards in html)

btnNotifications.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = notificationDropdown.style.display === "none";
    notificationDropdown.style.display = isHidden ? "block" : "none";
    
    // Clear badge count on click (since they are viewed)
    if (isHidden) {
        unreadCount = 0;
        updateBadge();
        
        // Remove unread indicators
        const unreadItems = notificationList.querySelectorAll(".notification-item.unread");
        unreadItems.forEach(item => item.classList.remove("unread"));
    }
});

// Close notification menu on clicking outside
document.addEventListener("click", (e) => {
    if (notificationDropdown && !notificationDropdown.contains(e.target) && e.target !== btnNotifications) {
        notificationDropdown.style.display = "none";
    }
});

btnClearNotifications.addEventListener("click", (e) => {
    e.stopPropagation();
    notificationList.innerHTML = `
        <div class="empty-notifications">
            <i class="fa-regular fa-bell-slash"></i>
            <p>No new notifications</p>
        </div>
    `;
    unreadCount = 0;
    updateBadge();
});

function updateBadge() {
    if (unreadCount > 0) {
        notificationBadge.style.display = "flex";
        notificationBadge.innerText = unreadCount;
    } else {
        notificationBadge.style.display = "none";
    }
}

function addNotification(message, type = "info") {
    if (!notificationList) return;
    
    // If the list is empty (placeholder is active), remove placeholder
    const emptyState = notificationList.querySelector(".empty-notifications");
    if (emptyState) {
        notificationList.innerHTML = "";
    }
    
    const item = document.createElement("div");
    item.className = "notification-item unread";
    
    // Choose icon based on type
    let iconClass = "fa-solid fa-circle-info";
    if (type === "success") iconClass = "fa-solid fa-circle-check";
    if (type === "warning") iconClass = "fa-solid fa-circle-exclamation";
    if (type === "danger") iconClass = "fa-solid fa-circle-xmark";
    
    item.innerHTML = `
        <div class="notification-icon ${type}"><i class="${iconClass}"></i></div>
        <div class="notification-info">
            <p class="notification-msg">${message}</p>
            <span class="notification-time">Just now</span>
        </div>
    `;
    
    item.addEventListener("click", () => {
        if (item.classList.contains("unread")) {
            item.classList.remove("unread");
            if (unreadCount > 0) {
                unreadCount--;
                updateBadge();
            }
        }
    });
    
    notificationList.insertBefore(item, notificationList.firstChild);
    
    // Only show badge/update count if dropdown is currently closed
    if (notificationDropdown.style.display === "none") {
        unreadCount++;
        updateBadge();
    }
}

// ----------------- PROFILE & THEME HANDLERS -----------------
const btnProfile = document.getElementById("btn-profile");
const profileDropdown = document.getElementById("profile-dropdown");
const btnThemeToggle = document.getElementById("btn-theme-toggle");
const themeIcon = document.getElementById("theme-icon");

// Toggle Profile Dropdown
btnProfile.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = profileDropdown.style.display === "none";
    profileDropdown.style.display = isHidden ? "block" : "none";
    
    // Close notifications if open
    if (isHidden) {
        notificationDropdown.style.display = "none";
    }
});

// Close profile dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (profileDropdown && !profileDropdown.contains(e.target) && e.target !== btnProfile) {
        profileDropdown.style.display = "none";
    }
});

// Theme Toggling (Dark / Light Mode)
btnThemeToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const body = document.body;
    body.classList.toggle("light-theme");
    
    const isLightTheme = body.classList.contains("light-theme");
    const label = btnThemeToggle.querySelector("span");
    
    if (isLightTheme) {
        label.innerText = "Dark Mode";
        themeIcon.className = "fa-solid fa-moon";
        addNotification("Swapped to Light Theme", "info");
    } else {
        label.innerText = "Light Mode";
        themeIcon.className = "fa-solid fa-sun";
        addNotification("Swapped to Dark Theme", "info");
    }
});

// ----------------- AUTHENTICATION SYSTEM -----------------
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const btnSubmitAuth = document.getElementById("btn-submit-auth");
const btnToggleAuthMode = document.getElementById("btn-toggle-auth-mode");
const btnLogout = document.getElementById("btn-logout");

const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const authErrorMsg = document.getElementById("auth-error-msg");
const authToggleMsg = document.getElementById("auth-toggle-msg");
const authSubtitle = document.getElementById("auth-subtitle");

let authMode = "login";

// Initial user credentials setup
if (!localStorage.getItem("tl_username")) {
    localStorage.setItem("tl_username", "admin");
    localStorage.setItem("tl_password", "password123");
}

// Check session auth state on load
function checkAuthState() {
    const isAuthenticated = sessionStorage.getItem("tl_authenticated") === "true";
    if (isAuthenticated) {
        authContainer.style.display = "none";
        appContainer.style.display = "flex";
        
        // Update user profile display text based on login user
        const loggedUser = localStorage.getItem("tl_logged_user") || localStorage.getItem("tl_username") || "admin";
        document.querySelector(".profile-name").innerText = loggedUser;
    } else {
        authContainer.style.display = "flex";
        appContainer.style.display = "none";
    }
}

checkAuthState();

// Toggle between Sign In and Setup Password mode
btnToggleAuthMode.addEventListener("click", () => {
    authErrorMsg.style.display = "none";
    authUsername.value = "";
    authPassword.value = "";
    
    if (authMode === "login") {
        authMode = "setup";
        authSubtitle.innerText = "Setup your custom username and password credentials";
        btnSubmitAuth.innerText = "Save & Create Credentials";
        authToggleMsg.innerText = "Already have credentials?";
        btnToggleAuthMode.innerText = "Sign In";
    } else {
        authMode = "login";
        authSubtitle.innerText = "Sign in to access the audit console";
        btnSubmitAuth.innerText = "Sign In";
        authToggleMsg.innerText = "Don't have credentials?";
        btnToggleAuthMode.innerText = "Setup User Password";
    }
});

// Submit login/setup details
btnSubmitAuth.addEventListener("click", () => {
    const userVal = authUsername.value.trim();
    const passVal = authPassword.value.trim();
    
    if (!userVal || !passVal) {
        authErrorMsg.innerText = "Please fill in all input fields.";
        authErrorMsg.style.display = "block";
        return;
    }
    
    if (authMode === "login") {
        const storedUser = localStorage.getItem("tl_username");
        const storedPass = localStorage.getItem("tl_password");
        
        if (userVal.toLowerCase() === storedUser.toLowerCase() && passVal === storedPass) {
            authErrorMsg.style.display = "none";
            sessionStorage.setItem("tl_authenticated", "true");
            localStorage.setItem("tl_logged_user", userVal);
            checkAuthState();
            addNotification(`Successfully signed in as ${userVal}.`, "success");
        } else {
            authErrorMsg.innerText = "Invalid username or password.";
            authErrorMsg.style.display = "block";
        }
    } else {
        // Setup Password mode
        if (passVal.length < 4) {
            authErrorMsg.innerText = "Password must be at least 4 characters long.";
            authErrorMsg.style.display = "block";
            return;
        }
        
        localStorage.setItem("tl_username", userVal);
        localStorage.setItem("tl_password", passVal);
        
        // Success notification and toggle back to login
        authErrorMsg.style.display = "none";
        alert("Credentials successfully configured! You can now sign in.");
        
        // Trigger login toggle back
        btnToggleAuthMode.click();
        
        // Auto fill new user
        authUsername.value = userVal;
        
        addNotification("New user credentials saved.", "info");
    }
});



// Logout Handler
btnLogout.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear auth state
    sessionStorage.removeItem("tl_authenticated");
    localStorage.removeItem("tl_logged_user");
    
    // Reset inputs
    authUsername.value = "";
    authPassword.value = "";
    authErrorMsg.style.display = "none";
    profileDropdown.style.display = "none";
    
    checkAuthState();
    addNotification("Signed out of your session.", "info");
});






