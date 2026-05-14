(function () {
  var STORAGE_KEYS = {
    session: "stc_session",
    users: "stc_users",
    theme: "stc_theme",
  };

  var MAX_FAILED_ATTEMPTS = 5;
  var LOCKOUT_MINUTES = 10;
  var SESSION_DURATION_MS = 1000 * 60 * 60 * 4; // 4 hours

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  function getUsers() {
    return readJSON(STORAGE_KEYS.users, []);
  }

  function writeUsers(users) {
    writeJSON(STORAGE_KEYS.users, users);
  }

  function setTheme(theme) {
    writeJSON(STORAGE_KEYS.theme, theme);
    applyTheme(theme);
  }

  function readTheme() {
    return readJSON(STORAGE_KEYS.theme, "light");
  }

  function applyTheme(theme) {
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme === "light");
  }

  function formatDate(timestamp) {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function updateUserProfile(email, updates) {
    var users = getUsers();
    var normalized = normalizeEmail(email);
    var stored = users.find(function (user) {
      return normalizeEmail(user.email) === normalized;
    });
    if (!stored) return;
    Object.keys(updates).forEach(function (key) {
      stored[key] = updates[key];
    });
    writeUsers(users);
  }

  function normalizeEmail(email) {
    return email.trim().toLowerCase();
  }

  function findUser(email) {
    if (!email) return null;
    var normalized = normalizeEmail(email);
    return getUsers().find(function (user) {
      return normalizeEmail(user.email) === normalized;
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateUniversityEmail(email) {
    return validateEmail(email) && /\.(edu|university\.edu|ac\.[a-z]{2,})$/i.test(email);
  }

  function validatePassword(password) {
    return (
      password &&
      password.length >= 10 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
    );
  }

  function bytesToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(function (byte) {
        return byte.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function randomHex(length) {
    var values = new Uint8Array(length);
    window.crypto.getRandomValues(values);
    return bytesToHex(values);
  }

  function utf8Encode(value) {
    return new TextEncoder().encode(value);
  }

  async function hashPassword(password, salt) {
    var data = utf8Encode(salt + password);
    var digest = await window.crypto.subtle.digest("SHA-256", data);
    return bytesToHex(digest);
  }

  function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var result = 0;
    for (var i = 0; i < a.length; i += 1) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  function currentPage() {
    var parts = window.location.pathname.split("/");
    return (parts.pop() || "").toLowerCase() || "index.html";
  }

  function setPublicNavActive() {
    var page = currentPage();
    var map = { "index.html": "home", "about.html": "about", "events.html": "events" };
    var key = map[page];
    document.querySelectorAll(".nav-links a[data-nav]").forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-nav") === key);
    });
  }

  function readSession() {
    return readJSON(STORAGE_KEYS.session, null);
  }

  function writeSession(data) {
    writeJSON(STORAGE_KEYS.session, data);
  }

  function isAccountLocked(user) {
    return user && user.lockoutUntil && Date.now() < user.lockoutUntil;
  }

  function updateLockState(user, success) {
    if (!user) return;
    var users = getUsers();
    var stored = users.find(function (entry) {
      return normalizeEmail(entry.email) === normalizeEmail(user.email);
    });
    if (!stored) return;

    if (success) {
      stored.failedAttempts = 0;
      stored.lockoutUntil = 0;
    } else {
      stored.failedAttempts = (stored.failedAttempts || 0) + 1;
      if (stored.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        stored.lockoutUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
      }
    }
    writeUsers(users);
  }

  function getLockMessage(user) {
    if (!isAccountLocked(user)) return "";
    var remaining = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
    return "This account is locked. Try again in " + remaining + " minute(s).";
  }

  function requireAuth() {
    var session = readSession();
    if (!session || !session.email || !session.token || !session.expires || session.expires < Date.now()) {
      clearSession();
      window.location.href = "login.html";
      return null;
    }
    var user = findUser(session.email);
    if (!user) {
      clearSession();
      window.location.href = "login.html";
      return null;
    }
    return session;
  }

  function populateDashboard(session) {
    var el = document.getElementById("dashUserName");
    if (el) {
      var name = session.name && session.name.trim();
      el.textContent = name ? name.split(" ")[0] : "Member";
    }
  }

  function populateSettings(session) {
    var nameEl = document.getElementById("settingsName");
    var emailEl = document.getElementById("settingsEmail");
    var bioEl = document.getElementById("settingsBio");
    if (nameEl) nameEl.value = session.name || "";
    if (emailEl) emailEl.value = session.email || "";
    if (bioEl) bioEl.value = session.bio || "";
  }

  async function initLogin() {
    var form = document.getElementById("loginForm");
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = form.email.value.trim();
      var password = form.password.value.trim();

      if (!email || !password) {
        alert("Please enter your email and password.");
        return;
      }

      if (!validateEmail(email)) {
        alert("Please enter a valid email address.");
        return;
      }

      var user = findUser(email);
      if (!user) {
        alert("Invalid email or password. If you don't have an account, please register.");
        return;
      }

      if (isAccountLocked(user)) {
        alert(getLockMessage(user));
        return;
      }

      var match = await hashPassword(password, user.salt || "");
      if (!timingSafeEqual(match, user.passwordHash || "")) {
        updateLockState(user, false);
        alert("Invalid email or password. Please try again.");
        return;
      }

      updateLockState(user, true);
      writeSession({
        email: user.email,
        name: user.name,
        bio: user.bio || "",
        token: randomHex(24),
        expires: Date.now() + SESSION_DURATION_MS,
      });
      window.location.href = "dashboard.html";
    });
  }

  async function initRegister() {
    var form = document.getElementById("registerForm");
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var password = form.password.value.trim();
      var confirmPassword = form.confirmPassword.value.trim();
      var terms = form.terms.checked;

      if (!name || !email || !password || !confirmPassword) {
        alert("Please complete all fields.");
        return;
      }

      if (!validateEmail(email)) {
        alert("Please enter a valid email address.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      if (!validatePassword(password)) {
        alert("Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.");
        return;
      }

      if (!terms) {
        alert("Please accept the terms to continue.");
        return;
      }

      if (findUser(email)) {
        alert("This email is already registered. Please log in instead.");
        return;
      }

      var salt = randomHex(16);
      var users = getUsers();
      users.push({
        name: name,
        email: normalizeEmail(email),
        passwordHash: await hashPassword(password, salt),
        salt: salt,
        bio: "",
        failedAttempts: 0,
        lockoutUntil: 0,
        createdAt: Date.now(),
      });
      writeUsers(users);

      writeSession({
        name: name,
        email: normalizeEmail(email),
        bio: "",
        token: randomHex(24),
        expires: Date.now() + SESSION_DURATION_MS,
      });
      window.location.href = "dashboard.html";
    });
  }

  function initGoogleStub() {
    var btn = document.getElementById("googleStub");
    if (!btn) return;
    btn.addEventListener("click", function () {
      writeSession({
        name: "Google Member",
        email: "member@studenttech.dev",
        bio: "",
        token: randomHex(24),
        expires: Date.now() + SESSION_DURATION_MS,
      });
      window.location.href = "dashboard.html";
    });
  }

  function initSettingsPage() {
    var session = requireAuth();
    if (!session) return;
    populateSettings(session);
    applyTheme(readTheme());

    var save = document.getElementById("saveProfile");
    if (save) {
      save.addEventListener("click", function () {
        var name = document.getElementById("settingsName").value.trim();
        var bio = document.getElementById("settingsBio").value.trim();
        if (!name) {
          alert("Please enter your name.");
          return;
        }
        writeSession({ email: session.email, name: name, bio: bio, token: session.token, expires: session.expires });
        updateUserProfile(session.email, { name: name, bio: bio });
        populateAccountSummary(session.email);
        alert("Profile saved.");
      });
    }

    var accountButton = document.querySelector('[data-panel="accountPanel"]');
    var appearanceButton = document.querySelector('[data-panel="appearancePanel"]');
    var helpButton = document.querySelector('[data-panel="helpPanel"]');

    function showPanel(panelId) {
      document.querySelectorAll(".settings-panel").forEach(function (panel) {
        panel.classList.toggle("hidden", panel.id !== panelId);
      });
    }

    if (accountButton) {
      accountButton.addEventListener("click", function () {
        showPanel("accountPanel");
        populateAccountSummary(session.email);
      });
    }

    if (appearanceButton) {
      appearanceButton.addEventListener("click", function () {
        showPanel("appearancePanel");
        setThemeRadio(readTheme());
      });
    }

    if (helpButton) {
      helpButton.addEventListener("click", function () {
        showPanel("helpPanel");
      });
    }

    var themeOptions = document.querySelectorAll('input[name="themeOption"]');
    themeOptions.forEach(function (option) {
      option.addEventListener("change", function () {
        setTheme(this.value);
      });
    });

    var copyEmailBtn = document.getElementById("copyEmailBtn");
    if (copyEmailBtn) {
      copyEmailBtn.addEventListener("click", function () {
        navigator.clipboard.writeText(session.email).then(function () {
          alert("Email copied to clipboard.");
        });
      });
    }

    var supportBtn = document.getElementById("supportContactBtn");
    if (supportBtn) {
      supportBtn.addEventListener("click", function () {
        window.location.href = "mailto:support@studenttech.dev?subject=Help%20with%20Student%20Tech%20Collective";
      });
    }

    var logout = document.getElementById("logoutBtn");
    if (logout) {
      logout.addEventListener("click", function () {
        clearSession();
        window.location.href = "index.html";
      });
    }
  }

  function setThemeRadio(theme) {
    var radio = document.querySelector('input[name="themeOption"][value="' + theme + '"]');
    if (radio) {
      radio.checked = true;
    }
  }

  function populateAccountSummary(email) {
    var user = findUser(email);
    var accountEmail = document.getElementById("accountEmail");
    var accountSince = document.getElementById("accountSince");
    var accountToken = document.getElementById("accountToken");
    if (accountEmail) {
      accountEmail.textContent = email || "N/A";
    }
    if (accountSince) {
      accountSince.textContent = user ? formatDate(user.createdAt) : "Unknown";
    }
    if (accountToken) {
      var session = readSession();
      accountToken.textContent = session ? session.token : "N/A";
    }
  }

  function initDashboardActions() {
    var notifyBtn = document.querySelector('.icon-btn[aria-label="Notifications"]');
    var searchBtn = document.querySelector('.icon-btn[aria-label="Search"]');

    if (notifyBtn) {
      notifyBtn.addEventListener('click', function () {
        alert('No new notifications at the moment.');
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', function () {
        var query = window.prompt('Search the portal for projects, events, or resources:');
        if (query && query.trim()) {
          alert('Searching for "' + query.trim() + '"... (demo action)');
        }
      });
    }
  }

  function initDashboardPage() {
    var session = requireAuth();
    if (!session) return;
    populateDashboard(session);
    initDashboardActions();
  }

  var page = currentPage();

  if (document.querySelector(".nav-links a[data-nav]")) {
    setPublicNavActive();
  }

  applyTheme(readTheme());

  if (page === "login.html") {
    initLogin();
    initGoogleStub();
  } else if (page === "register.html") {
    initRegister();
  } else if (page === "dashboard.html") {
    initDashboardPage();
  } else if (page === "settings.html") {
    initSettingsPage();
  }
})();
