const DEFAULTS = {
  enabled: true,
  yourLanguage: normalizeLang(navigator.language),
  contactLanguage: "en",
  engine: "microsoft",
  color: "#bf94ff",
  bilingualDisplay: false,
  outgoingEnabled: true
}

const MESSAGE_SELECTOR = [
  ".chat-line__message .text-fragment",
  ".chat-line__message [data-a-target='chat-message-text']",
  "[data-a-target='chat-line-message'] .text-fragment",
  "[data-test-selector='chat-line-message'] .text-fragment"
].join(",")

let settings = { ...DEFAULTS }
let scanScheduled = false
let floatingToggle = null
let composeButton = null

function normalizeLang(code) {
  if (!code) return "en"
  const full = code.toLowerCase()
  if (full.startsWith("zh")) return full.includes("tw") || full.includes("hk") ? "zh-tw" : "zh-cn"
  if (full.startsWith("pt")) return full.includes("br") ? "pt-br" : "pt-pt"
  return full.split("-")[0]
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS))
  settings = {
    enabled: stored.enabled ?? DEFAULTS.enabled,
    yourLanguage: stored.yourLanguage ?? DEFAULTS.yourLanguage,
    contactLanguage: stored.contactLanguage ?? DEFAULTS.contactLanguage,
    engine: stored.engine ?? DEFAULTS.engine,
    color: stored.color ?? DEFAULTS.color,
    bilingualDisplay: stored.bilingualDisplay ?? DEFAULTS.bilingualDisplay,
    outgoingEnabled: stored.outgoingEnabled ?? DEFAULTS.outgoingEnabled
  }
  document.documentElement.style.setProperty("--twtl-color", settings.color)
}

function shouldSkipText(text) {
  const value = text.trim()
  if (!value) return true
  if (value.length > 500) return true
  if (/^[\s\p{Extended_Pictographic}\u200d\ufe0f]+$/u.test(value)) return true
  if (/^https?:\/\/\S+$/i.test(value)) return true
  if (/^[@#]?\w+$/.test(value) && value.length < 5) return true
  return false
}

function getMessageContainer(el) {
  return (
    el.closest("[data-a-target='chat-line-message']") ||
    el.closest("[data-test-selector='chat-line-message']") ||
    el.closest(".chat-line__message") ||
    el.parentElement
  )
}

function getMessageText(container) {
  const clone = container.cloneNode(true)
  clone.querySelectorAll(".twtl-translation, .twtl-divider, .chat-badge, img, svg, button").forEach((node) => node.remove())
  const author = clone.querySelector(".chat-author__display-name")
  author?.remove()
  return clone.textContent.replace(/\s+/g, " ").trim()
}

function clearTranslation(container) {
  container.querySelectorAll(":scope > .twtl-translation, :scope > .twtl-divider").forEach((el) => el.remove())
  container.querySelectorAll('[data-twtl-origin="true"]').forEach((el) => {
    el.removeAttribute("data-twtl-origin")
    el.removeAttribute("data-twtl-hidden-origin")
  })
  delete container.dataset.twtlDone
  delete container.dataset.twtlText
}

function setBilingualDisplay(container) {
  const origin = container.querySelector('[data-twtl-origin="true"]')
  const translation = container.querySelector(":scope > .twtl-translation")
  container.querySelectorAll(":scope > .twtl-divider").forEach((el) => el.remove())
  if (!origin || !translation) return

  if (settings.bilingualDisplay) {
    origin.removeAttribute("data-twtl-hidden-origin")
    const divider = document.createElement("hr")
    divider.className = "twtl-divider"
    container.insertBefore(divider, translation)
  } else {
    origin.setAttribute("data-twtl-hidden-origin", "true")
  }
}

function refreshTranslatedMessages() {
  document.querySelectorAll('[data-twtl-done="true"]').forEach(setBilingualDisplay)
  updateFloatingToggle()
}

async function translateTexts(texts, from, to) {
  const action = `translate:${Date.now()}:${Math.random()}`
  const response = await chrome.runtime.sendMessage({
    action,
    body: {
      texts,
      from,
      to,
      service: settings.engine
    }
  })

  if (!response || response.action !== action || response.error || !Array.isArray(response.texts)) {
    return []
  }
  return response.texts
}

function collectMessages() {
  const items = []
  const seenContainers = new Set()

  document.querySelectorAll(MESSAGE_SELECTOR).forEach((messageEl) => {
    if (!(messageEl instanceof HTMLElement)) return
    const container = getMessageContainer(messageEl)
    if (!container || seenContainers.has(container)) return
    seenContainers.add(container)
    if (container.dataset.twtlDone === "true" || container.dataset.twtlDone === "pending") return

    const text = getMessageText(container)
    if (shouldSkipText(text)) {
      container.dataset.twtlDone = "true"
      return
    }

    container.dataset.twtlDone = "pending"
    container.dataset.twtlText = text
    items.push({ container, messageEl, text })
  })

  return items
}

function applyTranslations(items, translations) {
  items.forEach((item, index) => {
    const translated = translations[index]?.trim()
    if (!translated || translated === item.text) {
      clearTranslation(item.container)
      item.container.dataset.twtlDone = "true"
      return
    }

    item.messageEl.setAttribute("data-twtl-origin", "true")

    const translation = document.createElement("div")
    translation.className = "twtl-translation"
    translation.textContent = translated
    item.container.appendChild(translation)
    item.container.dataset.twtlDone = "true"
    setBilingualDisplay(item.container)
  })
}

async function scan() {
  scanScheduled = false
  ensureFloatingToggle()
  ensureComposeButton()
  if (!settings.enabled) return

  const items = collectMessages()
  const chunkSize = 10
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const translated = await translateTexts(
      chunk.map((item) => item.text),
      "auto",
      settings.yourLanguage
    )
    applyTranslations(chunk, translated)
  }
}

function scheduleScan() {
  if (scanScheduled) return
  scanScheduled = true
  requestAnimationFrame(() => {
    scan().catch(() => {
      scanScheduled = false
    })
  })
}

function throttle(fn, waitMs) {
  let last = 0
  let timer = null
  return () => {
    const now = Date.now()
    const run = () => {
      last = Date.now()
      timer = null
      fn()
    }
    if (now - last >= waitMs) {
      run()
    } else if (!timer) {
      timer = setTimeout(run, waitMs - (now - last))
    }
  }
}

function updateFloatingToggle() {
  if (!floatingToggle) return
  floatingToggle.textContent = settings.bilingualDisplay ? "Both languages" : "Translation only"
  floatingToggle.setAttribute("aria-pressed", String(settings.bilingualDisplay))
}

function ensureFloatingToggle() {
  if (floatingToggle?.isConnected) return
  floatingToggle = document.createElement("button")
  floatingToggle.type = "button"
  floatingToggle.className = "twtl-floating-toggle"
  floatingToggle.addEventListener("click", () => {
    settings.bilingualDisplay = !settings.bilingualDisplay
    chrome.storage.local.set({ bilingualDisplay: settings.bilingualDisplay })
    refreshTranslatedMessages()
  })
  document.documentElement.appendChild(floatingToggle)
  updateFloatingToggle()
}

function findComposer() {
  return (
    document.querySelector("[data-a-target='chat-input'] textarea") ||
    document.querySelector("textarea[data-a-target='chat-input']") ||
    document.querySelector("[contenteditable='true'][data-a-target='chat-input']") ||
    document.querySelector("textarea")
  )
}

function getComposerWrapper(composer) {
  return (
    composer.closest(".chat-input, [data-a-target='chat-input'], form") ||
    composer.parentElement
  )
}

function setComposerText(composer, text) {
  composer.focus()
  if ("value" in composer) {
    composer.value = text
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
    return
  }
  document.execCommand("selectAll", false, null)
  document.execCommand("insertText", false, text)
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
}

async function translateComposer(composer, button) {
  const text = ("value" in composer ? composer.value : composer.textContent).trim()
  if (!text) return
  button.disabled = true
  const originalText = button.textContent
  button.textContent = "..."
  try {
    const [translated] = await translateTexts([text], "auto", settings.contactLanguage)
    if (translated) setComposerText(composer, translated)
  } finally {
    button.disabled = false
    button.textContent = originalText
  }
}

function ensureComposeButton() {
  if (!settings.outgoingEnabled) {
    composeButton?.remove()
    composeButton = null
    return
  }

  const composer = findComposer()
  if (!composer) return
  const wrapper = getComposerWrapper(composer)
  if (!wrapper) return
  if (composeButton?.isConnected && wrapper.contains(composeButton)) return

  composeButton?.remove()
  composeButton = document.createElement("button")
  composeButton.type = "button"
  composeButton.className = "twtl-compose-button"
  composeButton.textContent = "Translate"
  composeButton.addEventListener("click", () => translateComposer(composer, composeButton))
  wrapper.appendChild(composeButton)
}

async function init() {
  await loadSettings()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) settings[key] = changes[key].newValue ?? DEFAULTS[key]
    }
    document.documentElement.style.setProperty("--twtl-color", settings.color)
    refreshTranslatedMessages()
    scheduleScan()
  })

  const throttledScan = throttle(scheduleScan, 750)
  const observer = new MutationObserver(throttledScan)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  scheduleScan()
}

init().catch(() => {})
