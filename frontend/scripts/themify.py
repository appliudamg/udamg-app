"""Convertit les écrans : StyleSheet.create statique → makeStyles((colors) => ...) + hooks useTheme()."""
import re
import sys

FILES = sys.argv[1:]

FUNC_RE = re.compile(r'^(export default function|export function|function)\s+([A-Z][A-Za-z0-9_]*)\s*\(', re.M)


def convert(path: str) -> None:
    s = open(path).read()
    orig = s

    # 1) StyleSheet.create blocks → makeStyles
    style_vars = []
    def repl(m):
        name = m.group(1)
        style_vars.append(name)
        return f"const use{name[0].upper()}{name[1:]} = makeStyles((colors) => ({{"
    s = re.sub(r'^const ([a-zA-Z]+) = StyleSheet\.create\(\{', repl, s, flags=re.M)
    # close: the "});" at column 0 that ends those blocks → "}));"
    # Walk through each makeStyles start and find its terminating "\n});"
    out = []
    pos = 0
    for m in re.finditer(r'^const use[A-Z][A-Za-z]* = makeStyles\(\(colors\) => \(\{', s, flags=re.M):
        end = s.index("\n});", m.end())
        out.append(s[pos:end])
        out.append("\n}));")
        pos = end + len("\n});")
    out.append(s[pos:])
    s = "".join(out)

    # 2) hooks in each component function
    funcs = list(FUNC_RE.finditer(s))
    insertions = []
    for i, m in enumerate(funcs):
        body_start = s.index("{", s.index(")", m.end()))  # first "{" after params
        # body end = start of next top-level func or next "const useX = makeStyles" or EOF
        nxt = funcs[i + 1].start() if i + 1 < len(funcs) else len(s)
        ms = s.find("\nconst use", m.end())
        body_end = min(nxt, ms if ms != -1 else len(s))
        body = s[body_start:body_end]
        lines = []
        for sv in style_vars:
            if re.search(rf'\b{sv}\.', body):
                lines.append(f"  const {sv} = use{sv[0].upper()}{sv[1:]}();")
        if re.search(r'\bcolors\.', body):
            lines.append("  const { colors } = useTheme();")
        if lines:
            insertions.append((body_start + 1, "\n" + "\n".join(lines)))
    for at, txt in sorted(insertions, reverse=True):
        s = s[:at] + txt + s[at:]

    # 3) imports
    def fix_import(m):
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        names = [n for n in names if n != "colors"]
        for n in ["useTheme", "makeStyles"]:
            if n not in names:
                names.append(n)
        return "import { " + ", ".join(names) + ' } from "@/src/theme";'
    s = re.sub(r'import \{([^}]*)\} from "@/src/theme";', fix_import, s)
    if "makeStyles(" not in s:
        s = s.replace(", makeStyles }", " }").replace("{ makeStyles, ", "{ ")
    # StyleSheet import no longer needed?
    if "StyleSheet." not in s:
        s = re.sub(r'(import \{[^}]*?)\bStyleSheet,\s*', r'\1', s, count=1)
        s = re.sub(r'(import \{[^}]*?),\s*StyleSheet\b', r'\1', s, count=1)

    if s != orig:
        open(path, "w").write(s)
        print("converted", path, style_vars)


for f in FILES:
    convert(f)
