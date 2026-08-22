const voteForm = document.querySelector("[data-vote-form]");

if (voteForm) {
  const ticketSplash = document.querySelector("[data-ticket-splash]");

  if (ticketSplash) {
    const storageKey = `public-voting-pass:${ticketSplash.dataset.splashKey}`;
    let splashSeen = false;

    try {
      splashSeen = sessionStorage.getItem(storageKey) === "shown";
      if (!splashSeen) sessionStorage.setItem(storageKey, "shown");
    } catch (error) {
      splashSeen = false;
    }

    if (splashSeen) {
      ticketSplash.remove();
    } else {
      document.body.classList.add("ticket-splash-active");
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.setTimeout(
        () => {
          ticketSplash.remove();
          document.body.classList.remove("ticket-splash-active");
        },
        reducedMotion ? 120 : 1850,
      );
    }
  }

  const views = Array.from(document.querySelectorAll("[data-app-view]"));
  const navigationButtons = Array.from(
    document.querySelectorAll("[data-app-nav]"),
  );
  const projectFeatures = Array.from(
    document.querySelectorAll("[data-project-feature]"),
  );
  const projectsView = document.querySelector('[data-app-view="projects"]');
  const projectTour = document.querySelector(".project-tour");
  const projectDots = Array.from(document.querySelectorAll("[data-project-dot]"));
  const message = voteForm.querySelector("[data-vote-message]");
  const projectCurrent = document.querySelector("[data-project-current]");
  const projectPrevious = document.querySelector("[data-project-previous]");
  const projectNext = document.querySelector("[data-project-next]");
  const voteBack = voteForm.querySelector("[data-vote-back]");
  const submitButton = voteForm.querySelector("[data-vote-submit]");
  const voteSubmitted = voteForm.dataset.voteSubmitted === "true";
  const groupFocusEnter = document.querySelector("[data-group-focus-enter]");
  const groupFocusExit = document.querySelector("[data-group-focus-exit]");
  const voteSuccess = document.querySelector("[data-vote-success]");
  let currentProject = 0;
  let groupFocusMode = false;
  let swipeStartX = 0;
  let swipeStartY = 0;

  const setHash = (viewName) => {
    const url = new URL(window.location.href);
    url.hash = viewName;
    window.history.replaceState(null, "", url.toString());
  };

  const showView = (viewName, updateHash = true) => {
    const validView = views.some((view) => view.dataset.appView === viewName)
      ? viewName
      : "vote";

    views.forEach((view) => {
      view.hidden = view.dataset.appView !== validView;
    });
    navigationButtons.forEach((button) => {
      if (button.dataset.appNav === validView) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (updateHash) setHash(validView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setGroupFocusMode = (enabled) => {
    groupFocusMode = Boolean(enabled);
    document.body.classList.toggle("group-focus-mode", groupFocusMode);
    groupFocusEnter.hidden = groupFocusMode;
    groupFocusEnter.setAttribute("aria-pressed", String(groupFocusMode));
    groupFocusExit.hidden = !groupFocusMode;

    if (groupFocusMode) {
      projectsView.scrollTop = 0;
      groupFocusExit.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      groupFocusEnter.focus({ preventScroll: true });
    }
  };

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      const groupId = button.dataset.selectGroup;
      if (groupId && !voteSubmitted) {
        const groupInput = Array.from(
          voteForm.querySelectorAll("input[type=radio]"),
        ).find((input) => input.value === groupId);
        if (groupInput) {
          groupInput.checked = true;
          groupInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      showView(button.dataset.viewTarget);
    });
  });

  const showProject = (index) => {
    currentProject = Math.max(0, Math.min(index, projectFeatures.length - 1));
    projectFeatures.forEach((feature, featureIndex) => {
      feature.hidden = featureIndex !== currentProject;
    });
    projectDots.forEach((dot, dotIndex) => {
      const active = dotIndex === currentProject;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });

    projectCurrent.textContent = String(currentProject + 1);
    projectPrevious.disabled = currentProject === 0;
    projectNext.innerHTML =
      currentProject === projectFeatures.length - 1
        ? 'Vote <img src="/icons/trophy.svg" alt="" />'
        : 'Next <img src="/icons/arrow-right.svg" alt="" />';
    projectNext.setAttribute(
      "aria-label",
      currentProject === projectFeatures.length - 1
        ? "Return to the ballot"
        : "Next group",
    );
    if (groupFocusMode) projectsView.scrollTop = 0;
  };

  groupFocusEnter.addEventListener("click", () => setGroupFocusMode(true));
  groupFocusExit.addEventListener("click", () => setGroupFocusMode(false));

  document.addEventListener("keydown", (event) => {
    if (!groupFocusMode) return;
    if (event.key === "Escape") setGroupFocusMode(false);
    if (event.key === "ArrowLeft") showProject(currentProject - 1);
    if (event.key === "ArrowRight") showProject(currentProject + 1);
  });

  projectTour.addEventListener(
    "touchstart",
    (event) => {
      if (!groupFocusMode || event.touches.length !== 1) return;
      swipeStartX = event.touches[0].clientX;
      swipeStartY = event.touches[0].clientY;
    },
    { passive: true },
  );

  projectTour.addEventListener(
    "touchend",
    (event) => {
      if (!groupFocusMode || event.changedTouches.length !== 1) return;
      const deltaX = event.changedTouches[0].clientX - swipeStartX;
      const deltaY = event.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
        return;
      }

      showProject(currentProject + (deltaX < 0 ? 1 : -1));
    },
    { passive: true },
  );

  projectPrevious.addEventListener("click", () => showProject(currentProject - 1));
  projectNext.addEventListener("click", () => {
    if (currentProject === projectFeatures.length - 1) {
      showView("vote");
      return;
    }
    showProject(currentProject + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  projectDots.forEach((dot) => {
    dot.addEventListener("click", () =>
      showProject(Number(dot.dataset.projectDot)),
    );
  });

  const hideMessage = () => {
    message.textContent = "";
    message.classList.remove("visible");
  };

  const showMessage = (text) => {
    message.textContent = text;
    message.classList.add("visible");
  };

  voteBack.addEventListener("click", () => {
    showView("projects");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  voteForm.querySelectorAll("input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      if (voteSubmitted) return;
      hideMessage();
      submitButton.disabled = false;
    });
  });

  voteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    if (voteSubmitted) {
      showMessage("Your vote has already been submitted and cannot be changed.");
      return;
    }

    const selectedGroup = voteForm.querySelector(
      "input[type=radio]:checked",
    )?.value;
    if (!selectedGroup) {
      showMessage("Choose one group before submitting.");
      return;
    }

    submitButton.disabled = true;
    submitButton.dataset.label = submitButton.innerHTML;
    submitButton.classList.add("is-submitting");
    submitButton.innerHTML =
      '<span class="vote-button-spinner" aria-hidden="true"></span> Recording vote...';

    try {
      const response = await fetch("/api/v1/public-voting/votes", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Vote-CSRF": voteForm.dataset.csrf,
        },
        body: JSON.stringify({ group: selectedGroup }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (
          response.status === 409 &&
          String(data.message || "").toLowerCase().includes("already voted")
        ) {
          window.location.reload();
          return;
        }
        throw new Error(data.message || "Vote could not be submitted");
      }
      voteSuccess.hidden = false;
      document.body.classList.add("vote-success-active");
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.setTimeout(() => window.location.reload(), reducedMotion ? 450 : 1450);
    } catch (error) {
      showMessage(error.message);
      submitButton.disabled = false;
      submitButton.classList.remove("is-submitting");
      submitButton.innerHTML = submitButton.dataset.label;
    }
  });

  showProject(0);
  const initialView = window.location.hash.slice(1);
  showView(
    ["show", "projects", "vote"].includes(initialView) ? initialView : "vote",
    false,
  );
}
