"use client";
import { useState, useEffect } from 'react';
import styles from './Timer.module.css';

export default function Timer() {
    const [isActive, setIsActive] = useState(false);
    const [phase, setPhase] = useState('WORK'); // 'WORK', 'REST', 'CYCLE_REST', 'DONE', 'PREP'
    const [round, setRound] = useState(1);
    const [currentCycle, setCurrentCycle] = useState(1);
    const [timeLeft, setTimeLeft] = useState(20);
    const [totalTime, setTotalTime] = useState(20);
    const [showSettings, setShowSettings] = useState(false);

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

    // Load from LocalStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('gymTimerRoutines');
        if (saved) {
            try {
                setSavedRoutines(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse routines", e);
            }
        }
    }, []);

    // Sound Generator using Web Audio API
    const playTone = (freq, type = 'sine', duration = 0.1, delay = 0) => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;

        // Check volume (simple override)
        if (config.volume <= 0.01) return;

        const ctx = new Ctx();
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
    };

    const playPhaseSound = (newPhase) => {
        if (newPhase === 'WORK') {
            // High Energy Beep (GO!)
            playTone(880, 'sine', 0.1);
            playTone(1760, 'sine', 0.2, 0.1);
        } else if (newPhase === 'REST') {
            // Lower Relaxed Beep
            playTone(440, 'triangle', 0.3);
        } else if (newPhase === 'CYCLE_REST') {
            // Distinct Deeper Sound
            playTone(330, 'triangle', 0.5);
            playTone(220, 'triangle', 0.5, 0.1);
        } else if (newPhase === 'DONE') {
            // Simple Victory
            playTone(523.25, 'sine', 0.1);
            playTone(659.25, 'sine', 0.1, 0.15);
            playTone(783.99, 'sine', 0.4, 0.3);
        } else if (newPhase === 'PREP') {
            // Standard beep for prep trigger? Or maybe silence until countdown
            // For 3-2-1 countdown logic, we'd need more complex logic.
            // Just playing a start beep.
            playTone(660, 'sine', 0.05);
        }
    };

    const playCountdownBeep = () => {
        playTone(880, 'square', 0.05);
    };

    // Timer Logic
    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                // Countdown Beeps (Last 3 seconds)
                if (timeLeft <= 3 && timeLeft > 0) {
                    // Only beep on the second mark?
                    // This runs every 1 second, so yes.
                    playCountdownBeep();
                }

                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            if (phase === 'PREP') {
                playPhaseSound('WORK');
                setPhase('WORK');
                setTotalTime(config.work);
                setTimeLeft(config.work);
            }
            else if (phase === 'WORK') {
                if (round < config.rounds) {
                    playPhaseSound('REST');
                    setPhase('REST');
                    setTotalTime(config.rest);
                    setTimeLeft(config.rest);
                } else {
                    if (currentCycle < config.cycles) {
                        playPhaseSound('CYCLE_REST');
                        setPhase('CYCLE_REST');
                        setTotalTime(config.cycleRest);
                        setTimeLeft(config.cycleRest);
                    } else {
                        playPhaseSound('DONE');
                        setIsActive(false);
                        setPhase('DONE');
                    }
                }
            } else if (phase === 'REST') {
                playPhaseSound('WORK');
                setRound((r) => r + 1);
                setPhase('WORK');
                setTotalTime(config.work);
                setTimeLeft(config.work);
            } else if (phase === 'CYCLE_REST') {
                playPhaseSound('WORK');
                setCurrentCycle((c) => c + 1);
                setRound(1);
                setPhase('WORK');
                setTotalTime(config.work);
                setTimeLeft(config.work);
            }
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, phase, round, currentCycle, config]);

    const toggleTimer = () => {
        if (phase === 'DONE') {
            resetTimer();
            // Wait for reset, but then start? Better to just let user hit start again or logic below
            // resetTimer sets isActive false.
        } else {
            if (!isActive) {
                // Starting
                // Check if we are at the very beginning (Initial State)
                const isInitial = phase === 'WORK' && round === 1 && currentCycle === 1 && timeLeft === config.work && timeLeft === totalTime;

                if (isInitial && config.prepare > 0) {
                    setPhase('PREP');
                    setTotalTime(config.prepare);
                    setTimeLeft(config.prepare);
                    playPhaseSound('PREP');
                }
                setIsActive(true);
                setShowSettings(false);
            } else {
                // Pausing
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

    // Helper formatting
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleConfigChange = (e) => {
        const { name, value } = e.target;
        let newVal;
        if (name === 'name') newVal = value;
        else if (name === 'volume') newVal = parseFloat(value);
        else newVal = (value === '' ? '' : parseInt(value));

        setConfig(prev => {
            const updated = { ...prev, [name]: newVal };
            return updated;
        });

        // Live update logic 
        if (!isActive) {
            const intVal = parseInt(value) || 0;
            if (name === 'work' && phase === 'WORK') {
                setTimeLeft(intVal);
                setTotalTime(intVal);
            }
        }
    };

    const saveRoutine = () => {
        const safeConfig = {
            ...config,
            work: config.work || 1,
            rest: config.rest || 0,
            rounds: config.rounds || 1,
            cycles: config.cycles || 1,
            cycleRest: config.cycleRest || 0,
            prepare: config.prepare || 0,
            volume: config.volume || 0.5
        };

        const newRoutine = { ...safeConfig, id: Date.now() };
        const updated = [...savedRoutines, newRoutine];
        setSavedRoutines(updated);
        localStorage.setItem('gymTimerRoutines', JSON.stringify(updated));
        alert('Routine Saved!');
    };

    const loadRoutine = (routine) => {
        setConfig({
            work: routine.work,
            rest: routine.rest,
            rounds: routine.rounds,
            cycles: routine.cycles || 1,
            cycleRest: routine.cycleRest || 60,
            prepare: routine.prepare || 10,
            volume: routine.volume !== undefined ? routine.volume : 0.5,
            name: routine.name
        });
        setIsActive(false);
        setPhase('WORK');
        setRound(1);
        setCurrentCycle(1);

        const newWork = routine.work;
        setTotalTime(newWork);
        setTimeLeft(newWork);
        setShowSettings(false);
    };

    const deleteRoutine = (id, e) => {
        e.stopPropagation();
        const updated = savedRoutines.filter(r => r.id !== id);
        setSavedRoutines(updated);
        localStorage.setItem('gymTimerRoutines', JSON.stringify(updated));
    };


    // Visual calculations
    const radius = 120;
    const circumference = 2 * Math.PI * radius;
    const progress = totalTime > 0 ? timeLeft / totalTime : 0;
    const strokeDashoffset = circumference * (1 - progress);

    // Dynamic Color
    const ringHue = Math.floor(progress * 140);
    const ringColor = `hsl(${ringHue}, 90%, 60%)`;
    const glowSize = timeLeft <= 5 ? '15px' : '8px';
    const dropShadow = `drop-shadow(0 0 ${glowSize} ${ringColor})`;

    // Dynamic class
    let modeClass = styles.workMode;
    if (phase === 'REST') modeClass = styles.restMode;
    if (phase === 'CYCLE_REST') modeClass = styles.cycleRestMode;
    if (phase === 'PREP') modeClass = styles.prepMode;

    return (
        <div className={`glass-panel ${styles.container} ${showSettings ? styles.editing : ''} ${modeClass}`}>

            <div className={styles.timerRing}>
                <svg
                    width="280"
                    height="280"
                    viewBox="0 0 280 280"
                    style={{ position: 'absolute', transform: 'rotate(-90deg)', zIndex: 0 }}
                >
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
                        <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={resetTimer}>
                            RESET
                        </button>
                        <button
                            className={styles.iconButton}
                            onClick={() => setShowSettings(!showSettings)}
                            title="Settings"
                        >
                            ⚙️
                        </button>
                    </>
                )}
            </div>

            {showSettings && (
                <div className={styles.settingsPanel}>

                    <div className={styles.inputGroup} style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '1rem' }}>
                        <label className={styles.inputLabel}>
                            Volume ({Math.round(config.volume * 100)}%)
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                name="volume"
                                value={config.volume}
                                onChange={handleConfigChange}
                                style={{ width: '100%', marginTop: '8px', accentColor: '#00f260' }}
                            />
                        </label>
                        <label className={styles.inputLabel}>
                            Prepare (s)
                            <input type="number" name="prepare" value={config.prepare} onChange={handleConfigChange} className={styles.input} />
                        </label>
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>
                            Work (sec)
                            <input type="number" name="work" value={config.work} onChange={handleConfigChange} className={styles.input} />
                        </label>
                        <label className={styles.inputLabel}>
                            Rest (sec)
                            <input type="number" name="rest" value={config.rest} onChange={handleConfigChange} className={styles.input} />
                        </label>
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>
                            Rounds
                            <input type="number" name="rounds" value={config.rounds} onChange={handleConfigChange} className={styles.input} />
                        </label>
                        <label className={styles.inputLabel}>
                            Cycles
                            <input type="number" name="cycles" value={config.cycles} onChange={handleConfigChange} className={styles.input} />
                        </label>
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>
                            Cycle Rest (s)
                            <input type="number" name="cycleRest" value={config.cycleRest} onChange={handleConfigChange} className={styles.input} />
                        </label>
                        <label className={styles.inputLabel}>
                            Routine Name
                            <input type="text" name="name" value={config.name} onChange={handleConfigChange} className={styles.input} placeholder="e.g. Legs" />
                        </label>
                    </div>

                    <button
                        className={`${styles.button} ${styles.buttonSecondary}`}
                        style={{ width: '100%', padding: '12px', fontSize: '0.9rem' }}
                        onClick={saveRoutine}
                    >
                        SAVE ROUTINE
                    </button>

                    {savedRoutines.length > 0 && (
                        <div className={styles.savedRoutines}>
                            <div className={styles.savedHeader}>Saved Routines</div>
                            {savedRoutines.map(routine => (
                                <div key={routine.id} className={styles.routineChip} onClick={() => loadRoutine(routine)}>
                                    <div>
                                        <div className={styles.routineName}>{routine.name}</div>
                                        <div className={styles.routineDetails}>
                                            {routine.rounds} x {routine.work}/{routine.rest}s • Vol {Math.round((routine.volume || 0.5) * 100)}%
                                        </div>
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
