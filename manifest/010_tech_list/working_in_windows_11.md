# Windows Git Bash Commands - D:\claudeTools

## Directory Operations
```bash
mkdir test_dir                  # Create directory
mkdir -p subdir/nested          # Create nested directories
cd /d/claudeTools/test          # Navigate with forward slashes
ls -la                          # List contents with details
rm -rf dir_with_contents        # Remove directory and contents
```

## File Operations
```bash
echo "content" > file.txt       # Create file with content
touch empty.txt                 # Create empty file
cp source.txt dest.txt          # Copy file
mv oldname.txt newname.txt      # Rename/move file
rm file.txt                     # Delete file
cat file.txt                    # View file
```

## Search Operations
```bash
find . -name "*.txt"            # Find files by pattern
grep "pattern" file.txt         # Search in file
grep -r "pattern" directory/    # Recursive search
grep -i "case_insensitive"      # Case insensitive
```

## Process Operations
```bash
ps aux | grep node              # Find processes
kill 1234                       # Kill by PID
kill -9 1234                    # Force kill
```

## Path Format
- Use forward slashes: `/d/claudeTools`
- Or relative paths: `subdir/file.txt`
- Avoid backslashes: `D:\test` creates mangled names

## Windows-Specific Commands
```bash
cmd /c "tasklist"               # Windows task list
cmd /c "ipconfig"               # Network info
pwd                             # Current directory
```