"use strict";

window.SyncLedgerAuth = (() => {
    let session = null;

    async function requestJson(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            credentials: "same-origin",
            cache: "no-store",
            signal: options.signal || AbortSignal.timeout(6000)
        });

        const contentType = response.headers.get("content-type") || "";
        const responsePath = new URL(response.url).pathname;

        if (response.redirected &&
                ["/login", "/login.html"].includes(responsePath)) {
            throw new Error(
                "Login expired. Open /login.html and sign in again. " +
                "Pending sales remain saved on this device."
            );
        }

        if (response.status === 401) {
            throw new Error(
                "Login required. Open /login.html and sign in again."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Access denied or security token expired. " +
                "Refresh the page after signing in."
            );
        }

        if (!response.ok) {
            throw new Error("Server returned HTTP " + response.status);
        }

        if (!contentType.includes("application/json")) {
            throw new Error("Expected a JSON response from the server.");
        }

        return response.json();
    }

    async function loadSession() {
        session = await requestJson("/api/auth/me");

        if (!["OWNER", "MANAGER"].includes(session.role)) {
            session = null;
            throw new Error("Invalid account role.");
        }

        if (session.role === "MANAGER" &&
                !["RANCHI-01", "PATNA-01"].includes(session.branchId)) {
            session = null;
            throw new Error("No valid branch assigned to this account.");
        }

        return session;
    }

    async function api(path, options = {}) {
        const method = String(options.method || "GET").toUpperCase();
        const headers = new Headers(options.headers || {});

        if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
            const csrf = await requestJson("/api/auth/csrf");

            if (!csrf.headerName || !csrf.token) {
                throw new Error("Security token unavailable. Try again.");
            }

            headers.set(csrf.headerName, csrf.token);
        }

        return requestJson("/api" + path, {
            ...options,
            method,
            headers
        });
    }

    async function logout() {
        const csrf = await requestJson("/api/auth/csrf");

        if (!csrf.headerName || !csrf.token) {
            throw new Error("Security token unavailable. Try again.");
        }

        const response = await fetch("/logout", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                [csrf.headerName]: csrf.token
            },
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) {
            throw new Error("Logout failed. Try again.");
        }

        session = null;
        location.replace("/login.html?logout");
    }

    return {
        loadSession,
        api,
        logout,
        getSession: () => session
    };
})();