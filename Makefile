PORT ?= 8796
PY ?= .venv/bin/python
FPS = 30

.PHONY: serve setup frames audio video stills check clean

# Open http://127.0.0.1:8796/ after this (?film plays the film, ?lang=ja for Japanese)
serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1 --directory web

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	.venv/bin/playwright install chromium

# Record the film frame by frame (3200x1800 PNG, about 3 s a frame on an M-series Mac), then the sound, then the mp4
frames:
	$(PY) tools/render.py build/frames 0 -1 $(FPS)

audio:
	$(PY) tools/audio.py build/frames build/senko.wav $(FPS)

video: audio
	sh tools/encode.sh build/frames build/senko.wav build/senko.mp4

# A few stills from the film: make stills S="3.6 12 16.5"
stills:
	$(PY) tools/stills.py build/stills $(S)

check:
	$(PY) -m pyflakes tools

clean:
	rm -rf build
