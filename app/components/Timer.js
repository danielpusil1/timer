"use client";
import { useState, useEffect, useRef } from 'react';
import styles from './Timer.module.css';

export default function Timer() {
    const [isActive, setIsActive] = useState(false);
    const [phase, setPhase] = useState('WORK');
    const [round, setRound] = useState(1);
    const [currentCycle, setCurrentCycle] = useState(1);
    const [timeLeft, setTimeLeft] = useState(20);
    const [totalTime, setTotalTime] = useState(20);
    const [showSettings, setShowSettings] = useState(false);

    // Refs for logic that needs to survive renders without triggering them or for intervals
    const endTimeRef = useRef(null);
    const wakeLockRef = useRef(null);

    // Configuration State
    const [config, setConfig] = useState({
        work: 20,
        rest: 10,
        rounds: 8,
        cycles: 1,
        cycleRest: 60,
        prepare: 10,
        volume: 0.5,
        name: "My Workout"
    });

    const [savedRoutines, setSavedRoutines] = useState([]);

    // Load Routines
    useEffect(() => {
        const saved = localStorage.getItem('gymTimerRoutines');
        if (saved) {
            try {
                setSavedRoutines(JSON.parse(saved));
            } catch (e) { console.error("Failed to parse", e); }
        }
    }, []);

    // --- WAKE LOCK MANAGER ---
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.log(`${err.name}, ${err.message}`);
        }
    };

    const releaseWakeLock = async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
            } catch (err) { console.log(err); }
        }
    };

    // Reactivate Wake Lock if visibility changes (user switches tabs and comes back)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isActive) {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isActive]);


    // --- AUDIO & BACKGROUND HANDLING ---
    const audioCtxRef = useRef(null);
    const audioElRef = useRef(null);

    useEffect(() => {
        const audio = new Audio('https://raw.githubusercontent.com/anars/blank-audio/master/10-minutes-of-silence.mp3');
        audio.loop = true;
        audio.playsInline = true;
        audio.preload = 'auto';
        audioElRef.current = audio;

        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();

        return () => {
            if (audioElRef.current) {
                audioElRef.current.pause();
                audioElRef.current = null;
            }
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, []);

    const initAudio = () => {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }

        if (audioElRef.current && audioElRef.current.paused) {
            audioElRef.current.play().catch(e => console.error("Background audio playback failed", e));
        }
    };



    const playTone = (freq, type = 'sine', duration = 0.1, delay = 0) => {
        if (!audioCtxRef.current) return;
        const ctx = audioCtxRef.current;
        if (config.volume <= 0.01) return;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.frequency.value = freq;
            osc.type = type;

            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime + delay;
            const vol = config.volume || 0.5;

            osc.start(now);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.stop(now + duration);
        } catch (e) {
            console.error("Audio error", e);
        }
    };

    const playPhaseSound = (newPhase) => {
        if (newPhase === 'WORK') {
            playTone(880, 'sine', 0.1);
            playTone(1760, 'sine', 0.2, 0.1);
        } else if (newPhase === 'REST') {
            playTone(440, 'triangle', 0.3);
        } else if (newPhase === 'CYCLE_REST') {
            playTone(330, 'triangle', 0.5);
            playTone(220, 'triangle', 0.5, 0.1);
        } else if (newPhase === 'DONE') {
            playTone(523.25, 'sine', 0.1);
            playTone(659.25, 'sine', 0.1, 0.15);
            playTone(783.99, 'sine', 0.4, 0.3);
        } else if (newPhase === 'PREP') {
            playTone(660, 'sine', 0.05);
        }
    };

    const playCountdownBeep = () => playTone(880, 'square', 0.1);

    // --- PRECISE TIMER LOGIC (Drift Correction) ---
    // We use a delta-based approach. 
    // We don't use a strict EndTime because phases change dynamically. 
    // Instead, we check how much real time passed since last tick.

    useEffect(() => {
        let interval = null;
        let expected = Date.now() + 1000;

        if (isActive && timeLeft > 0) {
            if (!wakeLockRef.current) requestWakeLock();

            interval = setTimeout(function step() {
                const now = Date.now();
                const dt = now - expected; // drift

                // If drift is huge (User locked screen for a long time), we might want to catch up?
                // For a gym timer, if I lock screen for 20s during a 30s rest, I expect 10s left when I open.
                // Simple decrement doesn't do this.
                // Let's stick to 1s decrement for visual smoothness, but we could be smarter.
                // For V1.5, let's keep robust 1s ticks but use wakeLock to prevent the drift source (sleep).

                // Countdown Logic
                if (timeLeft <= 4 && timeLeft > 1) { // Trigger at 3, 2, 1 (displayed)
                    playCountdownBeep();
                }

                setTimeLeft((prev) => prev - 1);

                expected += 1000;
                // Schedule next tick accounting for drift
                interval = setTimeout(step, Math.max(0, 1000 - dt));
            }, 1000);

        } else if (timeLeft <= 0 && isActive) {
            // ... Phase Transition Logic (Same as before) ...
            handlePhaseTransition();
        } else {
            // Paused/Done
            releaseWakeLock();
        }
        return () => clearTimeout(interval);
    }, [isActive, timeLeft]); // Re-binds when time changes, effectively a 1s loop managed by React cycle

    // Extracted Transition Logic to avoid effect bloating
    const handlePhaseTransition = () => {
        if (phase === 'PREP') {
            transitionTo('WORK', config.work);
        }
        else if (phase === 'WORK') {
            if (round < config.rounds) {
                transitionTo('REST', config.rest);
            } else {
                if (currentCycle < config.cycles) {
                    transitionTo('CYCLE_REST', config.cycleRest);
                } else {
                    playPhaseSound('DONE');
                    setIsActive(false);
                    setPhase('DONE');
                    releaseWakeLock();
                }
            }
        } else if (phase === 'REST') {
            setRound((r) => r + 1);
            transitionTo('WORK', config.work);
        } else if (phase === 'CYCLE_REST') {
            setCurrentCycle((c) => c + 1);
            setRound(1);
            transitionTo('WORK', config.work);
        }
    };

    const transitionTo = (newPhase, time) => {
        playPhaseSound(newPhase);
        setPhase(newPhase);
        setTotalTime(time);
        setTimeLeft(time);
    };

    const toggleTimer = () => {
        if (phase === 'DONE') {
            resetTimer();
        } else {
            if (!isActive) {
                // Starting
                initAudio();
                const isInitial = phase === 'WORK' && round === 1 && currentCycle === 1 && timeLeft === config.work && timeLeft === totalTime;
                if (isInitial && config.prepare > 0) {
                    transitionTo('PREP', config.prepare);
                    setIsActive(true);
                    setShowSettings(false);
                    return;
                }
                setIsActive(true);
                setShowSettings(false);
            } else {
                setIsActive(false);
            }
        }
    };

    const resetTimer = () => {
        setIsActive(false);
        setPhase('WORK');
        setRound(1);
        setCurrentCycle(1);
        setTotalTime(config.work);
        setTimeLeft(config.work);
    };

    // ... (Helper functions: formatTime, handleConfigChange, etc. keep same) ...
    const formatTime = (seconds) => {
        const safeSeconds = Math.max(0, seconds);
        const m = Math.floor(safeSeconds / 60);
        const s = safeSeconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        let newVal;
        if (name === 'name') newVal = value;
        else if (name === 'volume') newVal = parseFloat(value);
        else newVal = (value === '' ? '' : parseInt(value));

        setConfig(prev => ({ ...prev, [name]: newVal }));

        if (!isActive) {
            const intVal = parseInt(value) || 0;
            if (name === 'work' && phase === 'WORK') {
                setTimeLeft(intVal);
                setTotalTime(intVal);
            }
        }
    };

    const saveRoutine = () => {
        const safeConfig = { ...config, id: Date.now() };
        const updated = [...savedRoutines, safeConfig];
        setSavedRoutines(updated);
        localStorage.setItem('gymTimerRoutines', JSON.stringify(updated));
        alert('Routine Saved!');
    };

    const loadRoutine = (routine) => {
        setConfig({
            ...routine,
            volume: routine.volume !== undefined ? routine.volume : 0.5,
        });
        setIsActive(false);
        setPhase('WORK');
        setRound(1);
        setCurrentCycle(1);
        setTotalTime(routine.work);
        setTimeLeft(routine.work);
        setShowSettings(false);
    };

    const deleteRoutine = (id, e) => {
        e.stopPropagation();
        const updated = savedRoutines.filter(r => r.id !== id);
        setSavedRoutines(updated);
        localStorage.setItem('gymTimerRoutines', JSON.stringify(updated));
    };

    // Visuals
    const radius = 120;
    const circumference = 2 * Math.PI * radius;
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    const strokeDashoffset = circumference * (1 - progress);

    const ringHue = Math.floor(progress * 140);
    const ringColor = `hsl(${ringHue}, 90%, 60%)`;
    const glowSize = timeLeft <= 5 ? '15px' : '8px';
    const dropShadow = `drop-shadow(0 0 ${glowSize} ${ringColor})`;

    let modeClass = styles.workMode;
    if (phase === 'REST') modeClass = styles.restMode;
    if (phase === 'CYCLE_REST') modeClass = styles.cycleRestMode;
    if (phase === 'PREP') modeClass = styles.prepMode;

    return (
        <div className={`glass-panel ${styles.container} ${showSettings ? styles.editing : ''} ${modeClass}`}>
            <div className={styles.timerRing}>
                <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: 'absolute', transform: 'rotate(-90deg)', zIndex: 0 }}>
                    <circle cx="140" cy="140" r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="12" fill="transparent" />
                    <circle
                        cx="140" cy="140" r={radius}
                        stroke={phase === 'PREP' ? '#FDC830' : ringColor}
                        strokeWidth="12"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        style={{
                            transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease, filter 0.5s ease',
                            filter: phase === 'PREP' ? 'drop-shadow(0 0 10px #F37335)' : dropShadow
                        }}
                    />
                </svg>
                <div className={styles.content}>
                    <div className={styles.timeText}>{formatTime(timeLeft)}</div>
                    <div className={styles.phaseLabel}>
                        {phase === 'done' ? 'COMPLETE' : (phase === 'PREP' ? 'GET READY' : phase.replace('_', ' '))}
                    </div>
                    {phase !== 'PREP' && phase !== 'DONE' && (
                        <div style={{ marginTop: '0.5rem', opacity: 0.6, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums', letterSpacing: '2px' }}>
                            ROUND {round}/{config.rounds || '-'} <br />
                            CYCLE {currentCycle}/{config.cycles || '-'}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.controls}>
                <button className={styles.button} onClick={toggleTimer}>
                    {isActive ? 'PAUSE' : (phase === 'DONE' ? 'RESTART' : 'START')}
                </button>
                {!isActive && (
                    <>
                        <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={resetTimer}>RESET</button>
                        <button className={styles.iconButton} onClick={() => setShowSettings(!showSettings)} title="Settings">⚙️</button>
                    </>
                )}
            </div>

            {showSettings && (
                <div className={styles.settingsPanel}>
                    <div className={styles.inputGroup} style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                        <label className={styles.inputLabel}>
                            Volume ({Math.round(config.volume * 100)}%)
                            <input type="range" min="0" max="1" step="0.1" name="volume" value={config.volume} onChange={handleConfigChange} style={{ width: '100%', marginTop: '8px', accentColor: '#00f260' }} />
                        </label>
                        <label className={styles.inputLabel}>
                            Prepare (s)
                            <input type="number" name="prepare" value={config.prepare} onChange={handleConfigChange} className={styles.input} />
                        </label>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>Work (s) <input type="number" name="work" value={config.work} onChange={handleConfigChange} className={styles.input} /></label>
                        <label className={styles.inputLabel}>Rest (s) <input type="number" name="rest" value={config.rest} onChange={handleConfigChange} className={styles.input} /></label>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>Rounds <input type="number" name="rounds" value={config.rounds} onChange={handleConfigChange} className={styles.input} /></label>
                        <label className={styles.inputLabel}>Cycles <input type="number" name="cycles" value={config.cycles} onChange={handleConfigChange} className={styles.input} /></label>
                    </div>
                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>Cycle Rest (s) <input type="number" name="cycleRest" value={config.cycleRest} onChange={handleConfigChange} className={styles.input} /></label>
                        <label className={styles.inputLabel}>Name <input type="text" name="name" value={config.name} onChange={handleConfigChange} className={styles.input} placeholder="Legs" /></label>
                    </div>
                    <button className={`${styles.button} ${styles.buttonSecondary}`} style={{ width: '100%', padding: '12px', fontSize: '0.9rem' }} onClick={saveRoutine}>SAVE ROUTINE</button>
                    {savedRoutines.length > 0 && (
                        <div className={styles.savedRoutines}>
                            <div className={styles.savedHeader}>Saved Routines</div>
                            {savedRoutines.map(routine => (
                                <div key={routine.id} className={styles.routineChip} onClick={() => loadRoutine(routine)}>
                                    <div>
                                        <div className={styles.routineName}>{routine.name}</div>
                                        <div className={styles.routineDetails}>{routine.rounds} x {routine.work}/{routine.rest}s • Vol {Math.round((routine.volume || 0.5) * 100)}%</div>
                                    </div>
                                    <button className={styles.deleteBtn} onClick={(e) => deleteRoutine(routine.id, e)}>✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
