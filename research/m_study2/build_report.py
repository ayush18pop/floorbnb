import re
t = open("results/tables.md").read(); blocks = {}
for b in t.split("\n\n**")[0:0]: pass
parts = re.split(r"(?m)^(?=\*\*T\d+b?\.)", t)
for p in parts:
    m = re.match(r"\*\*(T\d+b?)\.", p)
    if m: blocks[m.group(1)] = blocks.get(m.group(1), "") + p.strip() + "\n\n"
s = open("REPORT.tmpl.md").read()
s = s.replace("{{ACCEPT}}", open("results/accept_tables.md").read())
s = re.sub(r"\{\{(T\d+b?)\}\}", lambda m: blocks[m.group(1)].strip(), s)
assert "{{" not in s
open("REPORT.md", "w").write(s)
