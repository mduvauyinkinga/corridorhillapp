/**
 * nav.js
 * ------------------------------------------------------------------
 * Shared navigation component. Injects a responsive top navbar into
 * any page that includes a <div data-nav></div> placeholder.
 *
 * The navbar is rendered client-side so it stays consistent across
 * all pages without duplicating markup.
 */

import { logout } from "./auth.js";

const NAV_ITEMS = {
  resident: [
    { label: "Dashboard", href: "dashboard.html" },
    { label: "Submit Complaint", href: "complaint.html" },
    { label: "Track Complaints", href: "tracking.html" },
    { label: "House Rules", href: "rules.html" },
  ],
  management: [
    { label: "Management", href: "management.html" },
  ],
};

/**
 * Render the navbar into the [data-nav] container.
 * @param {object} profile - The current user's Firestore profile.
 */
export function renderNav(profile) {
  const mount = document.querySelector("[data-nav]");
  if (!mount) return;

  const role = profile?.role;
  const items = role === "management" ? NAV_ITEMS.management : NAV_ITEMS.resident;

  const nav = document.createElement("nav");
  nav.className = "navbar";
  nav.setAttribute("aria-label", "Main navigation");

  const brand = document.createElement("a");
  brand.className = "navbar__brand";
  brand.href = role === "management" ? "management.html" : "dashboard.html";

  const logo = document.createElement("img");
  logo.className = "navbar__logo";
  logo.src = "assets/images/corridor-logo.jpeg";
  logo.alt = "Corridor Hill logo";
  logo.width = 40;
  logo.height = 40;

  brand.appendChild(logo);
  brand.appendChild(document.createTextNode("Corridor Hill"));

  const toggle = document.createElement("button");
  toggle.className = "navbar__toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Toggle navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<span></span><span></span><span></span>';

  const menu = document.createElement("div");
  menu.className = "navbar__menu";

  const list = document.createElement("ul");
  list.className = "navbar__links";

  items.forEach((item) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.textContent = item.label;
    // Highlight the current page.
    if (window.location.pathname.endsWith(item.href)) {
      a.classList.add("is-active");
    }
    li.appendChild(a);
    list.appendChild(li);
  });

const logoutLi = document.createElement("li");
  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "btn btn--ghost btn--sm navbar__logout";
  logoutBtn.textContent = "Logout";
  logoutBtn.addEventListener("click", () => {
    // Close the mobile menu before navigating away.
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    logout();
  });
  logoutLi.appendChild(logoutBtn);

  list.appendChild(logoutLi);

  menu.appendChild(list);
  nav.appendChild(brand);
  nav.appendChild(toggle);

  // --- Theme toggle (Dark / Light mode) ---
  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "theme-toggle";
  themeBtn.innerHTML =
    '<svg class="theme-toggle__icon theme-toggle__icon--moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
    '<svg class="theme-toggle__icon theme-toggle__icon--sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
    '<span class="theme-toggle__label">Dark</span>';

  /** Reflect the currently-applied theme on the button (icon + label). */
  function updateThemeToggle(theme) {
    const isDark = theme === "dark";
    themeBtn.classList.toggle("is-dark", isDark);
    themeBtn.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
    themeBtn.querySelector(".theme-toggle__label").textContent = isDark
      ? "Light"
      : "Dark";
  }

  themeBtn.addEventListener("click", () => {
    const current =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light";
    const next = current === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (_) {
      /* localStorage unavailable — theme still applies for this session. */
    }
    updateThemeToggle(next);
  });

  // The page-level inline script already applied the saved theme before
  // first paint; sync the button so it always matches.
  updateThemeToggle(
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light"
  );

  nav.appendChild(themeBtn);

  nav.appendChild(menu);
  mount.appendChild(nav);

  // Mobile toggle behavior.
  toggle.addEventListener("click", () => 
    {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    menu.classList.toggle("is-open");
  });
}
