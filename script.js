/* Change the greeting in index.html. Keep your video named hbd.mp4. */
'use strict';
const $ = id => document.getElementById(id);
const video = $('video');
let context, stream, source, analyser, frame, musicTimer;
let state = 'idle', generation = 0;
const notes = new Set();

function stopMic() {
  cancelAnimationFrame(frame);
  if (stream) stream.getTracks().forEach(track => track.stop());
  source?.disconnect();
  stream = source = analyser = null;
}
function stopMusic() {
  clearTimeout(musicTimer);
  notes.forEach(node => { try { node.stop(); } catch (_) {} });
  notes.clear();
}
function playSong() {
  if (!context || state === 'revealed') return;
  // A gentle, synthesized instrumental Happy Birthday melody; no audio download needed.
  const melody = [[60,.75],[60,.25],[62,1],[60,1],[65,1],[64,2],
    [60,.75],[60,.25],[62,1],[60,1],[67,1],[65,2],
    [60,.75],[60,.25],[72,1],[69,1],[65,1],[64,1],[62,2],
    [70,.75],[70,.25],[69,1],[65,1],[67,1],[65,2]];
  let at = context.currentTime + .12;
  for (const [pitch, beats] of melody) {
    const oscillator = context.createOscillator(), volume = context.createGain();
    const duration = beats * .39;
    oscillator.type = 'sine';
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(.075, at + .015);
    volume.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(volume).connect(context.destination);
    notes.add(oscillator);
    oscillator.onended = () => { notes.delete(oscillator); oscillator.disconnect(); volume.disconnect(); };
    oscillator.start(at); oscillator.stop(at + duration + .05);
    at += duration;
  }
  musicTimer = setTimeout(playSong, (at - context.currentTime + 1.5) * 1000);
}
function enterFullscreen(element) {
  try {
    if (!document.fullscreenElement && element.requestFullscreen) {
      element.requestFullscreen().catch(() => {});
    } else if (element === video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch (_) { /* The full-viewport player remains available. */ }
}
async function start() {
  if (state !== 'idle') return;
  state = 'starting';
  const run = ++generation;
  $('start').disabled = true;
  $('manual').hidden = false;
  // Request fullscreen during the tap, before waiting for microphone permission.
  enterFullscreen($('birthday'));
  // Unlock this media element during a user gesture where the browser permits it.
  video.muted = true;
  video.play().then(() => {
    if (state !== 'revealed') { video.pause(); video.currentTime = 0; }
    video.muted = false;
  }).catch(() => { video.muted = false; });
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context = context || new AudioContext();
      await context.resume();
      if (run !== generation) return;
      playSong();
    }
    if (!navigator.mediaDevices?.getUserMedia || !context) throw new Error('unavailable');
    $('status').textContent = 'Tap Allow for the mic, then you can blow out your candle!';
    const incoming = await navigator.mediaDevices.getUserMedia({audio: {
      echoCancellation: true, noiseSuppression: false, autoGainControl: false
    }});
    if (run !== generation) { incoming.getTracks().forEach(t => t.stop()); return; }
    stream = incoming;
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser); // Never connect the mic to the speakers.
    state = 'calibrating';
    $('start').hidden = true;
    $('listening').hidden = false;
    $('instruction').textContent = 'Think of a good wish…';
    $('status').textContent = 'Shhh… give it a second, then get ready to blow!';
    listen();
  } catch (error) {
    if (run !== generation) return;
    stopMic();
    state = 'ready';
    $('start').hidden = true;
    $('instruction').textContent = 'No mic? No problem!';
    $('status').textContent = !window.isSecureContext
      ? 'The mic won’t work on this link, but you can still tap below to make your wish!'
      : 'We can do this with a tap instead. Your surprise is still waiting!';
  }
}
function listen() {
  const samples = new Float32Array(analyser.fftSize);
  const began = performance.now();
  let floor = .005, count = 0, total = 0, sustained = 0, last = began;
  function tick(now) {
    if (!analyser || !['calibrating', 'listening'].includes(state)) return;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);
    const threshold = Math.max(.035, floor * 3.2) * (2 / Number($('sensitivity').value));
    const percent = Math.min(100, Math.round(rms / threshold * 65));
    $('level').style.width = percent + '%';
    $('level').parentElement.setAttribute('aria-valuenow', percent);
    if (state === 'calibrating') {
      total += rms; count++;
      if (now - began > 1600) {
        floor = Math.max(.003, total / count);
        state = 'listening';
        $('instruction').textContent = 'Ready? Make a wish and blow!';
        $('status').textContent = 'Give your phone’s mic a gentle blow for about a second.';
      }
    } else {
      sustained = rms > threshold ? sustained + Math.min(now - last, 80) : Math.max(0, sustained - 35);
      if (sustained > 430) { blow(); return; }
    }
    last = now;
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
}
function blow() {
  if (state === 'revealed' || state === 'blown') return;
  state = 'blown'; ++generation;
  stopMic(); stopMusic();
  $('birthday').classList.add('blown');
  document.querySelector('.cake-scene').setAttribute('aria-label', 'A birthday cake with its candle blown out');
  $('instruction').textContent = 'Hope your wish comes true!';
  $('status').textContent = 'Happy birthday, my friend! ♡';
  $('manual').hidden = $('listening').hidden = $('start').hidden = true;
  setTimeout(() => {
    if (state !== 'blown') return;
    state = 'revealed';
    $('reveal').hidden = false;
    video.currentTime = 0; video.muted = false;
    video.play().catch(() => { $('play').hidden = false; });
    $('fullscreen').focus();
  }, 1100);
}
$('start').addEventListener('click', start);
$('manual').addEventListener('click', blow);
$('fullscreen').addEventListener('click', () => enterFullscreen(video));
$('play').addEventListener('click', () => {
  video.play().then(() => { $('play').hidden = true; }).catch(() => { $('video-error').hidden = false; });
  enterFullscreen(video);
});
video.addEventListener('playing', () => { $('play').hidden = true; });
video.addEventListener('error', () => { $('video-error').hidden = false; });
$('again').addEventListener('click', () => {
  ++generation; stopMic(); stopMusic(); video.pause(); video.currentTime = 0;
  if (document.fullscreenElement === video) document.exitFullscreen().catch(() => {});
  state = 'idle';
  $('reveal').hidden = true; $('play').hidden = true;
  $('birthday').classList.remove('blown');
  document.querySelector('.cake-scene').setAttribute('aria-label', 'A birthday cake with a glowing candle');
  $('start').hidden = false; $('start').disabled = false;
  $('instruction').textContent = 'Go on, make a wish!';
  $('status').textContent = 'Another wish? Go for it. It’s your birthday!';
  $('start').focus();
});
window.addEventListener('pagehide', () => { ++generation; stopMic(); stopMusic(); context?.suspend(); });
