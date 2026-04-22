import os

for root, dirs, files in os.walk("."):
    if "migrations" in root:
        for f in files:
            if f != "__init__.py" and f.endswith(".py"):
                path = os.path.join(root, f)
                print("Deleting:", path)
                os.remove(path)