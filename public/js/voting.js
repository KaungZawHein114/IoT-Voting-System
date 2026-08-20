const voteForm = document.querySelector("[data-vote-form]");

if (voteForm) {
  const ticketSplash = document.querySelector("[data-ticket-splash]");

  if (ticketSplash) {
    const storageKey = `voting-pass:${ticketSplash.dataset.splashKey}`;
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
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  const navigationButtons = Array.from(document.querySelectorAll("[data-app-nav]"));
  const projectFeatures = Array.from(document.querySelectorAll("[data-project-feature]"));
  const projectDots = Array.from(document.querySelectorAll("[data-project-dot]"));
  const categories = Array.from(voteForm.querySelectorAll("[data-category-id]"));
  const message = voteForm.querySelector("[data-vote-message]");
  const projectCurrent = document.querySelector("[data-project-current]");
  const categoryCurrent = voteForm.querySelector("[data-category-current]");
  const categoryProgress = voteForm.querySelector("[data-category-progress]");
  const projectPrevious = document.querySelector("[data-project-previous]");
  const projectNext = document.querySelector("[data-project-next]");
  const votePrevious = voteForm.querySelector("[data-vote-previous]");
  const voteNext = voteForm.querySelector("[data-vote-next]");
  const submitButton = voteForm.querySelector("[data-vote-submit]");
  let currentProject = 0;
  let currentCategory = 0;

  const setHash = (viewName) => {
    const url = new URL(window.location.href);
    url.hash = viewName;
    window.history.replaceState(null, "", url.toString());
  };

  const showView = (viewName, updateHash = true) => {
    const validView = views.some((view) => view.dataset.appView === viewName)
      ? viewName
      : "show";

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

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
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
        ? 'Start voting <img src="/icons/vote.svg" alt="" />'
        : 'Next project <img src="/icons/arrow-right.svg" alt="" />';
  };

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
    dot.addEventListener("click", () => showProject(Number(dot.dataset.projectDot)));
  });

  const hideMessage = () => {
    message.textContent = "";
    message.classList.remove("visible");
  };

  const showMessage = (text) => {
    message.textContent = text;
    message.classList.add("visible");
  };

  const categoryHasSelection = (category) =>
    Boolean(category.querySelector("input[type=radio]:checked"));

  const showCategory = (index) => {
    currentCategory = Math.max(0, Math.min(index, categories.length - 1));
    categories.forEach((category, categoryIndex) => {
      category.hidden = categoryIndex !== currentCategory;
    });

    const onLastCategory = currentCategory === categories.length - 1;
    const hasSelection = categoryHasSelection(categories[currentCategory]);
    categoryCurrent.textContent = String(currentCategory + 1);
    categoryProgress.style.width = `${((currentCategory + 1) / categories.length) * 100}%`;
    voteNext.hidden = onLastCategory;
    voteNext.disabled = !hasSelection;
    submitButton.hidden = !onLastCategory;
    submitButton.disabled = onLastCategory && !hasSelection;
    hideMessage();
  };

  votePrevious.addEventListener("click", () => {
    if (currentCategory === 0) {
      showView("projects");
      return;
    }
    showCategory(currentCategory - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  voteNext.addEventListener("click", () => {
    if (!categoryHasSelection(categories[currentCategory])) {
      showMessage("Choose one project before continuing.");
      return;
    }
    showCategory(currentCategory + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  voteForm.querySelectorAll("input[type=radio]").forEach((input) => {
    input.addEventListener("change", () => {
      hideMessage();
      if (currentCategory === categories.length - 1) {
        submitButton.disabled = false;
      } else {
        voteNext.disabled = false;
      }
    });
  });

  voteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const selections = categories.map((category) => ({
      votingCategory: category.dataset.categoryId,
      group: category.querySelector("input[type=radio]:checked")?.value,
    }));
    const firstMissingSelection = selections.findIndex((selection) => !selection.group);

    if (firstMissingSelection !== -1) {
      showView("vote");
      showCategory(firstMissingSelection);
      showMessage("Choose one project in every voting category.");
      return;
    }

    submitButton.disabled = true;
    submitButton.dataset.label = submitButton.innerHTML;
    submitButton.textContent = "Submitting...";

    try {
      const response = await fetch(
        `/api/v1/voting/${encodeURIComponent(voteForm.dataset.batch)}/votes`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Vote-CSRF": voteForm.dataset.csrf,
          },
          body: JSON.stringify({ selections }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Vote could not be submitted");
      window.location.reload();
    } catch (error) {
      showMessage(error.message);
      submitButton.disabled = false;
      submitButton.innerHTML = submitButton.dataset.label;
    }
  });

  showProject(0);
  showCategory(0);
  const initialView = window.location.hash.slice(1);
  showView(["show", "projects", "vote"].includes(initialView) ? initialView : "show", false);
}
