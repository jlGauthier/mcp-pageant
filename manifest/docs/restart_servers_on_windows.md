# Restarting Servers on Windows

## Step 1: Know Your Ports

```bash
# Check .env for backend port
grep "^PORT=" .env

# Check package.json for frontend script/port
grep -A2 "dev:frontend" package.json
```

If ports aren't obvious, fix the project documentation.

---

## Step 2: Kill Processes on Those Specific Ports

```bash
# Get ALL PIDs on that port (there may be multiple)
netstat -ano | grep ":<port> " | awk '{print $5}' | sort -u

# Kill each one
netstat -ano | grep ":<port> " | awk '{print $5}' | sort -u | while read pid; do
  taskkill //F //PID $pid 2>/dev/null
done
```

### If taskkill fails:

**Investigate to find parent process:**

```bash
# Get process details
tasklist //FI "PID eq <pid>" //V

# Find parent process ID (PPID)
wmic process where "ProcessId=<pid>" get ParentProcessId,ProcessId,Name

# Get parent process details
tasklist //FI "PID eq <ppid>" //V
```

**Report to user:**
```
Port <port> is held by PID <pid> (node.exe)
Parent process: PID <ppid> (<process_name>)

This may be another Claude instance or terminal session.
Would you like me to kill the parent process <ppid> to free the port?
```

Wait for user confirmation before killing parent processes.

---

## Step 3: Start Servers

```bash
# Backend from project root (for .env)
cd /path/to/project && node backend/server.js &

# Frontend
cd /path/to/project && npm run dev:frontend &
```

---

## Step 4: Verify & Return Links

```bash
# Check they actually started
netstat -ano | grep ":<backend_port>"  # Should show LISTENING
netstat -ano | grep ":<frontend_port>"  # Should show LISTENING
```

Return:
```
Backend: http://localhost:<backend_port>
Frontend: http://localhost:<frontend_port>
```

---

## Key Rules

1. **Find the project's ports** - check .env, package.json, config files
2. **Kill ALL PIDs on those ports** - loop through them, taskkill each
3. **Investigate failures** - find parent process, report to user, ask before killing
4. **Never kill unrelated ports**
5. **Never change ports**
6. **Never skip killing old processes**
7. **Never kill processes without understanding ownership**

---

## Windows Command Syntax

```bash
# In bash, use DOUBLE slashes for Windows commands:
taskkill //F //PID <pid>

# NOT single slashes (bash treats them as paths):
taskkill /F /PID <pid>  # ← WRONG
```
