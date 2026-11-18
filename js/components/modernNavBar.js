/**
 * Modern Integrated Navigation Bar
 * Public browsing + conditional auth UI + language switcher + live user stats
 */

class ModernNavBar {
  constructor() {
    this.currentLang = window.i18n?.getCurrentLanguage() || localStorage.getItem("language") || "en";
    this.refreshState();
  }

  refreshState() {
    this.currentPage = this.detectPage();
    this.isLoggedIn =
      typeof authService !== "undefined" && authService.isAuthenticated();
    this.isAdmin =
      this.isLoggedIn &&
      typeof authService.isAdmin === "function" &&
      authService.isAdmin();
    this.username = this.isLoggedIn ? authService.username || "" : "";
  }

  t(key) {
    return window.i18n?.t(`navbar.${key}`) || key;
  }

  // Primary links only; secondary pages (analyze, profile, insights,
  // analytics) live in the user menu so the bar fits laptop widths.
  navLink(href, page, labelKey, show = true, extraClass = "") {
    if (!show) return "";
    const cls = [this.currentPage === page ? "active-link" : "", extraClass].filter(Boolean).join(" ");
    return `<a href="${href}" class="${cls}">${this.t(labelKey)}</a>`;
  }

  detectPage() {
    const path = window.location.pathname.toLowerCase();

    if (path === "/" || path.includes("index")) return "home";
    if (path.includes("/learn")) return "learn";
    if (path.includes("/ai-command") || path === "/ai" || path === "/command") return "command";
    if (path.includes("/dashboard")) return "dashboard";
    if (path.includes("/training") || path.includes("/practice")) return "training";
    if (path.includes("/terminal")) return "terminal";
    if (path.includes("/leaderboard")) return "leaderboard";
    if (path.includes("/admin")) return "admin";
    if (path.includes("/analyze")) return "analyze";
    if (path.includes("/learner-profile")) return "profile";
    if (path.includes("/ai-insights")) return "insights";
    if (path.includes("/analytics")) return "analytics";
    if (path.includes("/readiness")) return "readiness";
    if (path.includes("/auth") || path.includes("/login")) return "auth";

    return "";
  }

  render() {
    this.refreshState();

    const container = document.getElementById("navbar-container");
    if (!container) return null;

    container.className = "navbar";
    container.innerHTML = this.getNavTemplate();

    this.attachEventListeners();
    this.applyDirection(this.currentLang);

    return container;
  }

  getNavTemplate() {
    return `
      <div class="nav-container">
        <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle navigation" type="button">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>

        <a href="/" class="nav-brand" aria-label="Rasd Cyber | رصد سايبر home">
          <span>Rasd Cyber | رصد سايبر</span>
        </a>

        <div class="nav-links">
          ${this.navLink("/", "home", "home", !this.isLoggedIn)}
          ${this.navLink("/dashboard", "dashboard", "dashboard", this.isLoggedIn)}
          ${this.navLink("/ai-command", "command", "command", true, "nav-link-key")}
          ${this.navLink("/learn", "learn", "learn", true)}
          ${this.navLink("/training", "training", "training", true)}
          ${this.navLink("/terminal", "terminal", "terminal", true)}
          ${this.navLink("/readiness", "readiness", "readiness", this.isLoggedIn)}
          ${this.navLink("/leaderboard", "leaderboard", "leaderboard", true)}
          ${this.navLink("/admin", "admin", "admin", this.isLoggedIn && this.isAdmin)}
        </div>

        <div class="nav-right">
          <div class="lang-switcher">
            <button id="langBtn" class="lang-btn" type="button">
              <span id="langText">${this.currentLang === "en" ? "EN" : "AR"}</span>
            </button>

            <div id="langDropdown" class="lang-dropdown">
              <button class="lang-option ${this.currentLang === "en" ? "active" : ""}" data-lang="en" type="button">
                ${this.t("lang_en")}
              </button>
              <button class="lang-option ${this.currentLang === "ar" ? "active" : ""}" data-lang="ar" type="button">
                ${this.t("lang_ar")}
              </button>
            </div>
          </div>

          ${this.isLoggedIn ? this.getLoggedInTemplate() : this.getLoggedOutTemplate()}
        </div>
      </div>
    `;
  }

  getLoggedInTemplate() {
    const firstLetter = this.username ? this.username.charAt(0).toUpperCase() : "U";

    return `
      <div class="user-menu">
        <button class="user-btn" id="userMenuBtn" type="button">
          <div class="user-avatar">${firstLetter}</div>

          <span class="user-name" id="navUsername">${this.username}</span>

          <div class="user-stats">
            <span class="nav-stat" id="navXp">XP: 0</span>
            <span class="nav-stat" id="navLevel">L1</span>
          </div>

          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6"></path>
          </svg>
        </button>

        <div class="user-dropdown" id="userDropdown">
          <a href="/dashboard" class="dropdown-item">
            <span>${this.t("dashboard")}</span>
          </a>

          <a href="/training" class="dropdown-item">
            <span>${this.t("training")}</span>
          </a>

          <a href="/terminal" class="dropdown-item">
            <span>${this.t("terminal")}</span>
          </a>

          <a href="/analyze-scenario" class="dropdown-item">
            <span>${this.t("analyze")}</span>
          </a>

          <a href="/learner-profile" class="dropdown-item">
            <span>${this.t("profile")}</span>
          </a>

          <a href="/ai-insights" class="dropdown-item">
            <span>${this.t("insights")}</span>
          </a>

          <a href="/analytics" class="dropdown-item">
            <span>${this.t("analytics")}</span>
          </a>

          <a href="/readiness" class="dropdown-item">
            <span>${this.t("readiness")}</span>
          </a>

          ${
            this.isAdmin
              ? `
                <a href="/admin" class="dropdown-item">
                  <span>${this.t("admin")}</span>
                </a>
              `
              : ""
          }

          <div class="dropdown-divider"></div>

          <button id="logoutBtn" class="dropdown-item logout-item" type="button">
            <span>${this.t("logout")}</span>
          </button>
        </div>
      </div>
    `;
  }

  getLoggedOutTemplate() {
    return `
      <div class="auth-buttons">
        <a href="/auth" id="navLoginBtn" class="nav-btn nav-btn-secondary">${this.t("login")}</a>
        <a href="/auth" id="navSignupBtn" class="nav-btn nav-btn-primary">${this.t("join")}</a>
      </div>
    `;
  }

  attachEventListeners() {
    this.setupLanguageSwitcher();

    if (this.isLoggedIn) {
      this.setupLoggedInMenu();
      this.updateUserStats();
    } else {
      this.setupAuthButtons();
    }

    // Setup mobile drawer hamburger toggle
    const mobileToggle = document.getElementById("mobileToggle");
    const navLinks = document.querySelector(".nav-links");
    if (mobileToggle && navLinks) {
      mobileToggle.onclick = (e) => {
        e.stopPropagation();
        mobileToggle.classList.toggle("active");
        navLinks.classList.toggle("mobile-active");
      };

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".nav-links") && !e.target.closest("#mobileToggle")) {
          mobileToggle.classList.remove("active");
          navLinks.classList.remove("mobile-active");
        }
      });
    }

    window.addEventListener("languageChanged", (e) => {
      this.currentLang = e.detail.language;
      this.render();
    });

    window.addEventListener("profileUpdated", () => {
      this.updateUserStats();
    });
  }

  setupLanguageSwitcher() {
    const langBtn = document.getElementById("langBtn");
    const langDropdown = document.getElementById("langDropdown");

    if (!langBtn || !langDropdown) return;

    langBtn.onclick = (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle("active");
    };

    document.querySelectorAll(".lang-option").forEach((option) => {
      option.onclick = (e) => {
        e.preventDefault();

        const lang = option.getAttribute("data-lang");
        if (!lang) return;

        window.i18n?.setLanguage(lang);
        this.currentLang = lang;

        langDropdown.classList.remove("active");
      };
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".lang-switcher")) {
        langDropdown.classList.remove("active");
      }
    });
  }

  setupLoggedInMenu() {
    const userMenuBtn = document.getElementById("userMenuBtn");
    const userDropdown = document.getElementById("userDropdown");
    const logoutBtn = document.getElementById("logoutBtn");

    if (userMenuBtn && userDropdown) {
      userMenuBtn.onclick = (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle("active");
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = async (e) => {
        e.preventDefault();

        const confirmed = confirm(this.t("confirmLogout"));
        if (!confirmed) return;

        if (
          typeof authService !== "undefined" &&
          typeof authService.logout === "function"
        ) {
          await authService.logout(null);
        }

        window.location.href = "/";
      };
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".user-menu") && userDropdown) {
        userDropdown.classList.remove("active");
      }
    });
  }

  setupAuthButtons() {
    const navLoginBtn = document.getElementById("navLoginBtn");
    const navSignupBtn = document.getElementById("navSignupBtn");

    if (navLoginBtn) {
      navLoginBtn.onclick = (e) => {
        e.preventDefault();
        this.goToAuth("login");
      };
    }

    if (navSignupBtn) {
      navSignupBtn.onclick = (e) => {
        e.preventDefault();
        this.goToAuth("signup");
      };
    }
  }

  goToAuth(mode = "login") {
    const currentPath = window.location.pathname;

    if (
      typeof authService !== "undefined" &&
      typeof authService.setRedirectAfterLogin === "function" &&
      currentPath &&
      currentPath !== "/auth"
    ) {
      authService.setRedirectAfterLogin(currentPath);
    }

    const target = mode === "signup" ? "/auth?mode=signup" : "/auth?mode=login";
    window.location.href = target;
  }

  updateUserStats() {
    if (typeof authService === "undefined" || !authService.isAuthenticated()) return;

    authService
      .getProfile()
      .then((profile) => {
        if (!profile) return;

        const xp = profile.xp ?? profile.totalScore ?? 0;
        const lvl = profile.level ?? Math.floor(xp / 300) + 1;

        const xpNav = document.getElementById("navXp");
        const levelNav = document.getElementById("navLevel");
        const navUser = document.getElementById("navUsername");

        const xpLabel = window.i18n?.t("navbar.xp_short") || "XP";
        if (xpNav) xpNav.textContent = `${xpLabel}: ${xp}`;
        if (levelNav) levelNav.textContent = `L${lvl}`;
        if (navUser && profile.username) navUser.textContent = profile.username;
      })
      .catch((err) => {
        console.error("Failed to update nav user stats:", err);
      });
  }

  applyDirection(lang) {
    if (window.i18n && typeof window.i18n.applyDirection === "function") {
      window.i18n.applyDirection(lang);
      return;
    }

    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }
}

window.ModernNavBar = ModernNavBar;