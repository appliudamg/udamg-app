"""Bloc Media : StyleSheet.create statique (mediaTheme) → makeMediaStyles + useMediaTheme() dans les composants."""
import re, sys
FUNC_RE = re.compile(r'^(export default function|export function|function)\s+([A-Z][A-Za-z0-9_]*)\s*\(', re.M)
for path in sys.argv[1:]:
    s = open(path).read(); orig = s
    style_vars = []
    def repl(m):
        style_vars.append(m.group(1))
        return f"const use{m.group(1)[0].upper()}{m.group(1)[1:]} = makeMediaStyles((mediaTheme) => ({{"
    s = re.sub(r'^const ([a-zA-Z]+) = StyleSheet\.create\(\{', repl, s, flags=re.M)
    out, pos = [], 0
    for m in re.finditer(r'^const use[A-Z][A-Za-z]* = makeMediaStyles\(\(mediaTheme\) => \(\{', s, flags=re.M):
        end = s.index("\n});", m.end()); out.append(s[pos:end]); out.append("\n}));"); pos = end + 4
    out.append(s[pos:]); s = "".join(out)
    funcs = list(FUNC_RE.finditer(s)); ins = []
    for i, m in enumerate(funcs):
        body_start = s.index("{", s.index(")", m.end()))
        nxt = funcs[i+1].start() if i+1 < len(funcs) else len(s)
        ms = s.find("\nconst use", m.end()); body_end = min(nxt, ms if ms != -1 else len(s))
        body = s[body_start:body_end]; lines = []
        for sv in style_vars:
            if re.search(rf'\b{sv}\.', body) and f"const {sv} = use" not in body:
                lines.append(f"  const {sv} = use{sv[0].upper()}{sv[1:]}();")
        if re.search(r'\bmediaTheme\.', body) and "useMediaTheme()" not in body:
            lines.append("  const mediaTheme = useMediaTheme();")
        if lines: ins.append((body_start + 1, "\n" + "\n".join(lines)))
    for at, txt in sorted(ins, reverse=True): s = s[:at] + txt + s[at:]
    def fix_import(m):
        names = [n.strip() for n in m.group(1).split(",") if n.strip() and n.strip() != "mediaTheme"]
        for n in ["useMediaTheme"] + (["makeMediaStyles"] if style_vars else []):
            if n not in names: names.append(n)
        return "import { " + ", ".join(names) + ' } from "@/src/media_theme";'
    s = re.sub(r'import \{([^}]*)\} from "@/src/media_theme";', fix_import, s)
    if "StyleSheet." not in s:
        s = re.sub(r'(import \{[^}]*?)\bStyleSheet,\s*', r'\1', s, count=1)
        s = re.sub(r'(import \{[^}]*?),\s*StyleSheet\b', r'\1', s, count=1)
    if s != orig: open(path, "w").write(s); print("converted", path, style_vars)
