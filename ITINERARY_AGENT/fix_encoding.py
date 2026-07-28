"""Fix rupee symbol encoding and any other UTF-8 issues in JS files."""
import os

files = [
    "frontend/js/itinerary.js",
    "frontend/js/app.js",
]

for fpath in files:
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace literal rupee with HTML entity — works in any browser regardless of file encoding
    fixed = content.replace("₹", "&#8377;")

    with open(fpath, "w", encoding="utf-8") as f:
        f.write(fixed)

    count = content.count("₹")
    print(f"{fpath}: replaced {count} rupee symbols")

print("Done.")
