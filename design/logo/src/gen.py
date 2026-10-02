import os
R='/home/hyprayush/Documents/Projects/floor'
WORD=open('word.d').read()
V='M1 1C2.6 5.6 4.6 11.6 7.6 11.6C9.3 11.6 10 10.3 11.8 10.3C14.4 10.3 16.4 12.6 19.4 13.8C21.8 14.6 24 14.75 27 14.75H48'
CUSH=V+'V17H1Z'
FLOOR='M0 17h48v1.5H0z'; TICK='M0 14.75h1.5v6H0z'
# icon: thicker value line resting one stroke above floor
import re as _re
SW=3.4; FT=15; SH=14.75-(FT-1.5*SW)
VI=_re.sub(r'(-?[\d.]+) (-?[\d.]+)',lambda m:f'{m.group(1)} {float(m.group(2))-SH:g}',V)
C={'dark':dict(bg='#0A0B0D',text='#F2F2EE',floor='#7C93FF',soft='#151A33'),
   'light':dict(bg='#FAFAF8',text='#10110F',floor='#2440E0',soft='#E9ECFC')}
def mark(text,floor,soft):
    return (f'<path d="{CUSH}" {soft}/>\n  <path d="{V}" fill="none" {text} stroke-width="1.5"/>\n'
            f'  <path d="{FLOOR}" {floor}/>\n  <path d="{TICK}" {floor}/>')
HDR='<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" aria-label="Floor">\n  <title>Floor</title>\n'
def w(path,s): open(os.path.join(R,path),'w').write(s+'\n')
adapt=dict(text='stroke="currentColor"',floor='style="fill:var(--floor-line,#7C93FF)"',soft='style="fill:var(--accent-soft,#151A33)"')
cm='  <!-- Value line resting one stroke above the floor line it never crosses. 48 x 21 grid. -->\n'
w('design/logo/floor-mark.svg',HDR.format(vb='0 0 48 21',w=48,h=21)+cm+'  '+mark(**adapt)+'\n</svg>')
for k,c in C.items():
    w(f'design/logo/floor-mark-{k}.svg',HDR.format(vb='0 0 48 21',w=48,h=21)+cm+'  '+mark(f'stroke="{c["text"]}"',f'fill="{c["floor"]}"',f'fill="{c["soft"]}"')+'\n</svg>')
# wordmark: Geist Bold outlines, cap 24, baseline y=24
w('design/logo/floor-wordmark.svg',HDR.format(vb='0 0 85 24',w=85,h=24)+'  <!-- "Floor" in Geist Bold, outlined. Cap height 24, baseline y=24. -->\n'+f'  <path fill="currentColor" d="{WORD}"/>\n</svg>')
S=36/21  # mark scale in lockup; floor line bottom (18.5*S=31.71) is the word baseline
def lockup(text,floor,soft,wordfill):
    return (f'  <g transform="scale({S:.4f})">\n    '+mark(text,floor,soft).replace('\n  ','\n    ')+'\n  </g>\n'
            f'  <path transform="translate(94 {18.5*S-24:.2f})" {wordfill} d="{WORD}"/>')
LV='0 0 179 36'
w('design/logo/floor-lockup.svg',HDR.format(vb=LV,w=179,h=36)+'  <!-- Mark + wordmark. Word baseline = floor line bottom edge. -->\n'+lockup(**adapt,wordfill='fill="currentColor"')+'\n</svg>')
for k,c in C.items():
    w(f'design/logo/floor-lockup-{k}.svg',HDR.format(vb=LV,w=179,h=36)+lockup(f'stroke="{c["text"]}"',f'fill="{c["floor"]}"',f'fill="{c["soft"]}"',f'fill="{c["text"]}"')+'\n</svg>')
# app icon / favicon: tile, no cushion, no tick, thicker strokes
s=22/48
icon=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">\n'
 f'  <rect width="32" height="32" rx="6" fill="#0A0B0D"/>\n'
 f'  <!-- App icon: Floor mark simplified for 16px (no cushion, no tick, heavier strokes). -->\n'
 f'  <g transform="translate(5 {16-6.4*s:.2f}) scale({s:.4f})">\n'
 f'    <path d="{VI}" fill="none" stroke="#F2F2EE" stroke-width="{SW}"/>\n'
 f'    <path d="M0 {FT}h48v{SW}H0z" fill="#7C93FF"/>\n  </g>\n</svg>')
w('design/logo/favicon.svg',icon); w('web/app/icon.svg',icon)
# avatar 400x400 dark, mark centred
av=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">\n  <rect width="400" height="400" fill="#0A0B0D"/>\n'
 f'  <g transform="translate({200-24*5.4:.1f} {200-10.5*5.4:.1f}) scale(5.4)">\n    '+mark(f'stroke="#F2F2EE"','fill="#7C93FF"','fill="#151A33"').replace('\n  ','\n    ')+'\n  </g>\n</svg>')
w('design/logo/floor-avatar.svg',av)
# TS module for the web app
w('web/lib/logo.ts',f'''/**
 * Floor logo geometry (source: design/logo/*.svg, generated together).
 * Mark grid 48 x 21: a value line resting one stroke above the floor line it never crosses.
 */
export const MARK_VIEWBOX = "0 0 48 21";
export const MARK = {{
  value: "{V}",
  cushion: "{CUSH}",
  floor: "{FLOOR}",
  tick: "{TICK}",
  strokeWidth: 1.5,
}} as const;

/** "Floor" in Geist Bold, outlined. Cap height 24, baseline y=24, width ~85. */
export const WORDMARK = "{WORD}";

/** Lockup 179 x 36: mark scaled 36/21, wordmark at x=94 with its baseline on the floor line's bottom edge. */
export const LOCKUP = {{ viewBox: "0 0 179 36", width: 179, height: 36, markScale: {S:.4f}, wordX: 94, wordY: {18.5*S-24:.2f} }} as const;
''')
