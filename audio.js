export function createAudioController({ ui, setSuiteOutput }) {
  let audioContext;
  let micTestStream;
  let micTestAnalyser;
  let micTestRaf;
  let micTestSource;
  let micTestActive = false;
  let audioInputReady = false;
  const micStorageKey = 'voice_mic_device_id';

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  }

  function getSelectedMicId() {
    return localStorage.getItem(micStorageKey) || '';
  }

  function setSelectedMicId(value) {
    if (value) {
      localStorage.setItem(micStorageKey, value);
    } else {
      localStorage.removeItem(micStorageKey);
    }
  }

  async function populateMicSelect(preferredId) {
    if (!ui.micSelect || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (err) {
      devices = [];
    }
    const inputs = devices.filter((device) => device.kind === 'audioinput');
    ui.micSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Micrófono predeterminado';
    ui.micSelect.appendChild(defaultOption);
    inputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Micrófono ${index + 1}`;
      ui.micSelect.appendChild(option);
    });
    const stored = preferredId ?? getSelectedMicId();
    if (stored && inputs.some((device) => device.deviceId === stored)) {
      ui.micSelect.value = stored;
    }
  }

  async function ensureAudioInputAccess() {
    if (audioInputReady) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      audioInputReady = true;
      await populateMicSelect();
    } catch (err) {
      audioInputReady = false;
    }
  }

  function updateMicMeter(level) {
    if (!ui.micLevelFill) {
      return;
    }
    const value = Math.max(0, Math.min(1, level));
    ui.micLevelFill.style.width = `${Math.round(value * 100)}%`;
  }

  function stopMicTest() {
    micTestActive = false;
    if (micTestRaf) {
      cancelAnimationFrame(micTestRaf);
      micTestRaf = null;
    }
    if (micTestSource) {
      micTestSource.disconnect();
      micTestSource = null;
    }
    if (micTestStream) {
      micTestStream.getTracks().forEach((track) => track.stop());
      micTestStream = null;
    }
    micTestAnalyser = null;
    updateMicMeter(0);
    if (ui.micTestBtn) {
      ui.micTestBtn.textContent = 'Probar micrófono';
    }
  }

  async function startMicTest() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }
    await ensureAudioInputAccess();
    if (micTestActive) {
      stopMicTest();
      return;
    }
    const deviceId = ui.micSelect?.value || getSelectedMicId();
    const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
    micTestStream = await navigator.mediaDevices.getUserMedia(constraints);
    const context = getAudioContext();
    micTestSource = context.createMediaStreamSource(micTestStream);
    micTestAnalyser = context.createAnalyser();
    micTestAnalyser.fftSize = 512;
    micTestSource.connect(micTestAnalyser);
    micTestActive = true;
    if (ui.micTestBtn) {
      ui.micTestBtn.textContent = 'Detener prueba';
    }
    const data = new Uint8Array(micTestAnalyser.fftSize);
    const tick = () => {
      if (!micTestAnalyser) {
        return;
      }
      micTestAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const normalized = (data[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length);
      updateMicMeter(Math.min(1, rms * 2));
      micTestRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  async function runAudioOutputTest() {
    const context = getAudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gain.gain.value = 0.12;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    setSuiteOutput('Reproduciendo tono');
    await new Promise((resolve) => setTimeout(resolve, 800));
    oscillator.stop();
    setSuiteOutput('Tono finalizado');
  }

  async function runVoiceLoopTest() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSuiteOutput('Micrófono no disponible');
      return;
    }
    setSuiteOutput('Grabando 2 segundos...');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setSuiteOutput('Permiso de micrófono denegado');
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
    };
    await audio.play();
    setSuiteOutput('Reproduciendo grabación');
  }

  async function createAudioTrack(preferredDeviceId) {
    const deviceId = preferredDeviceId || getSelectedMicId();
    const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const context = getAudioContext();
    return { track: stream.getAudioTracks()[0], context };
  }

  return {
    getAudioContext,
    getSelectedMicId,
    setSelectedMicId,
    populateMicSelect,
    ensureAudioInputAccess,
    startMicTest,
    stopMicTest,
    runAudioOutputTest,
    runVoiceLoopTest,
    createAudioTrack
  };
}
