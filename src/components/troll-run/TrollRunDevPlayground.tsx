'use client'

import React, { useState } from 'react'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
import { TrollRunCanvas } from './TrollRunCanvas'

export function TrollRunDevPlayground() {
  const [selectedLevelIdx, setSelectedLevelIdx] = useState(0)
  const [muted, setMuted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'retro' | 'neon'>('dark')
  const [showTouch, setShowTouch] = useState(true)
  const [key, setKey] = useState(0) // increment to force reload
  const [stats, setStats] = useState({
    levelIndex: 0,
    totalLevels: WORLD_1_LEVELS.length,
    levelId: WORLD_1_LEVELS[0]?.id ?? '',
    levelName: WORLD_1_LEVELS[0]?.name ?? '',
    world: 'pits',
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
            <span className="text-2xl">😈</span>
            <h1 className="text-2xl font-black tracking-tight text-white">Troll Run — Dev Playground</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            World 1: Pits & Collapses (10 levels) · Use WASD / Arrow Keys to play
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
            onClick={() => setShowTouch(!showTouch)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold hover:bg-slate-800 transition"
          >
            {showTouch ? '📱 Touch On' : '⌨️ Touch Off'}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition shadow-sm"
          >
            🔄 Restart Level
          </button>
        </div>
      </header>

      {/* Level Selector & Info Strip */}
      <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="level-select" className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
            Level:
          </label>
          <select
            id="level-select"
            value={selectedLevelIdx}
            onChange={(e) => handleLevelSelect(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {WORLD_1_LEVELS.map((lvl, idx) => (
              <option key={lvl.id} value={idx}>
                {idx + 1}. {lvl.name} ({lvl.id})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <span className="text-slate-400">Deaths (Level / Total): </span>
            <span className="font-mono font-bold text-rose-400">
              {stats.levelDeaths} / {stats.totalDeaths}
            </span>
          </div>
          <div>
            <span className="text-slate-400">Par Time: </span>
            <span className="font-mono font-bold text-amber-400">{stats.parTime}s</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Theme:</span>
          {(['dark', 'retro', 'neon'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize border ${
                theme === t
                  ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                  : 'border-slate-800 bg-slate-800 text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas View */}
      <TrollRunCanvas
        key={key}
        levels={WORLD_1_LEVELS}
        initialLevelIndex={selectedLevelIdx}
        muted={muted}
        theme={theme}
        showTouchControls={showTouch}
        onStatsChange={(newStats) => {
          setStats(newStats)
          setSelectedLevelIdx(newStats.levelIndex)
        }}
        onAllLevelsCleared={(totalTimeMs, totalDeaths) => {
          setFinishedModal({ totalTimeMs, totalDeaths })
        }}
      />

      {/* Completion Modal */}
      {finishedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="text-4xl">🏆</div>
            <h2 className="text-2xl font-black text-white">World 1 Conquered!</h2>
            <p className="text-xs text-slate-300">You survived all 10 troll levels of World 1: Pits & Collapses!</p>
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Clear Time:</span>
                <span className="text-amber-400 font-bold">{(finishedModal.totalTimeMs / 1000).toFixed(2)}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Deaths:</span>
                <span className="text-rose-400 font-bold">{finishedModal.totalDeaths}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFinishedModal(null)
                handleLevelSelect(0)
              }}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 transition"
            >
              Play Again from Level 1
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <footer className="mt-8 text-center text-xs text-slate-500 max-w-lg space-y-1">
        <p>
          🎮 Keyboard: <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300">A</kbd> /{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300">D</kbd> or Arrow Keys to move ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300">W</kbd> /{' '}
          <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300">Space</kbd> to jump
        </p>
        <p>💡 Tip: Look out for fake floors, runaway doors, and trap coins!</p>
      </footer>
    </div>
  )
}
