# Dependency Management System

## Overview
The MCP Pageant system uses a dependency-based approach where manifest files can declare dependencies on other files. The behavior of these dependencies varies based on whether they target LIST directories or SLOT directories.

## Directory Types

### LIST Directories
Directories ending with `_list` suffix are treated as lists that can contain multiple entries.

**Characteristics:**
- Multiple files can coexist
- Dependencies are tracked by their source
- When a parent file is removed, its dependencies are also removed
- Examples: `012_foo_list/`, `060_play_list/`

### SLOT Directories
Directories starting with numbers (without `_list` suffix) are treated as single-value slots.

**Characteristics:**
- Only one file can occupy a slot at a time
- New files overwrite existing slot contents
- Dependencies are NOT removed when parent file is removed (slot retains last value)
- Can contain numbered sub-slots
- Examples: `022_bar/`, `044_actions/`, `050_config/`

## Sub-Slots
Numbered directories within SLOT directories create independent sub-slots.

**Structure:**
```
050_config/           # Parent slot directory
├── 01_database/         # Sub-slot for face
├── 01_cache/       # Sub-slot for weapon  
├── 02_database/         # Different face sub-slot
└── 03_auth/        # Sub-slot for shoes
```

Each numbered sub-directory is an independent slot that can hold one file.

## Dependency Declaration
Dependencies are declared at the top of manifest files before any headers:

```markdown
@./manifest/012_foo_list/abc.md
@./manifest/022_bar/xyz.md
@./manifest/050_config/01_database/postgres.md

# Content starts here
Actual content of the file...
```

## Dependency Behavior

### When Adding a File with Dependencies

1. **LIST Dependencies**: Added alongside existing list entries
2. **SLOT Dependencies**: Overwrite current slot contents
3. **Main File**: Replaces any existing file in its target location

### When Removing a File with Dependencies

1. **LIST Dependencies**: Removed from the list
2. **SLOT Dependencies**: Remain in place (slots keep their last value)
3. **Main File**: Removed from template

## Complete Example

### Initial Persona State
```
012_foo_list/aaa.md
022_bar/wxy.md
050_config/01_database/original.md
050_config/01_cache/555.md
050_config/03_auth/2.md
044_actions/old_test.md
```

### File Being Added: test.md
**Location:** `044_actions/test.md`
**Dependencies:**
```
@./manifest/012_foo_list/abc.md
@./manifest/022_bar/xyz.md
@./manifest/050_config/01_database/postgres.md
```

### After Adding test.md
```
012_foo_list/aaa.md          # Original list entry
012_foo_list/abc.md          # Added from dependency (LIST)
022_bar/xyz.md               # Overwrote wxy.md (SLOT)
050_config/01_database/123.md    # Overwrote original.md (SUB-SLOT)
050_config/01_cache/555.md  # Unchanged sub-slot
050_config/03_auth/2.md     # Unchanged sub-slot
044_actions/test.md          # Replaced old_test.md
```

### After Removing test.md
```
012_foo_list/aaa.md          # Original remains
                             # abc.md removed (LIST cleanup)
022_bar/xyz.md               # Stays (SLOT retention)
050_config/01_database/123.md    # Stays (SUB-SLOT retention)
050_config/01_cache/555.md  # Unchanged
050_config/03_auth/2.md     # Unchanged
                             # test.md removed (main file)
```

## Key Rules

1. **LIST entries** are tracked and cleaned up with their parent file
2. **SLOT values** persist after their source is removed
3. **Sub-slots** are independent - `01_database` and `02_database` are different slots
4. **Overwrites** happen at the exact slot level specified
5. **Directory structure** determines behavior:
   - Ends with `_list` → LIST behavior
   - Starts with number → SLOT behavior
   - Numbered subdirectory → SUB-SLOT behavior

## Implementation Notes

- The system must track which LIST entries came from which source files
- SLOT dependencies should not be tracked for removal
- Sub-slot paths must be matched exactly (01_database ≠ 02_database)
- Empty slots are valid (no file required in every slot)
- Circular dependencies must be detected and prevented