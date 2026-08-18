'use client'

import React, { useMemo, useState } from 'react'
import { TROLL_RUN_WORLDS, getWorldLevels } from '@/lib/troll-run-engine'
import { TrollRunCanvas } from './TrollRunCanvas'

export function TrollRunDevPlayground() {
  const [selectedWorld, setSelectedWorld] = useState('pits')
  const [selectedLevelIdx, setSelectedLevelIdx] = useState(0)
  const [muted, setMuted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'retro' | 'neon'>('dark')
  const [showTouch, setShowTouch] = useState(true)
  const [key, setKey] = useState(0) // increment to force reload

  const currentWorldConfig = useMemo(() => {
    return TROLL_RUN_WORLDS.find((w) => w.id === selectedWorld) ?? TROLL_RUN_WORLDS[0]
  }, [selectedWorld])

  const levels = useMemo(() => {
    return getWorldLevels(selectedWorld)
  }, [selectedWorld])

  const [stats, setStats] = useState({
    levelIndex: 0,
    totalLevels: levels.length,
    levelId: levels[0]?.id ?? '',
    levelName: levels[0]?.name ?? '',
    world: selectedWorld,
    levelDeaths: 0,
    totalDeaths: 0,
    parTime: 5,
  })

  const [finishedModal, setFinishedModal] = useState<{
    totalTimeMs: number
    totalDeaths: number
  } | null>(null)

  const handleRestart = () => {
    setKey((k) => k + 1)
  }

  const handleWorldSelect = (worldId: string) => {
    setSelectedWorld(worldId)
    setSelectedLevelIdx(0)
    setKey((k) => k + 1)
    setFinishedModal(null)
  }

  const handleLevelSelect = (idx: number) => {
    setSelectedLevelIdx(idx)
    setKey((k) => k + 1)
    setFinishedModal(null)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-4 sm:p-8 font-sans">
      {/* Header */}
      <header className="w-full max-w-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{currentWorldConfig.icon}</span>
            <h1 className="text-2xl font-black tracking-tight text-white">Troll Run — Dev Playground</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {currentWorldConfig.name}: {currentWorldConfig.subtitle} (10 levels) · Controls: Arrow keys / WASD / Touch
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold hover:bg-slate-800 transition"
          >
            {muted ? '🔇 Muted' : '🔊 Sound On'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = theme === 'dark' ? 'retro' : theme === 'retro' ? 'neon' : 'dark'
              setTheme(next)
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold hover:bg-slate-800 transition capitalize"
          >
            🎨 {theme}
          </button>
          <button
            type="button"
            onClick={() => setShowTouch(!showTouch)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold hover:bg-slate-800 transition"
          >
            📱 {showTouch ? 'Touch On' : 'Touch Off'}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition"
          >
            🔄 Restart
          </button>
        </div>
      </header>

      {/* World Selection Tabs */}
      <div className="w-full max-w-2xl mb-4 flex flex-wrap gap-2">
        {TROLL_RUN_WORLDS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => handleWorldSelect(w.id)}
            className={`flex-1 min-w-[130px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
              selectedWorld === w.id
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <span>{w.icon}</span>
            <span>{w.name}</span>
          </button>
        ))}
      </div>

      {/* Level Selector Pills */}
      <div className="w-full max-w-2xl mb-6 bg-slate-900/80 border border-slate-800 p-2.5 rounded-2xl">
        <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider px-1 flex items-center justify-between">
          <span>Jump to Level in {currentWorldConfig.name}</span>
          <span className="text-amber-400 font-mono">
            {selectedLevelIdx + 1} / {levels.length}
          </span>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
          {levels.map((lvl, idx) => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => handleLevelSelect(idx)}
              className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                selectedLevelIdx === idx
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400 font-black'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Main Game Canvas */}
      <div className="relative w-full max-w-2xl flex flex-col items-center">
        <TrollRunCanvas
          key={`${selectedWorld}-${key}-${selectedLevelIdx}`}
          levels={levels}
          initialLevelIndex={selectedLevelIdx}
          theme={theme}
          muted={muted}
          showTouchControls={showTouch}
          onStatsChange={(newStats) => {
            setStats(newStats)
            setSelectedLevelIdx(newStats.levelIndex)
          }}
          onDeath={(lvlId) => {
            if (typeof window !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([40, 60, 40])
              } catch {
                // ignore vibrate error
              }
            }
          }}
          onLevelClear={(lvlId, timeMs) => {
            if (typeof window !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([50, 50, 100])
              } catch {
                // ignore vibrate error
              }
            }
          }}
          onAllLevelsCleared={(totalTimeMs, totalDeaths) => {
            setFinishedModal({ totalTimeMs, totalDeaths })
          }}
        />

        {/* Victory Modal */}
        {finishedModal && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 text-center z-50 border border-amber-500/50">
            <span className="text-6xl mb-3 animate-bounce">🏆</span>
            <h2 className="text-3xl font-black text-white">World Cleared!</h2>
            <p className="text-slate-300 text-sm mt-1 mb-4">
              You conquered all 10 levels of <strong>{currentWorldConfig.name}</strong>!
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 w-full max-w-xs mb-5 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Time:</span>
                <span className="font-bold text-amber-400">{(finishedModal.totalTimeMs / 1000).toFixed(2)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Deaths:</span>
                <span className="font-bold text-rose-400">{finishedModal.totalDeaths}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRestart}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg shadow-amber-500/30"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Level Info Footer */}
      <footer className="w-full max-w-2xl mt-6 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-400">
        <div>
          <span>Current: </span>
          <strong className="text-white">
            Level {stats.levelIndex + 1}: {stats.levelName}
          </strong>
        </div>
        <div className="flex items-center gap-4">
          <div>
            Par: <span className="font-mono text-amber-400 font-bold">{stats.parTime}s</span>
          </div>
          <div>
            Deaths: <span className="font-mono text-rose-400 font-bold">{stats.totalDeaths}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
