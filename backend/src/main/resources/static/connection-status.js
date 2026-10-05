"use strict";

(() => {
    if (window.syncLedgerConnectionBanner) return;
    window.syncLedgerConnectionBanner = true;

    let serverReachable = null;
    let checking = false;

    const banner = document.createElement("section");
    banner.id = "connection-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");

    Object.assign(banner.style, {
        position: "sticky",
        top: "0",
        zIndex: "1000",
        padding: "14px 20px",
        marginBottom: "16px",
        border: "1px solid",
        borderRadius: "12px",
        fontFamily: "inherit",
        lineHeight: "1.6",
        boxShadow: "0 4px 18px rgba(0,0,0,0.15)"
    });

    const title = document.createElement("strong");
    const message = document.createElement("div");
    const queue = document.createElement("div");

    banner.append(title, message, queue);

    const anchor =
        document.getElementById("manager-notice") ||
        document.getElementById("notice");

    if (anchor) {
        anchor.before(banner);
    } else {
        document.body.prepend(banner);
    }

    function updateBanner() {
        const isManager = !!document.getElementById("manager-pending");

        const pendingElement = document.getElementById(
            isManager ? "manager-pending" : "pending-count"
        );

        const pending = pendingElement
            ? pendingElement.textContent.trim()
            : "—";

        const automatic = document.getElementById("manager-auto-sync");
        const manualSync = automatic && automatic.value === "OFF";

        const simulatedConnection =
            document.getElementById("manager-connection");

        const simulatedOffline = simulatedConnection &&
            simulatedConnection.textContent.includes("Simulated Offline");

        let heading;
        let explanation;
        let background;
        let border;

        if (serverReachable === null) {
            heading = "Checking connection…";
            explanation = "Server connection check ho raha hai.";
            background = "#17263c";
            border = "#526783";
        } else if (simulatedOffline) {
            heading = "Offline Simulation ON";
            explanation =
                "Is branch ki sales device par save hongi. " +
                "Simulated Online karne ke baad sync kar sakte hain.";
            background = "#382b12";
            border = "#e9b44c";
        } else if (!navigator.onLine) {
            heading = "Internet Disconnected";
            explanation = serverReachable
                ? "Internet band hai, lekin is laptop ka local server reachable hai."
                : "Server se connection nahi hai. Nayi sales is device par save kar sakte hain.";
            background = "#382b12";
            border = "#e9b44c";
        } else if (!serverReachable) {
            heading = "Server Unavailable";
            explanation =
                "Server se confirmation nahi mil raha. " +
                "Nayi sales is device par save kar sakte hain. " +
                "Pehle se synced sales ka status nahi badlega.";
            background = "#3b1d24";
            border = "#ef8798";
        } else {
            heading = "Server Connected";
            explanation = "Server reachable hai. Sales sync kar sakte hain.";
            background = "#12342d";
            border = "#54c9a5";
        }

        title.textContent = heading;
        message.textContent = explanation;

        let instructions = "";

        if (isManager) {
            instructions = manualSync
                ? "Automatic Sync OFF: connection available hone par Sync Pending dabayein."
                : "Automatic Sync ON: branch online aur server reachable hone par pending sales automatically retry hongi.";
        } else {
            instructions =
                "Yeh pending count is owner browser ki local queue ka hai.";
        }

        queue.textContent =
            "Pending sales: " + pending + ". " + instructions;

        banner.style.background = background;
        banner.style.borderColor = border;
        banner.style.color = "#f5f7fb";
    }

    async function checkConnection() {
        if (checking) return;

        checking = true;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        try {
            const response = await fetch("/api/health", {
                cache: "no-store",
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error("Health check failed.");
            }

            const result = await response.json();
            serverReachable = result.status === "UP";
        } catch {
            serverReachable = false;
        } finally {
            clearTimeout(timeout);
            checking = false;
            updateBanner();
        }
    }

    const observedIds = [
        "manager-pending",
        "pending-count",
        "manager-connection"
    ];

    const observer = new MutationObserver(updateBanner);

    for (const id of observedIds) {
        const element = document.getElementById(id);

        if (element) {
            observer.observe(element, {
                childList: true,
                characterData: true,
                subtree: true
            });
        }
    }

    const automatic = document.getElementById("manager-auto-sync");

    if (automatic) {
        automatic.addEventListener("change", updateBanner);
    }

    window.addEventListener("offline", () => {
        serverReachable = null;
        updateBanner();
        void checkConnection();
    });

    window.addEventListener("online", () => {
        serverReachable = null;
        updateBanner();
        void checkConnection();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void checkConnection();
    });

    setInterval(() => {
        if (!document.hidden) void checkConnection();
    }, 5000);

    updateBanner();
    void checkConnection();
})();