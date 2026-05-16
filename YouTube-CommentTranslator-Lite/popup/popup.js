const LANGUAGES = [
  ["auto", "Auto-detect source"],
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
  engine: "microsoft",
  color: "#1a73e8",
  bilingualDisplay: false
}

const enabledEl = document.getElementById("enabled")
const bilingualEl = document.getElementById("bilingualDisplay")
const langEl = document.getElementById("yourLanguage")
const engineEl = document.getElementById("engine")
const colorEl = document.getElementById("color")

for (const [code, label] of LANGUAGES) {
  if (code === "auto") continue
  const opt = document.createElement("option")
  opt.value = code
  opt.textContent = label
  langEl.appendChild(opt)
}

function detectLanguage() {
  const code = (navigator.language || "en").toLowerCase()
  if (code.startsWith("zh")) {
    return code.includes("tw") || code.includes("hk") ? "zh-tw" : "zh-cn"
  }
  if (code.startsWith("pt")) {
    return code.includes("br") ? "pt-br" : "pt-pt"
  }
  return code.split("-")[0]
}

async function load() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS))
  const yourLanguage = stored.yourLanguage ?? detectLanguage()

  enabledEl.checked = stored.enabled ?? DEFAULTS.enabled
  bilingualEl.checked = stored.bilingualDisplay ?? DEFAULTS.bilingualDisplay
  langEl.value = yourLanguage
  engineEl.value = stored.engine ?? DEFAULTS.engine
  colorEl.value = stored.color ?? DEFAULTS.color

  if (stored.yourLanguage === undefined) {
    await chrome.storage.local.set({ yourLanguage })
  }
}

function save(patch) {
  chrome.storage.local.set(patch)
}

enabledEl.addEventListener("change", () => save({ enabled: enabledEl.checked }))
bilingualEl.addEventListener("change", () =>
  save({ bilingualDisplay: bilingualEl.checked })
)
langEl.addEventListener("change", () => save({ yourLanguage: langEl.value }))
engineEl.addEventListener("change", () => save({ engine: engineEl.value }))
colorEl.addEventListener("change", () => save({ color: colorEl.value }))

load()
