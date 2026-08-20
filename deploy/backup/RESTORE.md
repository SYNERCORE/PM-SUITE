# ProMaster backup & restore

## What runs

`backup-nightly.ps1` — scheduled task, 01:30 daily. Dumps `proc_master`
(custom compressed format) to `C:\ProcMaster\backup\dumps\`, keeps 90 days,
optionally mirrors to a OneDrive-synced folder so copies land in SharePoint.

## Setup (once)

1. Put the postgres password (one line, nothing else) in
   `C:\ProcMaster\backup\.pgpass.txt`, then restrict it:
   ```powershell
   icacls C:\ProcMaster\backup\.pgpass.txt /inheritance:r /grant "SYSTEM:R" /grant "Administrators:R"
   ```
2. (Optional, recommended) Set `$MirrorDir` in the script to a folder synced
   by the OneDrive client — backups then flow to SharePoint automatically.
3. Register the task:
   ```powershell
   schtasks /Create /TN "ProMaster Nightly Backup" /SC DAILY /ST 01:30 /RU SYSTEM /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\ProcMaster\backup\backup-nightly.ps1"
   ```
4. Test it now: `schtasks /Run /TN "ProMaster Nightly Backup"` then check
   `C:\ProcMaster\backup\backup.log`.

## Restore (full database)

```powershell
$env:PGPASSWORD='<postgres password>'
# Drop and recreate (DESTROYS current data — be sure)
& 'C:\Program Files\PostgreSQL\16\bin\dropdb.exe'   -U postgres proc_master
& 'C:\Program Files\PostgreSQL\16\bin\createdb.exe' -U postgres proc_master
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' -U postgres -d proc_master 'C:\ProcMaster\backup\dumps\proc_master-YYYYMMDD-HHMMSS.dump'
```

## Restore (single table)

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' -U postgres -d proc_master --table=warehouse_items --clean 'C:\ProcMaster\backup\dumps\proc_master-YYYYMMDD-HHMMSS.dump'
```

## Notes

- The app keeps working through a restore: browsers hold full data in
  localStorage and re-mirror writes when the API returns.
- After any restore, users should hit **Pull** per entity in Settings →
  Entity Routing on one device, verify, then let SP sync fan it out —
  or simply keep working; the next edit re-upserts each touched row.
