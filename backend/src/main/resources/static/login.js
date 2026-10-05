"use strict";

(() => {
    const form = document.getElementById("login-form");
    const username = document.getElementById("username");
    const password = document.getElementById("password");
    const csrfInput = document.getElementById("csrf-token");
    const submitButton = document.getElementById("login-submit");
    const retryButton = document.getElementById("login-retry");
    const message = document.getElementById("login-message");
    const togglePassword = document.getElementById("toggle-password");
    const ownerOption = document.getElementById("role-owner");
    const managerOption = document.getElementById("role-manager");
    const roleHelp = document.getElementById("role-help");
    const usernameHelp = document.getElementById("username-help");

    let preparing = false;
    let submitting = false;

    function showMessage(text, type = "error") {
        message.textContent = text;
        message.className = "login-message " + type;
        message.hidden = false;
    }

    function updateRole() {
        const isOwner = ownerOption.checked;

        roleHelp.textContent = isOwner
            ? "View sales and review conflicts across all demo branches."
            : "Record sales and sync records for your assigned branch.";

        usernameHelp.textContent = isOwner
            ? "Owner demo username: owner"
            : "Branch demo username: ranchi or patna";

        username.placeholder = isOwner
            ? "Enter owner username"
            : "Enter branch manager username";
    }

    async function fetchCsrfToken() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        try {
            const response = await fetch("/api/auth/csrf", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    Accept: "application/json"
                },
                signal: controller.signal
            });

            if (!response.ok || response.redirected) {
                throw new Error("Connection check failed.");
            }

            const result = await response.json();

            if (typeof result.token !== "string" || !result.token) {
                throw new Error("Sign-in token is unavailable.");
            }

            csrfInput.name = "_csrf";
            csrfInput.value = result.token;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function prepareLogin() {
        if (preparing || submitting) return;

        preparing = true;
        submitButton.disabled = true;
        submitButton.textContent = "Connecting...";
        retryButton.hidden = true;

        try {
            await fetchCsrfToken();
            submitButton.disabled = false;
            submitButton.textContent = "Sign In";
        } catch {
            csrfInput.value = "";
            submitButton.textContent = "Server unavailable";
            retryButton.hidden = false;

            showMessage(
                "Server se connection nahi mil raha. " +
                "Backend start karke Retry connection dabayein."
            );
        } finally {
            preparing = false;
        }
    }

    ownerOption.addEventListener("change", updateRole);
    managerOption.addEventListener("change", updateRole);

    togglePassword.addEventListener("click", () => {
        const show = password.type === "password";

        password.type = show ? "text" : "password";
        togglePassword.textContent = show ? "Hide" : "Show";
        togglePassword.setAttribute(
            "aria-label",
            show ? "Hide password" : "Show password"
        );
        togglePassword.setAttribute("aria-pressed", String(show));
    });

    retryButton.addEventListener("click", () => {
        message.hidden = true;
        void prepareLogin();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (submitting || preparing) return;

        username.value = username.value.trim();

        if (!form.reportValidity()) return;

        const isOwner = ownerOption.checked;

        if (isOwner && username.value !== "owner") {
            showMessage(
                "Owner login ke liye username owner use karein. " +
                "Manager account ke liye Branch Manager select karein."
            );
            username.focus();
            return;
        }

        if (!isOwner && !["ranchi", "patna"].includes(username.value)) {
            showMessage(
                "Branch Manager login ke liye apna assigned username " +
                "ranchi ya patna use karein."
            );
            username.focus();
            return;
        }

        submitting = true;
        submitButton.disabled = true;
        submitButton.textContent = "Signing in...";
        retryButton.hidden = true;
        message.hidden = true;

        try {
            await fetchCsrfToken();

            // Submit credentials directly to Spring Security.
            // The authenticated account determines access permissions.
            HTMLFormElement.prototype.submit.call(form);
        } catch {
            submitting = false;
            submitButton.disabled = false;
            submitButton.textContent = "Sign In";
            retryButton.hidden = false;

            showMessage(
                "Sign in nahi ho paya: server connection check karein. " +
                "Phir dobara try karein."
            );
        }
    });

    window.addEventListener("online", () => {
        if (submitButton.disabled && !submitting) {
            void prepareLogin();
        }
    });

    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            submitting = false;
            void prepareLogin();
        }
    });

    const parameters = new URLSearchParams(window.location.search);

    if (parameters.has("error")) {
        showMessage(
            "Username ya password match nahi hua. " +
            "Sahi workspace select karke dobara sign in karein."
        );
    } else if (parameters.has("logout")) {
        showMessage("You have signed out successfully.", "success");
    }

    updateRole();
    void prepareLogin();
})();