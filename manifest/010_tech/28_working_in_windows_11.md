# Working In Windows 11
```bash
# Directories
mkdir test_dir
mkdir -p subdir/nested
cd /path/to/project
ls -la
rm -rf dir_with_contents

# Files
echo "content" > file.txt
touch empty.txt
cp source.txt dest.txt
mv oldname.txt newname.txt
rm file.txt

# Search
find . -name "*.txt"
grep "pattern" file.txt
grep -r "pattern" directory/
grep -i "case_insensitive"

# Processes
ps aux | grep node
kill 1234
kill -9 1234
```

## File Copying
NEVER copy a file by reading it with the Read tool then writing it with the Write tool. Use `cp` in bash. Read+Write mangles encoding, wastes context, and triggers approval prompts.

## Git In Subdirectories
NEVER use `cd <path> && git <cmd>`. It triggers an approval prompt every time ("Compound commands with cd and git require approval to prevent bare repository attacks"). On Windows this is worse because Claude Code auto-prepends `cd` due to path-format mismatch (#30524). Use `git -C <path> <cmd>` instead — semantically identical, zero approval, works on every platform.

```bash
# WRONG — triggers approval
cd C:/project/.pageant/agent && git status

# RIGHT — no approval
git -C C:/project/.pageant/agent status
```

# "Error: File has been unexpectedly modified. Read it again before attempting to write it."
CRITICAL: If you receive this error the workaround is: use complete absolute Windows paths with drive letters and backslashes for the file operation. Do this proactively, not just for this file. Bug ticket: https://github.com/anthropics/claude-code/issues/7443