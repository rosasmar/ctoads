"""Draws the CTOads art: every layer in art/, as an SVG of colored text on a terminal screen.

    python3 scripts/ascii-art.py

The toad is ASCII art: a grid of 40 columns by 22 rows of monospace characters, under a terminal
prompt. Every layer draws its characters on that same grid, so the contract can stack the layers
like any other art. A layer that covers part of the toad (eyes, mouth, outfit, hat, item) first
blanks those cells with the screen color, so characters never pile up. Rerunning this script
rewrites art/*/*.svg.
"""
import math
import os
import shutil

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art")

COLS, ROWS = 40, 20
FONT = 38  # font size; a monospace character is about 0.6 of it wide
CW, RH = FONT * 0.6, 38  # cell width and row height on the 1000x1000 canvas
X0, Y0 = (1000 - COLS * CW) / 2, 210  # left edge, and the baseline of row 0
SCREEN = "#0d1117"  # default screen color; each background sets its own (see screen())
TEXT = 'font-family="monospace" font-size="{}" xml:space="preserve"'.format(FONT)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def cells_svg(cells, blank=True):
    """cells: {(col, row): (char, color)}. Every run of neighboring characters of one color is a
    <tspan> with its own x, so nothing depends on how a renderer handles spaces."""
    out = []
    for r in sorted({rr for _, rr in cells}):
        cols = sorted(c for c, rr in cells if rr == r)
        y = Y0 + r * RH
        runs, start = [], cols[0]
        for i, c in enumerate(cols):
            nxt = cols[i + 1] if i + 1 < len(cols) else None
            if nxt != c + 1 or cells[(nxt, r)][1] != cells[(c, r)][1]:
                runs.append((start, c))
                start = nxt
        if blank:
            for a, b in runs:
                out.append(
                    f'<rect x="{X0 + a * CW:.1f}" y="{y - FONT * 0.8:.1f}" '
                    f'width="{(b - a + 1) * CW:.1f}" height="{RH}" class="s"/>'
                )
        spans = "".join(
            f'<tspan x="{X0 + a * CW:.1f}" fill="{cells[(a, r)][1]}">'
            f'{esc("".join(cells[(c, r)][0] for c in range(a, b + 1)))}</tspan>'
            for a, b in runs
        )
        out.append(f'<text y="{y:.1f}" {TEXT}>{spans}</text>')
    # An empty layer (no hat, no item) still needs content: the contract refuses an empty one.
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' + ("".join(out) or "<g/>") + "</svg>\n"


def art(rows, color, col, row, colors=None):
    """Cells from lines of text placed at (col, row). Spaces are left out. colors maps a
    character to its own color."""
    out = {}
    for dr, line in enumerate(rows):
        for dc, ch in enumerate(line):
            if ch != " ":
                out[(col + dc, row + dr)] = (ch, (colors or {}).get(ch, color))
    return out


# The toad's shape, in screen units, so it stays round although cells are tall.
def part(c, r):
    x, y = (c + 0.5) * CW, (r + 0.5) * RH
    mid = COLS * CW / 2

    def ell(cx, cy, rx, ry):
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

    shoulders = ell(mid, 800, 440, 270)
    head = ell(mid, 380, 405, 165)
    lids = ell(mid - 205, 200, 105, 95) or ell(mid + 205, 200, 105, 95)
    glands = ell(mid - 330, 285, 75, 70) or ell(mid + 330, 285, 75, 70)
    if not (shoulders or head or lids or glands):
        return None
    if ell(mid, 480, 270, 75):
        return "belly"
    return "skin"


TOAD = {(c, r): part(c, r) for c in range(COLS) for r in range(ROWS) if part(c, r)}
# Left character of each three-wide eye, mirrored around the middle so the face is symmetrical.
EYE_COLS = (round(COLS / 2 - 205 / CW) - 1, COLS - round(COLS / 2 - 205 / CW) - 2)
EYE_ROW = 5
MOUTH_ROW = 10


def edge(c, r):
    return any((c + dc, r + dr) not in TOAD for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)))


layers = {}


def add(category, name, cells, blank=True):
    layers[(category, name)] = cells_svg(cells, blank)


# Bodies: the toad in different colors (skin, shade, light, belly). Warts are a fixed pattern.
BODIES = {
    "purple": ("#a371f7", "#6e40c9", "#d2a8ff", "#e8d9ff"),
    "pink": ("#ff7eb6", "#d14d8a", "#ffb3d4", "#ffe0ee"),
    "tomato": ("#ff6b4a", "#c9422a", "#ffa38f", "#ffe0d8"),
    "mustard": ("#e3b341", "#a8801f", "#f2d27a", "#fff3cc"),
    "teal": ("#39c5bb", "#1f8a83", "#8ee8e1", "#d8fbf8"),
    "acid": ("#a6e22e", "#6f9a17", "#d2f58a", "#effcd2"),
    "rekt-gray": ("#8b949e", "#57606a", "#c9d1d9", "#eaeef2"),
    "gold": ("#ffd33d", "#d4a106", "#fff1a8", "#fffbe0"),
    "diamond": ("#a5f3fc", "#38bdf8", "#e0fcff", "#ffffff"),
}
for name, (skin, shade, light, belly) in BODIES.items():
    cells = {}
    for (c, r), p in TOAD.items():
        if edge(c, r):
            cells[(c, r)] = ("#", shade)
        elif p == "belly":
            cells[(c, r)] = (":", belly)
        elif (c * 7 + r * 13) % 23 == 0:
            cells[(c, r)] = ("o", shade)  # a wart
        elif (c, r + 1) not in TOAD or (c + 1, r) not in TOAD or r >= 15:
            cells[(c, r)] = ("&", shade)
        elif (c - 1, r) not in TOAD or (c, r - 1) not in TOAD:
            cells[(c, r)] = ("+", light)
        else:
            cells[(c, r)] = ("%", skin)
    add("body", name, cells, blank=False)


# Backgrounds: a terminal window with a dark tinted screen, a colored bar with three dots, and the
# last lines the terminal printed. Its <style> sets the screen color, which every other layer
# blanks its cells with (class "s"), so the blanks always match the screen.
def screen(tint, lines, extra=None):
    cells = {}
    for i, (text, color) in enumerate(lines):
        cells.update(art([text], color, 0, -3 + i))
    body = cells_svg({**cells, **(extra or {})}, blank=False)
    body = body.split('viewBox="0 0 1000 1000">', 1)[1].rsplit("</svg>", 1)[0]
    screen_color, bar_color = tint
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">'
        f'<style>.s{{fill:{screen_color}}}</style><rect width="1000" height="1000" class="s"/>'
        f'<rect width="1000" height="56" fill="{bar_color}"/>'
        '<circle cx="40" cy="28" r="12" fill="#ff5f57"/><circle cx="76" cy="28" r="12" fill="#febc2e"/>'
        f'<circle cx="112" cy="28" r="12" fill="#28c840"/>{body}</svg>\n'
    )


G, R, Y, B, W, M = "#7ee787", "#ff7b72", "#e3b341", "#79c0ff", "#f0f6fc", "#8b949e"
# name: ((screen color, bar color), lines)
BACKGROUNDS = {
    "sell": (("#0b1a2e", "#1d3f73"), [("$ near call cto sell --all", G), ("> rekt. minting your toad...", M)]),
    "liquidated": (("#2a0b12", "#6b1a2b"), [("!! POSITION LIQUIDATED !!", R), ("> pnl: -100%", R)]),
    "hodl": (("#0b2216", "#1d5636"), [("$ hodl --forever", G), ("> ok", M)]),
    "gm": (("#200b2a", "#511e6b"), [("$ echo gm", "#ff7eb6"), ("> gm", W)]),
    "moon": (("#10123a", "#2d3290"), [("$ ./moon.sh", B), ("> eta: never", Y)]),
    "ngmi": (("#0b2226", "#1d5660"), [("$ ctoad --forecast", "#39c5bb"), ("> ngmi", R)]),
}
for name, (tint, lines) in BACKGROUNDS.items():
    layers[("background", name)] = screen(tint, lines)
stars = {(c, r): ("*", Y) for c, r in [(1, -1), (5, 1), (34, 0), (38, 2), (2, 4), (37, 5), (30, -2)]}
layers[("background", "night")] = screen(("#060a1c", "#18215a"), [("$ ./moon.sh --tonight", B)], stars)
layers[("background", "gold")] = screen(("#261c03", "#6b4f0a"), [("$ ctoad --legendary", Y), ("> 1 of 1 vibes", Y)])


# Eyes: each eye is three characters wide, on the toad's lids.
def eyes(left, color, right=None, colors=None, extra=None):
    out = {}
    for col, rows in zip(EYE_COLS, (left, right or left)):
        out.update(art(rows, color, col, EYE_ROW - len(rows) + 1, colors))
    out.update(extra or {})
    return out


add("eyes", "deadpan", eyes(["---", "(o)"], W, colors={"-": M, "o": B}))
add("eyes", "wide", eyes(["(O)"], W))
add("eyes", "rekt", eyes(["(x)"], W, colors={"x": R}))
add("eyes", "sleepy", eyes(["-_-"], M))
# Both pupils toward the nose, mirrored: four characters per eye, kept symmetrical.
cross = art(["(-o)"], W, EYE_COLS[0], EYE_ROW, {"o": B, "-": M})
cross.update(art(["(o-)"], W, EYE_COLS[1] - 1, EYE_ROW, {"o": B, "-": M}))
add("eyes", "cross-eyed", cross)
add("eyes", "crying", eyes(["(;)"], W, colors={";": B}, extra={(EYE_COLS[0] + 1, EYE_ROW + i): (";", B) for i in (1, 2, 3)} | {(EYE_COLS[1] + 1, EYE_ROW + i): (";", B) for i in (1, 2, 3)}))
add("eyes", "sweaty", eyes(["(o)"], W, colors={"o": B}, extra={(EYE_COLS[1] + 4, EYE_ROW - 1): ("'", B), (EYE_COLS[1] + 4, EYE_ROW): (";", B)}))
add("eyes", "coins", eyes(["($)"], Y))


def big_eyes(rows, colors):
    """Big round eyes: five characters wide and three rows tall, centered on each lid."""
    out = {}
    for col in EYE_COLS:
        out.update(art(rows, W, col - 1, EYE_ROW - 1, colors))
    return out


CUTE = {"O": W, "@": "#58a6ff", "*": "#ffffff"}
add("eyes", "cute", big_eyes([" OOO ", "O@*@O", " OOO "], CUTE))
add("eyes", "sparkly", big_eyes([" OOO ", "O*@*O", " O*O "], CUTE | {"*": Y}))
laser = eyes(["(@)"], R)
laser.update({(c, EYE_ROW): ("=", R) for c in range(0, EYE_COLS[0])})
laser.update({(c, EYE_ROW): ("=", R) for c in range(EYE_COLS[1] + 3, COLS)})
add("eyes", "laser", laser)
# One lens centered on each eye, the same glint on both, and a bridge between them.
shades = {}
for col in EYE_COLS:
    shades.update(art(["[/##]"], "#6e7681", col - 1, EYE_ROW, {"/": W}))
shades.update({(c, EYE_ROW): ("-", M) for c in range(EYE_COLS[0] + 4, EYE_COLS[1] - 1)})
add("eyes", "shades", shades)

# Mouths: a wide toad mouth, centered under the eyes.
MID = COLS // 2
add("mouth", "smile", art(["'-.________.-'"], R, MID - 7, MOUTH_ROW))
# The smile turned upside down: corners down, two rows.
add("mouth", "frown", art(["  .--------.  ", " /          \\ "], R, MID - 7, MOUTH_ROW))
add("mouth", "flat", art(["  ==========  "], R, MID - 7, MOUTH_ROW))
# The smile, with a nervous wobble under it.
add("mouth", "its-fine", art(["'-.________.-'", "    ~~~~~~    "], R, MID - 7, MOUTH_ROW, {"~": B}))
# A round open mouth, filled dark so the skin doesn't show through.
add("mouth", "shock", art(["  .--.  ", " /####\\ ", " \\####/ ", "  '--'  "], R, MID - 4, MOUTH_ROW - 1, {"#": "#4a0f1a"}))
# A wide open smile showing teeth.
add("mouth", "grin", art(["'-.________.-'", "  \\VVVVVVVV/  ", "   '------'   "], R, MID - 7, MOUTH_ROW, {"V": W}))
add("mouth", "tongue", art(["'-.________.-'", "     (UU)     "], R, MID - 7, MOUTH_ROW, {"U": "#ff7eb6", "(": "#ff7eb6", ")": "#ff7eb6"}))


# Outfits: over the shoulders, from row 17 down.
def shirt(fill, color, word=None, word_color=W):
    out = {(c, r): (fill, color) for (c, r) in TOAD if r >= 15}
    if word:
        out.update(art([word], word_color, MID - len(word) // 2, 17))
    return out


add("outfit", "none", {})
add("outfit", "rekt-tee", shirt("=", "#8b949e", "REKT", R))
add("outfit", "hodl-tee", shirt("=", "#1f6feb", "HODL"))
add("outfit", "ngmi-tee", shirt("=", "#a371f7", "NGMI", Y))
add("outfit", "minus-90-tee", shirt("=", "#da3633", "-90%"))
hoodie = shirt("~", "#8957e5")
hoodie.update(art(["|", "|", "o"], W, MID - 2, 15))
hoodie.update(art(["|", "|", "o"], W, MID + 2, 15))
add("outfit", "hoodie", hoodie)
suit = shirt("#", "#388bfd")
suit.update(art(["\\  /", " \\/ ", " || ", " || "], W, MID - 2, 15, {"|": R}))
add("outfit", "suit", suit)
add("outfit", "gold-chain", art(["o-o-o-o-o-o-o-o", "    \\ ($) /"], Y, MID - 7, 14))

# Headwear: above the head, between the lids.
add("headwear", "none", {})
add("headwear", "crown", art([" .  .  . ", "/\\_/\\_/\\", "|__@_@__|"], Y, MID - 4, 2, {"@": R}))
add("headwear", "party-hat", art(["  *  ", " /=\\ ", " |=| ", "/=*=\\"], "#ff7eb6", MID - 2, 1, {"*": Y, "=": B}))
add("headwear", "halo", art([".--------.", "'--------'"], Y, MID - 5, 0))
add("headwear", "propeller", art(["-=+=-", "  |  ", " (_) "], B, MID - 2, 2, {"+": R}))
add("headwear", "beanie", art(["   o   ", " .---. ", "(#####)"], "#2ea043", MID - 3, 2))

# Items: held at the bottom, each always in its own spot. Some on the right, some on the left.
add("item", "none", {})
add("item", "money-bag", art(["  )(  ", " /$$\\ ", "( $$ )", " '--' "], Y, 32, 13, {"$": G}))
add("item", "phone", art([".----.", "|\\   |", "| \\_ |", "|   \\|", "'----'"], M, 33, 13, {"\\": R, "_": R}))
add("item", "empty-wallet", art(["._____.", "|  0  |", "'-----'"], "#a8801f", 1, 15, {"0": R}))
add("item", "coffee", art([" ( ( ", " .---.", "(|   |", " '---'"], W, 1, 14, {"(": M}))
add("item", "white-flag", art(["|\\", "| >", "|/", "|", "|"], W, 3, 12, {"|": "#a8801f"}))

if __name__ == "__main__":
    for category in {c for c, _ in layers}:
        shutil.rmtree(os.path.join(ART, category), ignore_errors=True)
        os.makedirs(os.path.join(ART, category))
    for (category, name), content in sorted(layers.items()):
        with open(os.path.join(ART, category, f"{name}.svg"), "w") as f:
            f.write(content)
    counts = {}
    for category, _ in layers:
        counts[category] = counts.get(category, 0) + 1
    print(f"{len(layers)} layers:", ", ".join(f"{c} {n}" for c, n in sorted(counts.items())))
