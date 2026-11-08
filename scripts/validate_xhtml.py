import sys
from lxml import etree

path = sys.argv[1]
data = open(path, encoding="utf-8").read()
wrapped = (
    '<root xmlns:html="http://www.w3.org/1999/xhtml">'
    + data
    + "</root>"
)
try:
    root = etree.fromstring(wrapped.encode("utf-8"))
except Exception as e:
    print(f"INVALID: {e}")
    sys.exit(1)
print(f"XHTML OK: {path} ({len(root)} top-level nodes)")
