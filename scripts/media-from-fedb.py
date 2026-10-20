#!/usr/bin/env python3
"""Exercise pictures for Liftspark from free-exercise-db (public domain, github.com/yuhonas/free-exercise-db).

openGym's own exercise media is licensed from Gym visual for openGym only, so Liftspark ships none of it.
This script matches openGym's catalogue (app/src/lib/exercises-data.js, AGPL/MIT text) to
free-exercise-db exercises by name and equipment, then:

  * writes app/public/exercise-media/still/<fedb-id>.webp (first frame) and
    app/public/exercise-media/clip/<fedb-id>.webp (the two frames as a looping animated WebP),
  * rewrites img/gif in exercises-data.js to those files, and drops img/gif (and the Gym visual
    female/male drawing ids fv/mv) on every exercise without a confident match, which then shows the
    app's neutral tile instead of a wrong picture.

Usage: python3 scripts/media-from-fedb.py /path/to/free-exercise-db
"""
import json, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FEDB = Path(sys.argv[1] if len(sys.argv) > 1 else 'free-exercise-db')
DATA = ROOT / 'app/src/lib/exercises-data.js'
OUT = ROOT / 'app/public/exercise-media'
WIDTH = 360
THRESHOLD = 0.72

EQUIP = {
    'body only': 'body weight', 'dumbbell': 'dumbbell', 'barbell': 'barbell', 'cable': 'cable',
    'machine': 'machine', 'kettlebells': 'kettlebell', 'bands': 'band', 'e-z curl bar': 'ez barbell',
    'medicine ball': 'medicine ball', 'exercise ball': 'stability ball', 'foam roll': 'roller', 'other': None,
}
# openGym equipment words that count as the same family as free-exercise-db's.
FAMILY = {
    'machine': {'leverage machine', 'sled machine', 'smith machine', 'machine', 'stationary bike',
                'elliptical machine', 'stepmill machine', 'skierg machine', 'upper body ergometer'},
    'band': {'band', 'resistance band'},
    'ez barbell': {'ez barbell'},
    'stability ball': {'stability ball'},
}
STOP = {'medium', 'grip', 'the', 'a', 'with', 'on', 'to', 'and', 'of', 'in', 'for', 'version', 'v', 'alternate', 'alternating'}
SYN = {'situp': 'sit up', 'pushup': 'push up', 'pullup': 'pull up', 'chinup': 'chin up', 'db': 'dumbbell',
       'bb': 'barbell', 'tricep': 'triceps', 'bicep': 'biceps', 'flyes': 'fly', 'flye': 'fly', 'flys': 'fly',
       'raises': 'raise', 'curls': 'curl', 'presses': 'press', 'rows': 'row', 'squats': 'squat',
       'lunges': 'lunge', 'extensions': 'extension', 'crunches': 'crunch', 'kickbacks': 'kickback',
       'deadlifts': 'deadlift', 'shrugs': 'shrug', 'dips': 'dip', 'pushups': 'push up', 'pullups': 'pull up',
       'situps': 'sit up', 'chinups': 'chin up', 'extensions': 'extension', 'thrusts': 'thrust'}
# The staple lifts, checked by hand: these must show exactly the right picture.
OVERRIDES = {
    'barbell bench press': 'Barbell_Bench_Press_-_Medium_Grip', 'push-up': 'Pushups', 'pull-up': 'Pullups',
    'chin-up': 'Chin-Up', 'lever leg extension': 'Leg_Extensions', 'dumbbell lateral raise': 'Side_Lateral_Raise',
    'barbell incline bench press': 'Barbell_Incline_Bench_Press_-_Medium_Grip', 'cable pulldown': 'Wide-Grip_Lat_Pulldown',
    'cable lat pulldown full range of motion': 'Full_Range-Of-Motion_Lat_Pulldown', 'barbell hip thrust': 'Barbell_Hip_Thrust',
    'barbell romanian deadlift': 'Romanian_Deadlift', 'barbell standing military press': 'Standing_Military_Press',
    'dumbbell seated shoulder press': 'Dumbbell_Shoulder_Press', 'sled 45° leg press': 'Leg_Press', 'cable standing face pull (with rope)': 'Face_Pull',
    'dumbbell hammer curl': 'Hammer_Curls', 'front plank': 'Plank', 'weighted front plank': 'Plank', 'cable kneeling crunch': 'Cable_Crunch',
    'ez barbell lying triceps extension': 'EZ-Bar_Skullcrusher', 'triceps dip': 'Dips_-_Triceps_Version', 'chest dip': 'Dips_-_Chest_Version',
}


def tokens(name):
    s = re.sub(r'\([^)]*\)', ' ', name.lower())
    s = re.sub(r'[^a-z0-9 ]+', ' ', s.replace('-', ' '))
    out = []
    for w in s.split():
        w = SYN.get(w, w)
        out.extend(w.split())
    return {w for w in out if w not in STOP}


def equip_ok(cat_eq, fedb_eq):
    if fedb_eq is None or not cat_eq:
        return True
    return cat_eq == fedb_eq or cat_eq in FAMILY.get(fedb_eq, {fedb_eq})


def main():
    src = DATA.read_text()
    m = re.search(r'export const EXDB=(\[.*?\]);?\n', src, re.S)
    exdb = json.loads(m.group(1))
    fedb = json.loads((FEDB / 'dist/exercises.json').read_text())
    cands = []
    for f in fedb:
        if not f.get('images'):
            continue
        cands.append((f, tokens(f['name']), EQUIP.get(f.get('equipment') or 'other')))

    matched, used = {}, set()
    for ex in exdb:
        t = tokens(ex['n'])
        if not t:
            continue
        if ex['n'] in OVERRIDES:
            matched[ex['id']] = OVERRIDES[ex['n']]
            used.add(OVERRIDES[ex['n']])
            continue
        best, score = None, 0.0
        for f, ft, feq in cands:
            if not equip_ok(ex.get('eq'), feq):
                continue
            inter = len(t & ft)
            if not inter:
                continue
            j = inter / len(t | ft)
            if j > score:
                best, score = f, j
        if best and score >= THRESHOLD:
            matched[ex['id']] = best['id']
            used.add(best['id'])

    (OUT / 'still').mkdir(parents=True, exist_ok=True)
    (OUT / 'clip').mkdir(parents=True, exist_ok=True)
    by_id = {f['id']: f for f in fedb}
    for fid in sorted(used):
        f = by_id[fid]
        frames = []
        for rel in f['images'][:2]:
            im = Image.open(FEDB / 'exercises' / rel).convert('RGB')
            size = frames[0].size if frames else (WIDTH, round(im.height * WIDTH / im.width))
            frames.append(im.resize(size, Image.LANCZOS))
        frames[0].save(OUT / 'still' / f'{fid}.webp', 'WEBP', quality=70, method=6)
        if len(frames) > 1:
            frames[0].save(OUT / 'clip' / f'{fid}.webp', 'WEBP', save_all=True, append_images=frames[1:],
                           duration=900, loop=0, quality=65, method=6)
        else:
            frames[0].save(OUT / 'clip' / f'{fid}.webp', 'WEBP', quality=65, method=6)

    for ex in exdb:
        ex.pop('fv', None)
        ex.pop('mv', None)
        fid = matched.get(ex['id'])
        if fid:
            ex['img'] = f'{fid}.webp'
            ex['gif'] = f'{fid}.webp'
        else:
            ex.pop('img', None)
            ex.pop('gif', None)
    new = src[:m.start(1)] + json.dumps(exdb, separators=(',', ':'), ensure_ascii=False) + src[m.end(1):]
    new = new.replace('// generated by scripts/catalogue/build.mjs from catalogue/ — do not edit',
                      '// generated by openGym\'s scripts/catalogue/build.mjs; media fields rewritten by\n'
                      '// scripts/media-from-fedb.py (free-exercise-db, public domain) — do not edit by hand', 1)
    DATA.write_text(new)
    (OUT / 'NOTICE.md').write_text(
        '# Exercise pictures\n\nFrom free-exercise-db (https://github.com/yuhonas/free-exercise-db), released into the '
        'public domain (Unlicense). Resized and packed by scripts/media-from-fedb.py.\n')
    print(f'{len(matched)} of {len(exdb)} catalogue exercises matched to {len(used)} free-exercise-db pictures')
    for ex in exdb[:0]:
        pass
    sample = [(e['n'], matched[e['id']]) for e in exdb if e['id'] in matched][:0]


if __name__ == '__main__':
    main()
