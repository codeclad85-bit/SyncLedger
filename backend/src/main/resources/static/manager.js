"use strict";

const $ = (id) => document.getElementById(id);

const branches = {
    "RANCHI-01": {
        name: "Ranchi Store",
        location: "Jharkhand · Ranchi District · Ranchi"
    },
    "PATNA-01": {
        name: "Patna Store",
        location: "Bihar · Patna District · Patna"
    }
};

const categories = {
    GROCERY: "Grocery / Kirana",
    FOOD: "Food & Beverages",
    CLOTHING: "Clothing",
    ELECTRONICS: "Electronics",
    SERVICES: "Services",
    OTHER: "Other"
};

let db;
let busy = false;
let serverOnline = false;
let conflictsOnline = false;
let branchId;
let storageKey;
let userSession;

let state = {
    records: [],
    events: [],
    selected: {},
    devices: { "RANCHI-01": true, "PATNA-01": true },
    autoSync: { "RANCHI-01": true, "PATNA-01": true },
    dropAck: { "RANCHI-01": false, "PATNA-01": false },
    duplicates: { "RANCHI-01": 0, "PATNA-01": 0 },
    serverRecords: [],
    serverConflicts: [],
    snapshotAt: null,
    conflictsAt: null
};

const clean = (value) => String(value ?? "").trim() || null;

function paise(value) {
    const text = String(value);

    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        throw new Error("Enter an amount with up to two decimals.");
    }

    const [whole, fraction = ""] = text.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function decimal(value) {
    return (value / 100n).toString() + "." +
        (value % 100n).toString().padStart(2, "0");
}

function moneyPaise(value) {
    return "₹" + new Intl.NumberFormat("en-IN").format(value / 100n) +
        "." + (value % 100n).toString().padStart(2, "0");
}

const money = (value) => moneyPaise(paise(value));

function node(tag, text, className = "") {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = String(text);
    result.className = className;
    return result;
}

function notice(text, error = false) {
    $("manager-notice").textContent = text;
    $("manager-notice").className = error ? "notice error" : "notice";
}

function openStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("syncledger-manager", 1);

        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("state")) {
                request.result.createObjectStore("state");
            }
        };

        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onerror = () => reject(request.error);
    });
}

function readStorage(key) {
    return new Promise((resolve, reject) => {
        const request = db.transaction("state", "readonly")
            .objectStore("state").get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadState() {
    let saved = await readStorage(storageKey);

    // Preserve this branch's earlier simulator records.
    if (!saved) saved = await readStorage("main");

    if (saved) {
        state = {
            ...state,
            ...saved,
            selected: { ...state.selected, ...saved.selected },
            devices: { ...state.devices, ...saved.devices },
            autoSync: { ...state.autoSync, ...saved.autoSync },
            dropAck: { ...state.dropAck, ...saved.dropAck },
            duplicates: { ...state.duplicates, ...saved.duplicates }
        };
    }

    state.records = (state.records || []).filter(
        (record) => record.merchantId === branchId
    );

    state.events = (state.events || []).filter(
        (entry) => entry.merchantId === branchId
    );

    state.serverRecords = (state.serverRecords || []).filter(
        (record) => record.merchantId === branchId
    );

    state.serverConflicts = (state.serverConflicts || []).filter(
        (view) => view.conflict.incomingMerchantId === branchId &&
            (!view.serverRecord ||
                view.serverRecord.merchantId === branchId)
    );
}

function saveState() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("state", "readwrite");
        transaction.objectStore("state").put(state, storageKey);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(
            transaction.error || new Error("Local save aborted.")
        );
    });
}

function activity(status, recordId, reason) {
    state.events.unshift({
        status,
        transactionId: recordId,
        merchantId: branchId,
        reason,
        time: new Date().toISOString()
    });
}

async function api(path, options = {}) {
    return window.SyncLedgerAuth.api(path, options);
}

async function refresh() {
    const results = await Promise.allSettled([
        api("/transactions"),
        api("/conflicts")
    ]);

    serverOnline = results[0].status === "fulfilled" &&
        Array.isArray(results[0].value);

    conflictsOnline = results[1].status === "fulfilled" &&
        Array.isArray(results[1].value);

    if (serverOnline) {
        state.serverRecords = results[0].value.filter(
            (record) => record.merchantId === branchId
        );
        state.snapshotAt = new Date().toISOString();
    }

    if (conflictsOnline) {
        state.serverConflicts = results[1].value.filter(
            (view) => view.conflict.incomingMerchantId === branchId &&
                (!view.serverRecord ||
                    view.serverRecord.merchantId === branchId)
        );
        state.conflictsAt = new Date().toISOString();
    }

    await saveState();
}

function payload(record) {
    return {
        transactionId: record.transactionId,
        merchantId: record.merchantId,
        amount: record.amount,
        currency: record.currency,
        createdAt: record.createdAt,
        category: clean(record.category),
        itemName: clean(record.itemName),
        note: clean(record.note)
    };
}

function sameDetails(a, b) {
    return !!a && !!b &&
        a.transactionId === b.transactionId &&
        a.merchantId === b.merchantId &&
        paise(a.amount) === paise(b.amount) &&
        a.currency === b.currency &&
        Date.parse(a.createdAt) === Date.parse(b.createdAt) &&
        clean(a.category) === clean(b.category) &&
        clean(a.itemName) === clean(b.itemName) &&
        clean(a.note) === clean(b.note);
}

function selectedRecord() {
    return state.records.find(
        (record) => record.merchantId === branchId &&
            record.transactionId === state.selected[branchId]
    );
}

function addCell(row, value) {
    const cell = document.createElement("td");
    if (value instanceof Node) cell.append(value);
    else cell.textContent = String(value ?? "");
    row.append(cell);
}

function emptyRow(body, count, text) {
    const row = document.createElement("tr");
    const cell = node("td", text, "empty-state");
    cell.colSpan = count;
    row.append(cell);
    body.append(row);
}

function lockBranchWorkspace() {
    const selector = $("manager-branch");
    const option = document.createElement("option");
    option.value = branchId;
    option.textContent = branches[branchId].name;
    selector.replaceChildren(option);
    selector.value = branchId;

    const panel = selector.closest("section");
    const label = panel.querySelector("label");
    const helper = panel.querySelector(".helper");

    if (label) label.textContent = "Assigned Branch";
    if (helper) {
        helper.textContent = userSession.role === "OWNER"
            ? "Owner is viewing this branch workspace."
            : "Your account is assigned to this branch only.";
    }

    document.querySelectorAll('a[href="/"]').forEach((link) => {
        if (userSession.role === "MANAGER") link.remove();
    });

    const brand = document.querySelector("a.brand");
    if (brand) {
        brand.href = "/manager.html?branch=" + encodeURIComponent(branchId);
    }

    const simulationNote = document.querySelector(".sidebar-note p");
    if (simulationNote) {
        simulationNote.textContent =
            "Branch transaction simulator. No real money transfers.";
    }

    const logoutButton = node("button", "Logout", "button secondary");
    logoutButton.id = "manager-logout";

    logoutButton.addEventListener("click", () => run(async () => {
        await saveState();
        await window.SyncLedgerAuth.logout();
    }));

    document.querySelector(".header-status").append(logoutButton);

    const url = new URL(location.href);
    url.searchParams.set("branch", branchId);
    history.replaceState(null, "", url);
}

function render() {
    const local = state.records.filter(
        (record) => record.merchantId === branchId
    );

    const pending = local.filter(
        (record) => record.status === "PENDING"
    );

    const remote = state.serverRecords.filter(
        (record) => record.merchantId === branchId
    );

    $("manager-branch").value = branchId;
    $("branch-title").textContent = branches[branchId].name;
    $("branch-location").textContent = branches[branchId].location;

    $("manager-server-status").textContent =
        serverOnline ? "Server Connected" : "Server Unavailable";

    $("manager-server-status").className =
        "badge " + (serverOnline ? "success" : "warning");

    $("manager-total").textContent = state.snapshotAt
        ? moneyPaise(remote.reduce(
            (sum, record) => sum + paise(record.amount), 0n
        ))
        : "Unavailable";

    $("manager-snapshot-time").textContent = state.snapshotAt
        ? (serverOnline ? "Updated: " : "Last synced data: ") +
            new Date(state.snapshotAt).toLocaleString()
        : "No saved server snapshot";

    $("manager-pending").textContent = pending.length;
    $("manager-duplicates").textContent = state.duplicates[branchId];

    $("manager-conflicts").textContent = state.conflictsAt
        ? state.serverConflicts.filter(
            (view) => view.conflict.status === "OPEN"
        ).length + (conflictsOnline ? "" : " (cached)")
        : "Unavailable";

    const simulatedOnline = state.devices[branchId];

    $("manager-connection").textContent = !simulatedOnline
        ? "Simulated Offline"
        : serverOnline ? "Ready to Sync" : "Server Unavailable";

    $("manager-connection").className =
        "badge " + (simulatedOnline && serverOnline ? "success" : "warning");

    $("manager-toggle").textContent = simulatedOnline
        ? "Set Simulated Offline" : "Set Simulated Online";

    $("manager-drop").textContent = "Drop Next Confirmation: " +
        (state.dropAck[branchId] ? "ON" : "OFF");

    $("manager-auto-sync").value =
        state.autoSync[branchId] ? "ON" : "OFF";

    $("manager-selected").textContent =
        state.selected[branchId] || "None selected";

    const body = $("manager-local-sales");
    body.replaceChildren();

    for (const record of local) {
        const row = document.createElement("tr");
        const radio = document.createElement("input");

        radio.type = "radio";
        radio.name = "manager-selection";
        radio.checked = record.transactionId === state.selected[branchId];
        radio.setAttribute("aria-label", "Select " + record.itemName);

        radio.addEventListener("change", () => run(async () => {
            state.selected[branchId] = record.transactionId;
            await saveState();
        }));

        const item = document.createElement("div");
        item.append(
            node("strong", record.itemName),
            node("p", categories[record.category] || "Other", "helper")
        );

        const labels = {
            PENDING: "Waiting to Sync",
            SYNCED: "Synced",
            CONFLICT: "Review Needed",
            REJECTED: "Needs Correction"
        };

        addCell(row, radio);
        addCell(row, item);
        addCell(row, money(record.amount));
        addCell(row, node(
            "span",
            labels[record.status] || record.status,
            "badge " + record.status.toLowerCase()
        ));
        addCell(row, record.reason);
        body.append(row);
    }

    if (!local.length) {
        emptyRow(body, 5, "No local sales for this branch.");
    }

    const selected = selectedRecord();
    const details = $("manager-sale-details");
    details.replaceChildren();

    if (!selected) {
        details.append(node("p", "Select a sale.", "empty-state"));
    } else {
        for (const [label, value] of [
            ["Item", selected.itemName],
            ["Category", categories[selected.category] || "Other"],
            ["Amount", money(selected.amount)],
            ["Note", selected.note || "No note"],
            ["Branch", branches[branchId].name],
            ["ID", selected.transactionId],
            ["Created", new Date(selected.createdAt).toLocaleString()]
        ]) {
            details.append(node("p", label + ": " + value));
        }
    }

    const box = $("manager-verification");
    box.className = "verification-box";
    box.replaceChildren();

    if (!selected) {
        box.textContent = "Select a sale.";
    } else if (!serverOnline) {
        box.textContent =
            "Live verification unavailable. Last synced data may be shown below.";
    } else {
        const matched = remote.find(
            (record) => record.transactionId === selected.transactionId
        );

        if (!matched) {
            box.textContent = "Not on server. Local sale awaits sync.";
        } else {
            const equal = sameDetails(selected, matched);
            box.classList.add(equal ? "success" : "error");
            box.append(
                node("strong", equal ? "MATCH" : "DETAILS DIFFER"),
                node("p",
                    "Local " + money(selected.amount) +
                    " · Server " + money(matched.amount))
            );
        }
    }

    const ledger = $("manager-server-sales");
    ledger.replaceChildren();

    for (const record of remote) {
        const row = document.createElement("tr");
        const item = document.createElement("div");

        item.append(
            node("strong", record.itemName || "Earlier test record"),
            node("p", record.transactionId, "helper")
        );

        addCell(row, item);
        addCell(row, money(record.amount));
        addCell(row, new Date(record.receivedAt).toLocaleString());
        ledger.append(row);
    }

    if (!remote.length) {
        emptyRow(ledger, 3, state.snapshotAt
            ? "No sales in this branch snapshot."
            : "No server snapshot.");
    }

    $("manager-ledger-count").textContent = state.snapshotAt
        ? remote.length + " records" +
            (serverOnline ? "" : " · last synced data")
        : "No server snapshot";

    const events = $("manager-events");
    events.replaceChildren();

    for (const entry of state.events.slice(0, 50)) {
        const card = node(
            "div", undefined, "event-card " + entry.status.toLowerCase()
        );

        card.append(
            node("strong", entry.status),
            node("p", entry.reason),
            node("small", new Date(entry.time).toLocaleString())
        );

        events.append(card);
    }

    document.querySelectorAll("button, input, select, textarea")
        .forEach((control) => {
            control.disabled = busy || control.id === "manager-branch";
        });
}

async function run(action) {
    if (busy) return;

    busy = true;
    render();

    try {
        await action();
    } catch (error) {
        notice(error.message, true);
    } finally {
        busy = false;
        render();
    }
}

async function send(record, incoming = payload(record)) {
    if (record.merchantId !== branchId || incoming.merchantId !== branchId) {
        throw new Error("This sale does not belong to your branch.");
    }

    if (!state.devices[branchId]) {
        notice("Simulated offline. Sale stays on this device.");
        return false;
    }

    activity("SENT", record.transactionId, "Sync request sent.");
    await saveState();

    try {
        const result = await api("/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(incoming)
        });

        if (!["ACCEPTED", "DUPLICATE", "CONFLICT", "REJECTED"]
                .includes(result.status)) {
            throw new Error("Unexpected server response.");
        }

        if (state.dropAck[branchId]) {
            state.dropAck[branchId] = false;
            activity("ACK_LOST", record.transactionId,
                "Confirmation discarded. Local status unchanged.");
            await saveState();
            notice("Confirmation dropped. Retry the same sale safely.");
            return false;
        }

        activity(result.status, record.transactionId, result.reason);

        if (result.status === "DUPLICATE") {
            state.duplicates[branchId]++;
        }

        if (["ACCEPTED", "DUPLICATE"].includes(result.status)) {
            if (!sameDetails(incoming, result.serverRecord)) {
                throw new Error("Server confirmation details do not match.");
            }

            if (sameDetails(record, incoming)) {
                record.status = "SYNCED";
                record.reason = result.reason;
            }
        } else if (sameDetails(record, incoming)) {
            record.status = result.status;
            record.reason = result.reason;
        }

        await saveState();
        notice(result.status + ": " + result.reason);
        return true;
    } catch (error) {
        serverOnline = false;
        activity("ERROR", record.transactionId,
            "No verified confirmation. Local sale preserved. " + error.message);
        await saveState();
        notice("Sync failed. Local sale preserved. " + error.message, true);
        return false;
    }
}

async function syncPending() {
    if (!state.devices[branchId]) {
        notice("Simulated offline. Pending sales remain local.");
        return;
    }

    const pending = state.records.filter(
        (record) => record.merchantId === branchId &&
            record.status === "PENDING"
    );

    for (const record of pending) {
        if (!await send(record)) break;
    }

    await refresh();
}

function wireControls() {
    $("manager-sale-form").addEventListener("submit", (event) => {
        event.preventDefault();

        const category = $("manager-category").value;
        const itemName = $("manager-item").value.trim();
        const amount = $("manager-amount").value;
        const note = $("manager-note").value.trim();

        run(async () => {
            const amountPaise = paise(amount);

            if (amountPaise <= 0n || amountPaise > 999999999999999n) {
                throw new Error("Enter a positive amount within the limit.");
            }

            if (!categories[category] || !itemName || itemName.length > 120) {
                throw new Error("Choose a category and enter an item name.");
            }

            if (note.length > 500) {
                throw new Error("Note must be at most 500 characters.");
            }

            const record = {
                transactionId: "TX-" + crypto.randomUUID(),
                merchantId: branchId,
                amount: decimal(amountPaise),
                currency: "INR",
                createdAt: new Date().toISOString(),
                category,
                itemName,
                note: note || null,
                status: "PENDING",
                reason: "Saved locally. Awaiting server confirmation."
            };

            state.records.unshift(record);
            state.selected[branchId] = record.transactionId;
            activity("PENDING", record.transactionId, record.reason);
            await saveState();

            $("manager-item").value = "";
            $("manager-amount").value = "";
            $("manager-note").value = "";

            notice("Sale saved on this branch device.");

            if (state.autoSync[branchId] && state.devices[branchId]) {
                await syncPending();
            }
        });
    });

    $("manager-refresh").addEventListener("click", () => run(refresh));
    $("manager-sync").addEventListener("click", () => run(syncPending));

    $("manager-auto-sync").addEventListener("change", (event) => {
        const enabled = event.target.value === "ON";

        run(async () => {
            state.autoSync[branchId] = enabled;
            await saveState();
            notice(enabled ? "Automatic sync enabled." : "Manual sync enabled.");

            if (enabled && state.devices[branchId]) {
                await syncPending();
            }
        });
    });

    $("manager-toggle").addEventListener("click", () => run(async () => {
        state.devices[branchId] = !state.devices[branchId];
        activity("DEVICE", branchId, "Simulated connection: " +
            (state.devices[branchId] ? "Online" : "Offline"));
        await saveState();

        if (state.autoSync[branchId] && state.devices[branchId]) {
            await syncPending();
        } else {
            notice("Simulated branch connection updated.");
        }
    }));

    $("manager-drop").addEventListener("click", () => run(async () => {
        state.dropAck[branchId] = !state.dropAck[branchId];
        await saveState();
        notice("Confirmation drop " +
            (state.dropAck[branchId] ? "enabled." : "disabled."));
    }));

    $("manager-retry").addEventListener("click", () => run(async () => {
        const record = selectedRecord();
        if (!record) throw new Error("Select a sale first.");

        for (let index = 0; index < 10; index++) {
            if (!await send(record)) break;
        }

        await refresh();
    }));

    $("manager-inject").addEventListener("click", () => run(async () => {
        const record = selectedRecord();
        if (!record) throw new Error("Select a sale first.");

        await refresh();

        if (!serverOnline || !state.serverRecords.some(
            (saved) => saved.transactionId === record.transactionId
        )) {
            throw new Error("Sync the sale before injecting a conflict.");
        }

        const changed = paise(record.amount) + 5000n;

        if (changed > 999999999999999n) {
            throw new Error("Changed amount exceeds the supported limit.");
        }

        const incoming = payload(record);
        incoming.amount = decimal(changed);

        await send(record, incoming);
        await refresh();
    }));

    window.addEventListener("offline", () => {
        serverOnline = false;
        conflictsOnline = false;
        render();
        notice("Network disconnected. You can save sales locally.");
    });

    window.addEventListener("online", () => {
        if (busy) return;

        run(async () => {
            if (state.autoSync[branchId] && state.devices[branchId]) {
                await syncPending();
            } else {
                await refresh();
            }
        });
    });
}

async function loadAuthHelper() {
    if (window.SyncLedgerAuth) return;

    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/auth-client.js";
        script.onload = resolve;
        script.onerror = () => reject(
            new Error("Could not load auth-client.js.")
        );
        document.head.append(script);
    });
}

async function initialize() {
    try {
        await loadAuthHelper();
        userSession = await window.SyncLedgerAuth.loadSession();

        const requested = new URLSearchParams(location.search).get("branch");

        branchId = userSession.role === "MANAGER"
            ? userSession.branchId
            : branches[requested] ? requested : "RANCHI-01";

        storageKey = "account:" + userSession.username + ":" + branchId;

        await openStorage();
        await loadState();
        await saveState();

        lockBranchWorkspace();
        wireControls();
        render();

        await run(refresh);

        notice(serverOnline
            ? "Branch ready. Save a sale to begin."
            : "Server unavailable. You can still save local sales.");

        setInterval(() => {
            if (busy || document.hidden) return;

            run(async () => {
                const pending = state.records.some(
                    (record) => record.status === "PENDING"
                );

                if (pending && state.autoSync[branchId] &&
                        state.devices[branchId]) {
                    await syncPending();
                } else {
                    await refresh();
                }
            });
        }, 15000);
    } catch (error) {
        notice("Initialization failed: " + error.message, true);

        document.querySelectorAll("button, input, select, textarea")
            .forEach((control) => {
                control.disabled = true;
            });
    }
}

initialize();