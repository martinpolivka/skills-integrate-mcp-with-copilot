document.addEventListener("DOMContentLoaded", () => {
  const taskForm = document.getElementById("task-form");
  const messageDiv = document.getElementById("task-message");
  const columns = {
    "To Do": document.getElementById("todo-column"),
    "In Progress": document.getElementById("in-progress-column"),
    Done: document.getElementById("done-column"),
  };

  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function taskCard(task) {
    return `
      <article class="task-card">
        <h5>${task.title}</h5>
        <p>${task.description}</p>
        <p class="task-status">Status: ${task.status}</p>
      </article>
    `;
  }

  function renderTasks(tasks) {
    Object.values(columns).forEach((column) => {
      column.innerHTML = "";
    });

    ["To Do", "In Progress", "Done"].forEach((status) => {
      const matchingTasks = tasks.filter((task) => task.status === status);

      if (matchingTasks.length === 0) {
        columns[status].innerHTML = '<p class="empty-state">No tasks in this column.</p>';
        return;
      }

      columns[status].innerHTML = matchingTasks.map(taskCard).join("");
    });
  }

  async function fetchTasks() {
    try {
      const response = await fetch("/tasks");
      const tasks = await response.json();
      renderTasks(tasks);
    } catch (error) {
      Object.values(columns).forEach((column) => {
        column.innerHTML = '<p class="empty-state">Failed to load organizer tasks.</p>';
      });
      console.error("Error fetching tasks:", error);
    }
  }

  taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      title: document.getElementById("task-title").value,
      description: document.getElementById("task-description").value,
      status: document.getElementById("task-status").value,
    };

    try {
      const response = await fetch("/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Unable to create task.", "error");
        return;
      }

      taskForm.reset();
      showMessage(`Created organizer task: ${result.title}`, "success");
      fetchTasks();
    } catch (error) {
      showMessage("Failed to create task. Please try again.", "error");
      console.error("Error creating task:", error);
    }
  });

  fetchTasks();
});