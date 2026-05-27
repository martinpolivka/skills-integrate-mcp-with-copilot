document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const registerForm = document.getElementById("register-form");
  const loginForm = document.getElementById("login-form");
  const logoutBtn = document.getElementById("logout-btn");
  const authStatus = document.getElementById("auth-status");

  let authToken = localStorage.getItem("authToken") || "";
  let currentUser = null;

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");
    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function authHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function updateAuthUI() {
    if (currentUser) {
      authStatus.textContent = `Signed in as ${currentUser.email} (${currentUser.role})`;
      logoutBtn.classList.remove("hidden");
    } else {
      authStatus.textContent = "Not signed in";
      logoutBtn.classList.add("hidden");
    }
  }

  async function fetchCurrentUser() {
    if (!authToken) {
      currentUser = null;
      updateAuthUI();
      return;
    }

    try {
      const response = await fetch("/auth/me", { headers: authHeaders() });
      if (!response.ok) {
        authToken = "";
        localStorage.removeItem("authToken");
        currentUser = null;
      } else {
        currentUser = await response.json();
      }
    } catch (error) {
      currentUser = null;
    }

    updateAuthUI();
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = "<option value=''>-- Select an activity --</option>";

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) => {
                      const deleteButton =
                        currentUser && currentUser.role === "admin"
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                          : "";
                      return `<li><span class="participant-email">${email}</span>${deleteButton}</li>`;
                    }
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    if (!currentUser || currentUser.role !== "admin") {
      showMessage("Admin login is required to unregister students.", "error");
      return;
    }

    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      showMessage("Please sign in before registering for an activity.", "error");
      return;
    }

    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: "student" }),
      });

      const result = await response.json();
      if (response.ok) {
        registerForm.reset();
        showMessage(`Registered ${result.email}. You can now sign in.`, "success");
      } else {
        showMessage(result.detail || "Registration failed", "error");
      }
    } catch (error) {
      showMessage("Registration failed. Please try again.", "error");
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      if (response.ok) {
        authToken = result.token;
        localStorage.setItem("authToken", authToken);
        currentUser = { email: result.email, role: result.role };
        loginForm.reset();
        updateAuthUI();
        fetchActivities();
        showMessage("Signed in successfully.", "success");
      } else {
        showMessage(result.detail || "Sign in failed", "error");
      }
    } catch (error) {
      showMessage("Sign in failed. Please try again.", "error");
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: authHeaders(),
      });
    } catch (error) {
      // Ignore logout request failures and clear local session anyway.
    }

    authToken = "";
    currentUser = null;
    localStorage.removeItem("authToken");
    updateAuthUI();
    fetchActivities();
    showMessage("Signed out.", "info");
  });

  // Initialize app
  fetchCurrentUser().then(fetchActivities);
});
