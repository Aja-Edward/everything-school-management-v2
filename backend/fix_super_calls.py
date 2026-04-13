# fix_super_calls.py
# Fixes get_queryset methods to call super() first

import os
import re

FILES_TO_FIX = [
    "teacher/views.py",
    "classroom/views.py",
    "attendance/views.py",
]


def fix_get_queryset(content, viewset_name):
    """Add super() call to get_queryset if missing"""

    # Pattern to find get_queryset method
    pattern = rf"(class\s+{viewset_name}.*?)(def\s+get_queryset\(self\):?\s*\n)(.*?)(\n\s+def\s|\nclass\s|\Z)"

    def replace_method(match):
        class_def = match.group(1)
        method_def = match.group(2)
        method_body = match.group(3)
        next_def = match.group(4)

        # Check if already calls super()
        if "super()" in method_body or "super(" in method_body:
            return match.group(0)  # Already has super(), don't change

        # Find the indentation
        indent_match = re.search(r"\n(\s+)", method_body)
        if not indent_match:
            return match.group(0)  # Can't determine indentation

        indent = indent_match.group(1)

        # Add super() call at the beginning of the method
        new_method_body = f"\n{indent}# Apply section filtering\n{indent}queryset = super().get_queryset()\n{indent}\n{indent}# Apply additional filters\n{method_body}"

        # Find the return statement and update it
        new_method_body = re.sub(
            r"(\n\s+)return\s+(\w+)\.objects\.all\(\)",
            r"\1return queryset",
            new_method_body,
        )
        new_method_body = re.sub(
            r"(\n\s+)return\s+(\w+)\.objects\.filter",
            r"\1return queryset.filter",
            new_method_body,
        )

        return class_def + method_def + new_method_body + next_def

    # Apply the replacement
    content = re.sub(pattern, replace_method, content, flags=re.DOTALL)

    return content


def process_file(filepath):
    """Process a single file to fix get_queryset methods"""

    if not os.path.exists(filepath):
        print(f"⚠️  File not found: {filepath}")
        return False

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original_content = content

    # Find all ViewSet classes
    viewset_pattern = r"class\s+(\w+ViewSet)\("
    viewsets = re.findall(viewset_pattern, content)

    print(f"\n📦 Processing: {filepath}")
    print(f"   Found {len(viewsets)} ViewSets")

    # Fix each ViewSet
    for viewset_name in viewsets:
        content = fix_get_queryset(content, viewset_name)

    # Only write if changed
    if content != original_content:
        # Create backup
        backup_path = filepath + ".backup2"
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(original_content)
        print(f"   📝 Backup created: {backup_path}")

        # Write updated content
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"   ✅ Updated {len(viewsets)} ViewSets")
        return True
    else:
        print(f"   ⏭️  No changes needed")
        return False


def main():
    print("=" * 80)
    print("🔧 FIX get_queryset() - Adding super() calls")
    print("=" * 80)
    print("\n⚠️  WARNING: This is a complex automatic fix.")
    print("Please review all changes carefully!")
    print()

    for filepath in FILES_TO_FIX:
        process_file(filepath)

    print("\n" + "=" * 80)
    print("✅ Complete! Please review the changes.")
    print("=" * 80)


if __name__ == "__main__":
    main()
