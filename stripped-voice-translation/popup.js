/** @typedef {{ email: string, signedInAt: number }} PopupSession */

const GOOGLE_WEBSTORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/translatetube-%D0%BF%D0%B5%D1%80%D0%B5%D0%B2%D0%BE%D0%B4%D1%87%D0%B8%D0%BA/jlbhdllblndadgnmpmejihonkjgbdghn/reviews"

const UPGRADE_URL = "https://translatetube.pro"
const AUTH_GOOGLE_URL = "https://auth.translatetube.io"

const TRIAL_DAYS = 3
const MS_PER_DAY = 24 * 60 * 60 * 1000

const DEV_TEST_EMAIL = "test@test.com"
const DEV_TEST_PASSWORD = "password"
/** Trial start offset for dev account: 2 days ago → "1 day remaining" */
const DEV_TRIAL_OFFSET_MS = 2 * MS_PER_DAY

const POPUP_SESSION_KEY = "popupSession-v1"
const TRIAL_START_KEY = "popupTrialStartByEmail-v1"
const EXTENSION_AUTH_KEY = "extensionAuth-v1"

const $ = (id) => document.getElementById(id)

const tabSignIn = $("tabSignIn")
const tabSignUp = $("tabSignUp")
const panelSignIn = $("panelSignIn")
const panelSignUp = $("panelSignUp")
const formError = $("formError")
const trialBanner = $("trialBanner")
const trialText = $("trialText")
const signedInPanel = $("signedInPanel")
const authPanel = $("authPanel")
const userEmailDisplay = $("userEmailDisplay")
const linkRating = $("linkRating")
const linkUpgrade = $("linkUpgrade")
const btnGoogle = $("btnGoogle")
const btnSignOut = $("btnSignOut")

let currentEmail = null
let trialIntervalId = null

linkRating.href = GOOGLE_WEBSTORE_REVIEW_URL

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function showFormError(message) {
  if (!message) {
    formError.classList.add("hidden")
    formError.textContent = ""
    return
  }
  formError.textContent = message
  formError.classList.remove("hidden")
}

function setFieldError(inputEl, errorEl, message) {
  if (!message) {
    inputEl.classList.remove("invalid")
    errorEl.classList.add("hidden")
    errorEl.textContent = ""
    return
  }
  inputEl.classList.add("invalid")
  errorEl.textContent = message
  errorEl.classList.remove("hidden")
}

function clearFieldErrors() {
  setFieldError($("signInEmail"), $("signInEmailError"), "")
  setFieldError($("signInPassword"), $("signInPasswordError"), "")
  setFieldError($("signUpEmail"), $("signUpEmailError"), "")
  setFieldError($("signUpPassword"), $("signUpPasswordError"), "")
  showFormError("")
}

function switchAuthTab(mode) {
  const isSignIn = mode === "signIn"
  tabSignIn.classList.toggle("active", isSignIn)
  tabSignUp.classList.toggle("active", !isSignIn)
  tabSignIn.setAttribute("aria-selected", String(isSignIn))
  tabSignUp.setAttribute("aria-selected", String(!isSignIn))
  panelSignIn.classList.toggle("active", isSignIn)
  panelSignUp.classList.toggle("active", !isSignIn)
  panelSignIn.hidden = !isSignIn
  panelSignUp.hidden = isSignIn
  clearFieldErrors()
}

async function storageGet(key) {
  const result = await chrome.storage.local.get(key)
  return result[key] ?? null
}

async function storageSet(key, value) {
  await chrome.storage.local.set({ [key]: value })
}

async function storageRemove(key) {
  await chrome.storage.local.remove(key)
}

async function getTrialMap() {
  return (await storageGet(TRIAL_START_KEY)) || {}
}

async function getTrialStartMs(email) {
  const map = await getTrialMap()
  const key = normalizeEmail(email)
  return typeof map[key] === "number" ? map[key] : null
}

async function setTrialStartMs(email, startMs) {
  const map = await getTrialMap()
  map[normalizeEmail(email)] = startMs
  await storageSet(TRIAL_START_KEY, map)
}

function trialStartForAccount() {
  return Date.now()
}

async function ensureTrialStart(email, isNewAccount) {
  const normalized = normalizeEmail(email)
  if (normalized === DEV_TEST_EMAIL) {
    const start = Date.now() - DEV_TRIAL_OFFSET_MS
    await setTrialStartMs(email, start)
    return start
  }
  const existing = await getTrialStartMs(email)
  if (existing != null && !isNewAccount) {
    return existing
  }
  const start = trialStartForAccount()
  await setTrialStartMs(email, start)
  return start
}

function formatTrialMessage(daysRemaining) {
  if (daysRemaining <= 0) {
    return "Trial ended — please upgrade"
  }
  if (daysRemaining === 1) {
    return "1 day remaining"
  }
  return `${daysRemaining} days remaining`
}

function computeTrialState(startMs) {
  const elapsedDays = Math.floor((Date.now() - startMs) / MS_PER_DAY)
  const daysRemaining = TRIAL_DAYS - elapsedDays
  return {
    daysRemaining,
    message: formatTrialMessage(daysRemaining),
    expired: daysRemaining <= 0
  }
}

function updateTrialUI(startMs) {
  if (startMs == null) {
    trialBanner.className = "trial-banner guest"
    trialText.textContent = "Sign in to start your 3-day free trial"
    return
  }

  const { message, expired, daysRemaining } = computeTrialState(startMs)
  trialText.textContent = message
  trialBanner.classList.remove("guest", "active", "expired")
  if (expired) {
    trialBanner.classList.add("expired")
  } else {
    trialBanner.classList.add("active")
  }
}

function startTrialTicker(startMs) {
  if (trialIntervalId != null) {
    clearInterval(trialIntervalId)
  }
  updateTrialUI(startMs)
  trialIntervalId = setInterval(() => updateTrialUI(startMs), 60_000)
}

function setSignedInUI(email) {
  currentEmail = email
  userEmailDisplay.textContent = email
  signedInPanel.classList.remove("hidden")
  authPanel.classList.add("collapsed")
}

function setSignedOutUI() {
  currentEmail = null
  signedInPanel.classList.add("hidden")
  authPanel.classList.remove("collapsed")
  $("signInEmail").value = ""
  $("signInPassword").value = ""
  $("signUpEmail").value = ""
  $("signUpPassword").value = ""
  clearFieldErrors()
  if (trialIntervalId != null) {
    clearInterval(trialIntervalId)
    trialIntervalId = null
  }
  updateTrialUI(null)
}

async function saveSession(email) {
  /** @type {PopupSession} */
  const session = { email: normalizeEmail(email), signedInAt: Date.now() }
  await storageSet(POPUP_SESSION_KEY, session)
}

async function loadSession() {
  return /** @type {PopupSession | null} */ (await storageGet(POPUP_SESSION_KEY))
}

async function clearSession() {
  await storageRemove(POPUP_SESSION_KEY)
}

async function tryExtensionAuthEmail() {
  const extAuth = await storageGet(EXTENSION_AUTH_KEY)
  if (extAuth?.status === "authenticated" && extAuth?.user?.email) {
    return normalizeEmail(extAuth.user.email)
  }
  return null
}

async function refreshExtensionAuth() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "REFRESH_EXTENSION_AUTH"
    })
    if (response?.ok && response.auth?.user?.email) {
      return normalizeEmail(response.auth.user.email)
    }
  } catch {
    /* background may be unavailable */
  }
  return null
}

function validateSignIn(email, password) {
  let valid = true
  if (!email) {
    setFieldError($("signInEmail"), $("signInEmailError"), "Email is required")
    valid = false
  } else if (!isValidEmail(email)) {
    setFieldError($("signInEmail"), $("signInEmailError"), "Enter a valid email address")
    valid = false
  }
  if (!password) {
    setFieldError($("signInPassword"), $("signInPasswordError"), "Password is required")
    valid = false
  }
  return valid
}

function validateSignUp(email, password) {
  let valid = true
  if (!email) {
    setFieldError($("signUpEmail"), $("signUpEmailError"), "Email is required")
    valid = false
  } else if (!isValidEmail(email)) {
    setFieldError($("signUpEmail"), $("signUpEmailError"), "Enter a valid email address")
    valid = false
  }
  if (!password) {
    setFieldError($("signUpPassword"), $("signUpPasswordError"), "Password is required")
    valid = false
  } else if (password.length < 6) {
    setFieldError(
      $("signUpPassword"),
      $("signUpPasswordError"),
      "Password must be at least 6 characters"
    )
    valid = false
  }
  return valid
}

async function authenticateLocal(email, password, isSignUp) {
  const normalized = normalizeEmail(email)

  if (isSignUp) {
    await ensureTrialStart(normalized, true)
    await saveSession(normalized)
    return normalized
  }

  if (normalized === DEV_TEST_EMAIL && password === DEV_TEST_PASSWORD) {
    await ensureTrialStart(normalized, false)
    await saveSession(normalized)
    return normalized
  }

  const storedUsers = (await storageGet("popupRegisteredUsers-v1")) || {}
  if (storedUsers[normalized]) {
    if (storedUsers[normalized] !== password) {
      throw new Error("Incorrect password. Try again or create an account.")
    }
    await ensureTrialStart(normalized, false)
    await saveSession(normalized)
    return normalized
  }

  throw new Error(
    "Account not found. Use Sign Up to register, or dev credentials test@test.com / password."
  )
}

async function registerLocal(email, password) {
  const normalized = normalizeEmail(email)
  const storedUsers = (await storageGet("popupRegisteredUsers-v1")) || {}
  if (storedUsers[normalized] && normalized !== DEV_TEST_EMAIL) {
    throw new Error("An account with this email already exists. Sign in instead.")
  }
  storedUsers[normalized] = password
  await storageSet("popupRegisteredUsers-v1", storedUsers)
  await ensureTrialStart(normalized, true)
  await saveSession(normalized)
  return normalized
}

async function completeSignIn(email) {
  const startMs = await getTrialStartMs(email)
  const resolvedStart =
    startMs ?? (await ensureTrialStart(email, false))
  setSignedInUI(email)
  startTrialTicker(resolvedStart)
}

async function bootstrap() {
  const extEmail =
    (await refreshExtensionAuth()) || (await tryExtensionAuthEmail())
  const session = await loadSession()
  const email = extEmail || session?.email || null

  if (email) {
    if (!session) {
      await saveSession(email)
    }
    await ensureTrialStart(email, false)
    await completeSignIn(email)
    return
  }

  setSignedOutUI()
}

tabSignIn.addEventListener("click", () => switchAuthTab("signIn"))
tabSignUp.addEventListener("click", () => switchAuthTab("signUp"))

panelSignIn.addEventListener("submit", async (event) => {
  event.preventDefault()
  clearFieldErrors()
  const email = $("signInEmail").value
  const password = $("signInPassword").value
  if (!validateSignIn(email, password)) return

  const submitBtn = $("btnSignInSubmit")
  submitBtn.disabled = true
  try {
    const signedInEmail = await authenticateLocal(email, password, false)
    await completeSignIn(signedInEmail)
  } catch (error) {
    showFormError(error instanceof Error ? error.message : "Sign in failed")
  } finally {
    submitBtn.disabled = false
  }
})

panelSignUp.addEventListener("submit", async (event) => {
  event.preventDefault()
  clearFieldErrors()
  const email = $("signUpEmail").value
  const password = $("signUpPassword").value
  if (!validateSignUp(email, password)) return

  const submitBtn = $("btnSignUpSubmit")
  submitBtn.disabled = true
  try {
    const signedInEmail = await registerLocal(email, password)
    await completeSignIn(signedInEmail)
  } catch (error) {
    showFormError(error instanceof Error ? error.message : "Sign up failed")
  } finally {
    submitBtn.disabled = false
  }
})

btnGoogle.addEventListener("click", async () => {
  showFormError("")
  try {
    await chrome.tabs.create({ url: AUTH_GOOGLE_URL })
    showFormError("Complete Google sign-in in the browser tab, then reopen this popup.")
    const refreshed = await refreshExtensionAuth()
    if (refreshed) {
      await saveSession(refreshed)
      await completeSignIn(refreshed)
    }
  } catch {
    showFormError("Could not open Google sign-in. Check extension permissions.")
  }
})

btnSignOut.addEventListener("click", async () => {
  await clearSession()
  try {
    await chrome.runtime.sendMessage({ type: "REFRESH_EXTENSION_AUTH" })
  } catch {
    /* ignore */
  }
  setSignedOutUI()
})

linkUpgrade.addEventListener("click", () => {
  chrome.tabs.create({ url: UPGRADE_URL })
})

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && currentEmail) {
    getTrialStartMs(currentEmail).then((startMs) => {
      if (startMs != null) updateTrialUI(startMs)
    })
  }
})

bootstrap()
