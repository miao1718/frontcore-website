/**
 * 主交互脚本
 * - 移动端导航菜单开关
 * - 滚动时 Header 毛玻璃效果
 * - 导航锚点平滑滚动
 * - 点击外部关闭菜单
 */

(function () {
  "use strict";

  var menuBtn = document.getElementById("menuBtn");
  var nav = document.getElementById("nav");
  var header = document.getElementById("header");
  var navLinks = nav ? nav.querySelectorAll(".nav__link[data-section]") : [];
  var scrollAnimationId = null;
  var isProgrammaticScroll = false;

  var scrollSections = [
    { id: "home", el: document.getElementById("home") },
    { id: "products", el: document.getElementById("products") },
    { id: "advantages", el: document.getElementById("advantages") },
    { id: "about", el: document.getElementById("about") },
  ].filter(function (section) {
    return section.el;
  });

  /** 缓动函数：先加速后减速，营造滑动速率感 */
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getHeaderOffset() {
    var value = getComputedStyle(document.documentElement).getPropertyValue("--header-height");
    return parseInt(value, 10) || 70;
  }

  function getSectionScrollTop(sectionEl) {
    var headerOffset = getHeaderOffset();
    var rect = sectionEl.getBoundingClientRect();
    return Math.max(0, window.scrollY + rect.top - headerOffset);
  }

  /** 根据滚动距离计算时长，距离越远滑动越久 */
  function getScrollDuration(distance) {
    return Math.min(1200, Math.max(500, distance * 0.75));
  }

  function smoothScrollTo(targetY) {
    if (scrollAnimationId) {
      cancelAnimationFrame(scrollAnimationId);
      scrollAnimationId = null;
    }

    var startY = window.scrollY;
    var distance = targetY - startY;

    if (Math.abs(distance) < 1) {
      return;
    }

    var duration = getScrollDuration(Math.abs(distance));
    var startTime = null;

    isProgrammaticScroll = true;

    function step(currentTime) {
      if (!startTime) {
        startTime = currentTime;
      }

      var elapsed = currentTime - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var easedProgress = easeInOutCubic(progress);

      window.scrollTo(0, startY + distance * easedProgress);

      if (progress < 1) {
        scrollAnimationId = requestAnimationFrame(step);
      } else {
        scrollAnimationId = null;
        isProgrammaticScroll = false;
        updateActiveNavLink(getActiveSectionId());
      }
    }

    scrollAnimationId = requestAnimationFrame(step);
  }

  function scrollToSection(sectionId) {
    if (sectionId === "home") {
      smoothScrollTo(0);
      return;
    }

    var section = scrollSections.find(function (item) {
      return item.id === sectionId;
    });

    if (section) {
      smoothScrollTo(getSectionScrollTop(section.el));
    }
  }

  function setActiveNavLink(sectionId) {
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute("data-section") === sectionId;
      link.classList.toggle("nav__link--active", isActive);
    });
  }

  function getActiveSectionId() {
    var headerOffset = getHeaderOffset();
    var scrollPosition = window.scrollY + headerOffset + 80;

    if (window.scrollY < 80) {
      return "home";
    }

    var activeId = "home";

    scrollSections.forEach(function (section) {
      if (section.id === "home") {
        return;
      }

      if (getSectionScrollTop(section.el) <= scrollPosition) {
        activeId = section.id;
      }
    });

    return activeId;
  }

  function updateActiveNavLink(sectionId) {
    setActiveNavLink(sectionId || getActiveSectionId());
  }

  /** 滚动时切换 Header 毛玻璃状态 */
  if (header) {
    var scrollThreshold = 1;
    var headerTicking = false;

    function updateHeaderScrollState() {
      header.classList.toggle("header--scrolled", window.scrollY > scrollThreshold);

      if (!isProgrammaticScroll) {
        updateActiveNavLink(getActiveSectionId());
      }

      headerTicking = false;
    }

    function onScroll() {
      if (!headerTicking) {
        window.requestAnimationFrame(updateHeaderScrollState);
        headerTicking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateHeaderScrollState();
  }

  /** Hero CTA 锚点平滑滚动 */
  var heroCta = document.querySelector('.hero__content a.btn[href^="#"]');
  if (heroCta) {
    heroCta.addEventListener("click", function (e) {
      var href = heroCta.getAttribute("href");

      if (!href || href === "#") {
        return;
      }

      e.preventDefault();

      var sectionId = href.slice(1);
      scrollToSection(sectionId);
      setActiveNavLink(sectionId);

      if (history.replaceState) {
        history.replaceState(null, "", href);
      }
    });
  }

  /** 导航锚点平滑滚动 */
  if (nav) {
    nav.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        var href = link.getAttribute("href");

        if (!href || href === "#") {
          return;
        }

        e.preventDefault();

        var sectionId = link.getAttribute("data-section") || href.slice(1);
        scrollToSection(sectionId);
        setActiveNavLink(sectionId);

        if (nav.classList.contains("is-open")) {
          toggleMenu(true);
        }

        if (history.replaceState) {
          history.replaceState(null, "", href);
        }
      });
    });

    var logo = document.querySelector(".header .logo");
    if (logo) {
      logo.addEventListener("click", function (e) {
        e.preventDefault();
        scrollToSection("home");
        setActiveNavLink("home");

        if (history.replaceState) {
          history.replaceState(null, "", "#home");
        }
      });
    }

    var footerLogo = document.querySelector(".logo--footer");
    if (footerLogo) {
      footerLogo.addEventListener("click", function (e) {
        e.preventDefault();
        scrollToSection("home");
        setActiveNavLink("home");

        if (history.replaceState) {
          history.replaceState(null, "", "#home");
        }
      });
    }
  }

  if (!menuBtn || !nav) {
    return;
  }

  function getMenuFocusableElements() {
    return [menuBtn].concat(
      Array.prototype.slice.call(nav.querySelectorAll('a[href], button:not([disabled])'))
    );
  }

  /** 切换移动端导航菜单 */
  function toggleMenu(forceClose) {
    var isOpen = forceClose === true ? false : !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    menuBtn.setAttribute("aria-label", isOpen ? "关闭菜单" : "打开菜单");
    document.body.style.overflow = isOpen ? "hidden" : "";

    if (isOpen) {
      var firstLink = nav.querySelector(".nav__link");
      if (firstLink) {
        requestAnimationFrame(function () {
          firstLink.focus();
        });
      }
    } else if (document.activeElement && (nav.contains(document.activeElement) || document.activeElement === menuBtn)) {
      menuBtn.focus();
    }
  }

  menuBtn.addEventListener("click", function () {
    toggleMenu();
  });

  /** 点击菜单外区域 / 遮罩关闭 */
  document.addEventListener("click", function (e) {
    if (
      nav.classList.contains("is-open") &&
      !nav.contains(e.target) &&
      !menuBtn.contains(e.target)
    ) {
      toggleMenu(true);
    }
  });

  /** ESC 关闭；Tab 在菜单内循环焦点 */
  document.addEventListener("keydown", function (e) {
    if (!nav.classList.contains("is-open")) {
      return;
    }

    if (e.key === "Escape") {
      toggleMenu(true);
      return;
    }

    if (e.key !== "Tab") {
      return;
    }

    var focusable = getMenuFocusableElements();
    if (!focusable.length) {
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !nav.contains(active) && active !== menuBtn) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /** 窗口尺寸变化超过 md 断点时重置菜单 */
  var mdBreakpoint = 768;
  window.addEventListener("resize", function () {
    if (window.innerWidth >= mdBreakpoint && nav.classList.contains("is-open")) {
      toggleMenu(true);
    }
  });
})();
