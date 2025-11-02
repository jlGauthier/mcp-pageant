# Windows 11

```bash
# Directories
mkdir test_dir
mkdir -p subdir/nested
cd /d/claudeTools/test
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

**Bug Workaround:** Use absolute Windows paths (D:\...) for file operations to avoid modification bug. https://github.com/anthropics/claude-code/issues/7443