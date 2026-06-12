// =========================================================
// DISEÑO SONORO AVANZADO (ARQUITECTURA CROSSFADE SIN POPS)
// =========================================================

const audioBtn = document.getElementById('audio-toggle');
let audioCtx;
let source;
let biquadFilter;
let convolverNode;

// Ahora tenemos 3 canales separados en lugar de apagar filtros
let cleanGain;   // Canal 1: Música intacta
let radioGain;   // Canal 2: Música de radio vieja
let wetGain;     // Canal 3: Eco y reverberación
let mainGain;    // Volumen General

let isPlaying = false;
let audioBuffer = null;
let lastScrollY = window.scrollY;
let scrollTimeout;

function createReverbSpace() {
    const rate = audioCtx.sampleRate;
    const len = rate * 1.5; 
    const buffer = audioCtx.createBuffer(2, len, rate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    
    for (let i = 0; i < len; i++) {
        const decay = Math.exp(-i / (rate * 0.4)); 
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
    }
    
    const convolver = audioCtx.createConvolver();
    convolver.buffer = buffer;
    return convolver;
}

async function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioBtn.textContent = 'CARGANDO...';

        const audioSrc = audioBtn.getAttribute('data-audio-src') || 'cancion.mp3';
        const response = await fetch(audioSrc); 
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await new Promise((resolve, reject) => {
            audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
        });

        return true;
    } catch (error) {
        console.error("Error al cargar el audio:", error);
        audioBtn.textContent = 'ERROR AUDIO';
        return false;
    }
}

async function toggleAudio() {
    if (!audioCtx) {
        const success = await initAudio();
        if (!success) return;
    }

    if (isPlaying) {
        source.stop();
        isPlaying = false;
        audioBtn.textContent = 'SOUND [OFF]';
    } else {
        source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true;

        // El filtro AHORA ES FIJO, nunca cambia de tipo para evitar el "pop"
        biquadFilter = audioCtx.createBiquadFilter();
        biquadFilter.type = 'bandpass'; 
        biquadFilter.Q.value = 0.6; 
        biquadFilter.frequency.value = 800; // Arranca inactivo en el fondo

        convolverNode = createReverbSpace();

        cleanGain = audioCtx.createGain(); 
        radioGain = audioCtx.createGain(); 
        wetGain = audioCtx.createGain(); 
        mainGain = audioCtx.createGain(); 

        // Empezamos solo escuchando el canal limpio
        cleanGain.gain.value = 1.0;
        radioGain.gain.value = 0.0; 
        wetGain.gain.value = 0.0; 
        mainGain.gain.value = 1.8; 

        // ENRUTAMIENTO ESTILO CONSOLA (Evita clics)
        // Camino 1 (Limpio directo al Master)
        source.connect(cleanGain);
        cleanGain.connect(mainGain);
        
        // Camino 2 (Pasa por la radio y va al Master)
        source.connect(biquadFilter);
        biquadFilter.connect(radioGain);
        radioGain.connect(mainGain);

        // Camino 3 (Toma de la radio, añade eco y va al Master)
        biquadFilter.connect(convolverNode);
        convolverNode.connect(wetGain);
        wetGain.connect(mainGain);

        mainGain.connect(audioCtx.destination);

        source.start(0);
        isPlaying = true;
        audioBtn.textContent = 'SOUND [ON]';
    }
}

if (audioBtn) audioBtn.addEventListener('click', toggleAudio);

window.addEventListener('scroll', () => {
    if (!isPlaying || !source || !biquadFilter) return;

    const currentScrollY = window.scrollY;
    const scrollVelocity = Math.abs(currentScrollY - lastScrollY);
    lastScrollY = currentScrollY;

    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const scrollProgress = Math.min(1, Math.max(0, currentScrollY / maxScroll));
    const now = audioCtx.currentTime;

    // ==========================================
    // EFECTO 1: DISTORSIÓN INSTANTÁNEA POR VELOCIDAD
    // ==========================================
    
    // 1. EL UMBRAL: Subimos de 2 a 8. 
    // Ahora ignorará por completo el "freno suave" de Lenis y solo actuará 
    // cuando des un tirón real con el dedo o la rueda.
    if (scrollVelocity > 25) {
        source.playbackRate.cancelScheduledValues(now);
        source.playbackRate.setValueAtTime(source.playbackRate.value, now);
        source.playbackRate.linearRampToValueAtTime(0.9, now + 0.05); 

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            if (isPlaying && source) {
                const timeNow = audioCtx.currentTime;
                source.playbackRate.cancelScheduledValues(timeNow);
                source.playbackRate.setValueAtTime(source.playbackRate.value, timeNow);
                
                // 2. LA RAMPA: Bajamos de 0.1 a 0.02.
                // La recuperación ahora toma 20 milisegundos (casi imperceptible),
                // regresando a la velocidad normal como un latigazo.
                source.playbackRate.linearRampToValueAtTime(1.0, timeNow + 0.02); 
            }
        }, 40); 
    }

    // EFECTO 2: CROSSFADE AL MURO (Sin cambiar el tipo de filtro)
    if (scrollProgress > 0.6) {
        const filterProgress = (scrollProgress - 0.6) / 0.4; 
        const targetFreq = 800 + (filterProgress * 2700); 

        // Modifica la frecuencia de la radio (ya está prendida, no hace 'pop')
        biquadFilter.frequency.cancelScheduledValues(now);
        biquadFilter.frequency.setValueAtTime(biquadFilter.frequency.value, now);
        biquadFilter.frequency.linearRampToValueAtTime(targetFreq, now + 0.05);

        // FADE OUT (Baja la música limpia)
        cleanGain.gain.cancelScheduledValues(now);
        cleanGain.gain.setValueAtTime(cleanGain.gain.value, now);
        cleanGain.gain.linearRampToValueAtTime(1.0 - filterProgress, now + 0.05); 

        // FADE IN (Sube la música de radio)
        radioGain.gain.cancelScheduledValues(now);
        radioGain.gain.setValueAtTime(radioGain.gain.value, now);
        radioGain.gain.linearRampToValueAtTime(filterProgress, now + 0.05);

        // FADE IN (Sube el eco)
        wetGain.gain.cancelScheduledValues(now);
        wetGain.gain.setValueAtTime(wetGain.gain.value, now);
        wetGain.gain.linearRampToValueAtTime(filterProgress * 2.5, now + 0.05); 

    } else {
        // Regreso rápido a la normalidad manipulando solo volúmenes
        cleanGain.gain.cancelScheduledValues(now);
        cleanGain.gain.setValueAtTime(cleanGain.gain.value, now);
        cleanGain.gain.linearRampToValueAtTime(1.0, now + 0.05);

        radioGain.gain.cancelScheduledValues(now);
        radioGain.gain.setValueAtTime(radioGain.gain.value, now);
        radioGain.gain.linearRampToValueAtTime(0.0, now + 0.05);

        wetGain.gain.cancelScheduledValues(now);
        wetGain.gain.setValueAtTime(wetGain.gain.value, now);
        wetGain.gain.linearRampToValueAtTime(0.0, now + 0.05);
    }
});