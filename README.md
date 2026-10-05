# SyncLedger

Offline Payment Reconciliation Simulator built for BITSHIFT 2026.

## Problem

When a payment system loses connectivity, transaction records may remain
unsynchronized. Retrying them can create duplicates, while changed records
can cause amount mismatches.

SyncLedger simulates these situations and demonstrates synchronization,
verification, duplicate handling, and conflict review.

This project simulates transaction records. It does not transfer real money.

## Features

- Shared login page for owners and branch managers.
- Owner dashboard for Ranchi and Patna branches.
- Managers restricted to their assigned branch.
- Sale entry with amount, category, item/service, and note.
- Local transaction storage using IndexedDB.
- Offline simulation and pending transaction queue.
- Automatic retry or manual synchronization.
- Duplicate detection using transaction IDs.
- Comparison of incoming details with saved server records.
- Owner conflict review with original-record preservation.
- Connection status banner.
- Browser activity trail and owner JSON report export.
- Testing controls for repeated retries, amount conflicts, and lost confirmations.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Local browser storage | IndexedDB |
| Backend | Java, Spring Boot |
| Authentication | Spring Security, BCrypt |
| Database access | Spring Data JPA, Hibernate |
| Server database | MySQL |
| Build | Maven Wrapper |
| Version control | Git, GitHub |

The project targets Java 21 and has been run locally with Java 25.

## Accounts

| Username | Access |
|---|---|
| owner | Owner dashboard and all configured branches |
| ranchi | Ranchi branch: RANCHI-01 |
| patna | Patna branch: PATNA-01 |

Passwords are supplied through environment variables.
No default passwords are included.

Accounts are configured in memory when the backend starts.
Use the same password values on each restart to keep login credentials consistent.

## Requirements

- Compatible JDK; Java 25 was used for the local demo.
- MySQL 8.
- Modern browser.
- PowerShell on Windows.

Maven is included through the Maven Wrapper.
Internet access is needed for the initial dependency download.

## Database Setup

Open MySQL:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

Enter your MySQL password, then run:

```sql
CREATE DATABASE IF NOT EXISTS syncledger;
exit;
```

The application connects to:

```text
jdbc:mysql://localhost:3306/syncledger
```

For this local demo, Hibernate updates the database schema at startup.

## Run on Windows

Open PowerShell in the project's backend folder:

```powershell
cd "C:\Users\Ayush Kumar\OneDrive\Desktop\SyncLedger\backend"
```

Set all four passwords in this same terminal:

```powershell
$dbSecret = Read-Host "MySQL password" -AsSecureString
$env:SYNCLEDGER_DB_PASSWORD = [System.Net.NetworkCredential]::new("", $dbSecret).Password
Remove-Variable dbSecret

$ownerSecret = Read-Host "Owner login password" -AsSecureString
$env:SYNCLEDGER_OWNER_PASSWORD = [System.Net.NetworkCredential]::new("", $ownerSecret).Password
Remove-Variable ownerSecret

$ranchiSecret = Read-Host "Ranchi manager password" -AsSecureString
$env:SYNCLEDGER_RANCHI_PASSWORD = [System.Net.NetworkCredential]::new("", $ranchiSecret).Password
Remove-Variable ranchiSecret

$patnaSecret = Read-Host "Patna manager password" -AsSecureString
$env:SYNCLEDGER_PATNA_PASSWORD = [System.Net.NetworkCredential]::new("", $patnaSecret).Password
Remove-Variable patnaSecret
```

Start the backend:

```powershell
.\mvnw.cmd spring-boot:run
```

Open:

```text
http://localhost:8081/login.html
```

Keep the backend terminal running.
Use Ctrl+C to stop it.

These environment variables apply to the current terminal.
Set them again after opening a new terminal.

## Demo 1: Offline Sale and Recovery

1. Sign in as a branch manager.
2. Keep Automatic Sync ON.
3. Open Testing Lab and select Set Simulated Offline.
4. Create a sale.
5. Confirm that the sale is waiting and the pending count increases.
6. Select Set Simulated Online.
7. Wait for automatic retry.
8. Confirm that the sale becomes SYNCED and pending returns to zero.
9. Open the owner dashboard and verify the branch sale.

Use a separate browser profile or Incognito window for the owner
if both accounts need to stay signed in simultaneously.

## Demo 2: Duplicate Retry

1. Keep the branch Simulated Online.
2. Select a SYNCED sale in Branch Sales.
3. Note the branch total and sale count.
4. Select Retry Selected ×10 in Testing Lab.
5. Check DUPLICATE results in Activity.
6. Verify that the total and sale count remain unchanged.

## Demo 3: Amount Conflict

1. Select a SYNCED sale.
2. Select Inject Amount Conflict.
3. The simulator sends the same transaction ID with a changed amount.
4. Open Conflicts in the owner dashboard.
5. Compare the incoming attempt with the original server sale.
6. Enter a review note.
7. Select Keep Original & Resolve.
8. Confirm RESOLVED status and preservation of the original amount.

## Demo 4: Lost Confirmation

1. Keep the branch Simulated Online.
2. Set Automatic Sync OFF.
3. Turn Drop Next Confirmation ON.
4. Create a new sale.
5. Select Sync Pending Sales.
6. Confirm ACK_LOST in Activity and a pending local sale.
7. Check that Drop Next Confirmation has returned to OFF.
8. Select Sync Pending Sales again.
9. Confirm DUPLICATE, then SYNCED and pending zero.
10. Verify that the amount was counted only once.
11. Restore Automatic Sync ON.

The simulator intentionally discards a response after the server
processes the request. This demonstrates recovery when the client
does not receive confirmation.

## Reconciliation Results

| Result | Meaning |
|---|---|
| ACCEPTED | New valid transaction saved |
| DUPLICATE | Matching transaction already saved; not counted again |
| CONFLICT | Same transaction ID has different details |
| REJECTED | Transaction failed validation |

SYNCED is the local sale state after a matching server confirmation.
ACK_LOST is a browser activity event for the lost-confirmation simulation.

## Storage and Reports

- Unsynchronized branch sales remain in that browser's IndexedDB.
- Synchronized transactions and conflict records are stored in MySQL.
- Owners see branch transactions after they reach the server.
- Export Report downloads an owner JSON report.
- Owner report export does not back up another browser's pending branch queue.
- Database backups use mysqldump; code backups are stored separately.
- Clearing browser site data can remove locally pending transactions.

## Current Limitations

- Offline entry works on an already loaded manager page.
- Offline page refresh, fresh page loading, and fresh login are not supported.
- Turning off Wi-Fi may not disconnect a backend running on localhost.
  Use Simulated Offline for the controlled demo.
- Two branches and three accounts are configured for the prototype.
- Browser activity is local, not a centralized audit log.
- The project has not been validated for multiple backend instances
  or production-scale concurrent traffic.
- Payment gateway integration and real money transfer are outside the scope.

## Troubleshooting

- MySQL Access denied: verify the MySQL password and set
  SYNCLEDGER_DB_PASSWORD in the terminal used to start the backend.
- Missing password placeholder: set all four required environment variables.
- Site cannot be reached: confirm the backend started on port 8081.
- Login fails: use the account password supplied at backend startup.
- Pending sales remain: check branch simulation mode, server availability,
  login session, and Automatic Sync settings.

## Future Improvements

- Offline page caching with a service worker.
- Persistent user and branch administration.
- Stronger database concurrency handling and automated integration tests.
- Centralized audit history.
- Deployment with HTTPS and production database configuration.