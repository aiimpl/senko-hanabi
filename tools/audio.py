"""Soundtrack for the film, synthesized with numpy (no sound files).
  python tools/audio.py <frames dir with meta.json> <out.wav> [fps]
Driven by the per-frame record the renderer wrote (shot, burn time, slow motion, light, and the bursts of that frame
with their size and distance from the camera):
  night    autumn insects (suzumushi-like trills) and a little air
  flame    the hiss of the lit paper for the first seconds
  sizzle   the boiling fireball, louder as it sparks harder
  crackle  one tiny click per burst (the "pachi-pachi"), quieter with distance
  slow     in the high-speed shot the world goes quiet: the insects drop away and each burst is a low, soft pop
  fall     the fireball landing on the ground: a short hiss (the film shows the fall at 1/20 speed)
"""
import json
import os
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(11)


def band(x, lo, hi):
    f = np.fft.rfft(x)
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    m = ((fr >= lo) & (fr <= hi)).astype(float)
    # soft edges
    m = np.convolve(m, np.hanning(41) / np.hanning(41).sum(), mode="same")
    return np.fft.irfft(f * m, len(x))


def env_from_frames(vals, fps, n):
    t = np.arange(n) / SR
    ft = np.arange(len(vals)) / fps
    return np.interp(t, ft, vals)


def main():
    src, out = sys.argv[1], sys.argv[2]
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    meta = json.load(open(os.path.join(src, "meta.json")))
    nfr = len(meta)
    dur = nfr / fps + 0.6
    n = int(dur * SR)
    L = np.zeros(n); R = np.zeros(n)
    t = np.arange(n) / SR

    slow = np.array([1.0 if m.get("slow", 1) > 1 else 0.0 for m in meta])
    slow_e = env_from_frames(np.convolve(slow, np.ones(6) / 6, mode="same"), fps, n)
    T = np.array([m["T"] for m in meta])
    light = np.array([m["light"] for m in meta])
    dropped = np.array([1.0 if m["dropped"] else 0.0 for m in meta])

    # night: insects, three of them at different pitches, and air
    night = np.zeros(n)
    for f0, gain, seed in [(4300, 1.0, 1), (4650, 0.6, 2), (3920, 0.45, 3)]:
        r = np.random.default_rng(seed)
        gate = np.zeros(n)
        s = r.uniform(0.2, 0.9)
        while s < dur:
            ln = r.uniform(0.35, 0.7)
            k = 0.0
            while k < ln:
                i0 = int((s + k) * SR); i1 = min(n, i0 + int(0.014 * SR))
                if i0 < n:
                    gate[i0:i1] = np.sin(np.linspace(0, np.pi, i1 - i0)) ** 2
                k += 1 / 45
            s += ln + r.uniform(0.4, 1.3)
        night += np.sin(2 * np.pi * f0 * t + 0.002 * np.sin(2 * np.pi * 6 * t)) * gate * gain
    air = band(rng.standard_normal(n), 80, 900) * 0.25
    night = night * 0.022 + air * 0.012
    night *= 1 - 0.85 * slow_e
    L += night; R += night * 0.9 + np.roll(night, 900) * 0.1

    # flame hiss while the paper burns (burn time 0 .. 2.8)
    fl_amt = np.clip(T / 0.3, 0, 1) * np.clip((2.8 - T) / 0.6, 0, 1)
    fl = band(rng.standard_normal(n), 300, 2600) * env_from_frames(fl_amt, fps, n)
    flick = 0.7 + 0.3 * np.interp(t, np.arange(0, dur, 0.05), rng.uniform(0, 1, len(np.arange(0, dur, 0.05))))
    fl *= flick * 0.09
    L += fl; R += fl

    # sizzle of the boiling ball
    sz_amt = np.where((T > 2.4) & (dropped < 0.5), 0.35 + 0.65 * np.clip(light / 4, 0, 1), 0.0)
    sz = band(rng.standard_normal(n), 2500, 9000) * env_from_frames(sz_amt, fps, n) * 0.022
    sz *= 1 - 0.9 * slow_e
    L += sz; R += sz

    # crackle: a click per burst
    click_len = int(0.004 * SR)
    ck = rng.standard_normal(click_len) * np.exp(-np.arange(click_len) / (SR * 0.0007))
    ck = ck - np.convolve(ck, np.ones(6) / 6, mode="same")  # a bit brighter
    pop_len = int(0.09 * SR)
    pop = band(rng.standard_normal(pop_len * 2), 60, 700)[:pop_len] * np.exp(-np.arange(pop_len) / (SR * 0.018))
    pop /= np.abs(pop).max()
    for m in meta:
        ft0 = m["f"] / fps
        evs = m.get("ev", [])
        if not evs:
            continue
        total = m.get("n", len(evs))
        scale = np.sqrt(max(1, total) / max(1, len(evs)))
        cap = 14 if m.get("slow", 1) > 1 else 60
        for e in evs[:cap]:
            off = ft0 + rng.uniform(0, 1 / fps)
            i0 = int(off * SR)
            d = max(0.08, e["d"])
            a = 0.5 * np.sqrt(e["e"]) * (0.3 / d) * scale * rng.uniform(0.4, 1.0)
            pan = rng.uniform(-0.6, 0.6)
            if m.get("slow", 1) > 1:
                s = pop * a * 0.9
            else:
                s = ck * a * 0.35
            i1 = min(n, i0 + len(s))
            L[i0:i1] += s[: i1 - i0] * (1 - pan) * 0.7
            R[i0:i1] += s[: i1 - i0] * (1 + pan) * 0.7

    # slow motion: a low swell under the shot
    sw = band(rng.standard_normal(n), 30, 160) * slow_e * 0.25
    L += sw; R += sw

    # the fall: the ball lands about 0.3 s (burn time) after it lets go, if the film is still running then
    drop_t = next((m["dropT"] for m in meta if m["dropped"]), None)
    land = next((i / fps for i, m in enumerate(meta) if drop_t is not None and m["T"] >= drop_t + 0.31), None)
    if land is not None:
        i0 = int(land * SR); ln = int(0.5 * SR)
        hiss = band(rng.standard_normal(ln), 1500, 8000) * np.exp(-np.arange(ln) / (SR * 0.12)) * 0.12
        tick = band(rng.standard_normal(ln), 200, 2000) * np.exp(-np.arange(ln) / (SR * 0.01)) * 0.18
        snd = hiss + tick
        i1 = min(n, i0 + ln)
        L[i0:i1] += snd[: i1 - i0]; R[i0:i1] += snd[: i1 - i0]

    # fade out at the very end
    fo = np.clip((dur - 0.6 - t) / 1.2, 0, 1)
    L *= fo; R *= fo
    peak = max(np.abs(L).max(), np.abs(R).max())
    L /= peak / 0.9; R /= peak / 0.9
    data = (np.stack([L, R], 1) * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("wrote", out, f"{dur:.1f}s")


main()
