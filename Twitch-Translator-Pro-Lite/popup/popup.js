const LANGUAGES = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt-br", "Portuguese (Brazil)"],
  ["pt-pt", "Portuguese"],
  ["ru", "Russian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh-cn", "Chinese (Simplified)"],
  ["zh-tw", "Chinese (Traditional)"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["id", "Indonesian"],
  ["th", "Thai"],
  ["vi", "Vietnamese"],
  ["tr", "Turkish"],
  ["pl", "Polish"],
  ["nl", "Dutch"],
  ["uk", "Ukrainian"]
]

const DEFAULTS = {
  enabled: true,
  yourLanguage: "en",
  contactLanguage: "en",
  engine: "microsoft",
  color: "#bf94ff",
  bilingualDisplay: false,
  outgoingEnabled: true
}

const ids = [
  "enabled",
  "bilingualDisplay",
  "yourLanguage",
  "contactLanguage",
  "engine",
  "color",
  "outgoingEnabled"
]

const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]))

function fillLanguages(select) {
  for (const [code, label] of LANGUAGES) {
    const opt = document.createElement("option")
    opt.value = code
    opt.textContent = label
    select.appendChild(opt)
  }
}

function detectLanguage() {
  const code = (navigator.language || "en").toLowerCase()
  if (code.startsWith("zh")) return code.includes("tw") || code.includes("hk") ? "zh-tw" : "zh-cn"
  if (code.startsWith("pt")) return code.includes("br") ? "pt-br" : "pt-pt"
  return code.split("-")[0]
}

async function load() {
  fillLanguages(els.yourLanguage)
  fillLanguages(els.contactLanguage)

  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS))
  const yourLanguage = stored.yourLanguage ?? detectLanguage()

  els.enabled.checked = stored.enabled ?? DEFAULTS.enabled
  els.bilingualDisplay.checked = stored.bilingualDisplay ?? DEFAULTS.bilingualDisplay
  els.outgoingEnabled.checked = stored.outgoingEnabled ?? DEFAULTS.outgoingEnabled
  els.yourLanguage.value = yourLanguage
  els.contactLanguage.value = stored.contactLanguage ?? DEFAULTS.contactLanguage
  els.engine.value = stored.engine ?? DEFAULTS.engine
  els.color.value = stored.color ?? DEFAULTS.color

  if (stored.yourLanguage === undefined) {
    await chrome.storage.local.set({ yourLanguage })
  }
}

function save(patch) {
  chrome.storage.local.set(patch)
}

els.enabled.addEventListener("change", () => save({ enabled: els.enabled.checked }))
els.bilingualDisplay.addEventListener("change", () => save({ bilingualDisplay: els.bilingualDisplay.checked }))
els.outgoingEnabled.addEventListener("change", () => save({ outgoingEnabled: els.outgoingEnabled.checked }))
els.yourLanguage.addEventListener("change", () => save({ yourLanguage: els.yourLanguage.value }))
els.contactLanguage.addEventListener("change", () => save({ contactLanguage: els.contactLanguage.value }))
els.engine.addEventListener("change", () => save({ engine: els.engine.value }))
els.color.addEventListener("change", () => save({ color: els.color.value }))

load()
