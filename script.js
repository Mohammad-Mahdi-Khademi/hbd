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
  if (!context || !['listening', 'ready'].includes(state)) return;
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
    }
    if (!navigator.mediaDevices?.getUserMedia || !context) throw new Error('unavailable');
    $('gate-status').textContent = 'Tap Allow in your browser’s microphone prompt.';
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
    $('gate-status').textContent = 'Almost ready… stay quiet for a moment.';
    listen();
  } catch (error) {
    if (run !== generation) return;
    stopMic();
    state = 'idle';
    $('start').disabled = false;
    $('gate-status').textContent = 'Microphone access is unavailable. Try again, or continue without it.';
  }
}
function showBirthday() {
  $('permission-gate').hidden = true;
  $('birthday').hidden = false;
  document.title = 'Happy birthday, my friend! 🎉';
  $('manual').hidden = false;
  $('listening').hidden = state !== 'listening';
  $('instruction').textContent = 'Ready? Make a wish and blow!';
  $('status').textContent = state === 'listening'
    ? 'A short, gentle puff near your mic is enough. You can also tap below.'
    : 'Make your wish, then tap below to blow out your candle.';
  playSong();
  $('manual').focus();
}
function listen() {
  const samples = new Float32Array(analyser.fftSize);
  const began = performance.now();
  let floor = .003, sustained = 0, last = began;
  const baseline = [];
  function tick(now) {
    if (!analyser || !['calibrating', 'listening'].includes(state)) return;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);
    // Cap the noise floor so an early puff cannot make the candle impossible to blow out.
    const threshold = Math.max(.012, Math.min(.04, floor * 2.2)) * (2 / Number($('sensitivity').value));
    const percent = Math.min(100, Math.round(rms / threshold * 65));
    $('level').style.width = percent + '%';
    $('level').parentElement.setAttribute('aria-valuenow', percent);
    if (state === 'calibrating') {
      baseline.push(rms);
      if (now - began > 700) {
        baseline.sort((a, b) => a - b);
        floor = Math.max(.002, baseline[Math.floor(baseline.length * .2)]);
        state = 'listening';
        showBirthday();
      }
    } else {
      sustained = rms > threshold ? sustained + Math.min(now - last, 80) : Math.max(0, sustained - 35);
      if (sustained >= 160) { blow(); return; }
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
$('skip').addEventListener('click', async () => {
  ++generation;
  stopMic(); stopMusic();
  state = 'ready';
  const run = generation;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context = context || new AudioContext();
      await context.resume();
    }
  } catch (_) { /* The surprise still works without audio support. */ }
  if (run === generation && state === 'ready') showBirthday();
});
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
  $('birthday').hidden = true; $('permission-gate').hidden = false;
  document.title = 'A little surprise';
  $('gate-status').textContent = 'Allow microphone access to get everything ready. Nothing is recorded.';
  $('reveal').hidden = true; $('play').hidden = true;
  $('birthday').classList.remove('blown');
  document.querySelector('.cake-scene').setAttribute('aria-label', 'A birthday cake with a glowing candle');
  $('start').hidden = false; $('start').disabled = false;
  $('instruction').textContent = 'Go on, make a wish!';
  $('status').textContent = 'Another wish? Go for it. It’s your birthday!';
  $('start').focus();
});
window.addEventListener('pagehide', () => { ++generation; stopMic(); stopMusic(); context?.suspend(); });
