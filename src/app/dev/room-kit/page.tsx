'use client'

/**
 * Design-system Poll Room kit — visual preview / reference composition.
 *
 * NOT a shipped user route. It reconstructs the "09 Poll Room" artboards
 * (player · host · host+play) from the reusable kit so the components can be
 * verified in isolation before they're wired into the live poll views.
 */

import { useState } from 'react'
import { RoomVoiceBar } from '@/components/rooms/RoomVoiceBar'
import { HostControlBar } from '@/components/rooms/HostControlBar'
import {
  VoteSlots,
  SubjectPeople,
  SubjectAB,
  SubjectQuote,
  NumberPicker,
  RoundProgress,
  RoomNote,
  RevealTally,
  FinishedBlock,
  HostProgress,
  HostManageList,
  SpecBadge,
  PrToast,
  type VoteSlot,
} from '@/components/rooms/poll/primitives'

const SMK: VoteSlot[] = [
  { k: 'smash', badge: '🔥', l: 'Smash', c: '#ea580c', soft: '#fff1e8' },
  { k: 'marry', badge: '💍', l: 'Marry', c: '#b45309', soft: '#fef6e0' },
  { k: 'kill', badge: '💀', l: 'Kill', c: '#b91c1c', soft: '#fdeaea' },
]
const FACES = ['Kojo', 'Zara', 'Ife']
const VOICES = [
  { n: 'Ada', talking: true, muted: false, host: true },
  { n: 'Kojo', talking: false, muted: false },
  { n: 'Zara', talking: true, muted: true },
  { n: 'Ife', talking: false, muted: false },
]
const TALLY = [
  { label: 'Kojo', count: 4, pct: 80, color: '#ea580c' },
  { label: 'Zara', count: 3, pct: 60, color: '#b45309' },
  { label: 'Ife', count: 2, pct: 40, color: '#b91c1c' },
]

type PlayerState = 'waiting' | 'active' | 'locked' | 'reveal' | 'finished' | 'spectator'

function Btn({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <button className={`fr-btn ${primary ? 'fr-btn--primary' : 'fr-btn--secondary'} fr-btn--lg fr-btn--block`}>
      {children}
    </button>
  )
}

function VoteBody() {
  return (
    <>
      <p className="pr-eyebrow">Round 3 of 10</p>
      <h1 className="pr-h">Assign each friend</h1>
      <p className="pr-sub">One Smash, one Marry, one Kill — anonymous until the host reveals.</p>
      <SubjectPeople
        people={FACES.map((name) => ({
          name,
          chips: <VoteSlots slots={SMK} value={name === 'Kojo' ? 'smash' : undefined} />,
        }))}
      />
      <div className="pr-spacer" />
      <Btn primary>Lock in votes</Btn>
    </>
  )
}

function PlayerScreen({ state }: { state: PlayerState }) {
  return (
    <div className="fr-room fr-room-phone">
      <RoomVoiceBar code="F8K2QP" label="Smash Marry Kill" watching={2} participants={VOICES} name="Naza" />
      {state !== 'waiting' && state !== 'finished' && (
        <RoundProgress round={3} totalRounds={10} timeLabel="0:24" pct={40} />
      )}
      <div className="pr-body">
        {state === 'spectator' && <SpecBadge />}
        {state === 'waiting' && (
          <RoomNote
            pulse
            title="Waiting for the host to start…"
            desc="Hang tight — the first round is about to begin."
          />
        )}
        {state === 'active' && <VoteBody />}
        {state === 'spectator' && <VoteBody />}
        {state === 'locked' && (
          <>
            <PrToast>✓ Vote locked in — results show when the round ends</PrToast>
            <div className="pr-spacer" />
            <RoomNote pulse title="Waiting for others…" desc="3 of 5 have voted." />
          </>
        )}
        {state === 'reveal' && (
          <>
            <p className="pr-eyebrow">Round 3 · reveal</p>
            <h1 className="pr-h">Most Smashed</h1>
            <RevealTally rows={TALLY} />
            <div className="pr-spacer" />
            <Btn>Waiting for host to continue…</Btn>
          </>
        )}
        {state === 'finished' && (
          <>
            <div className="pr-spacer" />
            <FinishedBlock title="That's a wrap!" winner="Kojo" subline="Most Smashed · 4 votes" />
            <div className="pr-spacer" />
            <Btn primary>Play again</Btn>
          </>
        )}
      </div>
    </div>
  )
}

function HostScreen({ hostplay }: { hostplay?: boolean }) {
  return (
    <div className="fr-room fr-room-phone">
      <RoomVoiceBar
        code="F8K2QP"
        label="Smash Marry Kill"
        watching={2}
        participants={VOICES}
        name="Ada"
        host
        hostBadge
      />
      <RoundProgress round={3} totalRounds={10} timeLabel="0:24" pct={40} />
      <div className="pr-body">
        {hostplay ? (
          <VoteBody />
        ) : (
          <>
            <HostProgress total={5} done={3} label="3 of 5 voted" />
            <SubjectPeople people={FACES.map((name) => ({ name }))} />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <HostManageList
                players={[
                  { name: 'Kojo', voted: true },
                  { name: 'Zara', voted: true },
                  { name: 'Ife', voted: false },
                  { name: 'Bem', spectator: true },
                ]}
                onKick={() => {}}
              />
            </div>
            <div className="pr-spacer" />
            <Btn primary>Reveal round</Btn>
          </>
        )}
      </div>
      <HostControlBar mode={hostplay ? 'hostplay' : 'host'} players={FACES} settingsHref="#" onEndGame={() => {}} />
    </div>
  )
}

function VariantsRow() {
  return (
    <div className="fr-room fr-room-phone">
      <div className="pr-body" style={{ gap: 18 }}>
        <div>
          <p className="pr-eyebrow">Subject · A vs B</p>
          <SubjectAB
            a={{ tag: 'A', text: 'Fight 100 duck-sized horses', color: '#7c3aed', pct: '62%' }}
            b={{ tag: 'B', text: 'Fight 1 horse-sized duck', color: '#4f46e5', pct: '38%' }}
            selected="a"
          />
        </div>
        <div>
          <p className="pr-eyebrow">Subject · Quote</p>
          <SubjectQuote quote="I once cried at a car advert." by="Someone in this room" />
        </div>
        <div>
          <p className="pr-eyebrow">Subject · Pick a number</p>
          <NumberPicker max={10} taken={[3, 7]} value={5} />
        </div>
      </div>
    </div>
  )
}

const PLAYER_STATES: PlayerState[] = ['waiting', 'active', 'locked', 'reveal', 'finished', 'spectator']

export default function RoomKitPreview() {
  const [state, setState] = useState<PlayerState>('active')

  return (
    <div className="fr-site" style={{ minHeight: '100dvh', padding: '24px 16px' }}>
      <div className="mk-wrap" style={{ maxWidth: 1200 }}>
        <p className="label-caps">Design system · kit preview</p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 30,
            margin: '6px 0 4px',
            color: 'var(--text)',
          }}
        >
          Poll Room kit
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 20px' }}>
          Reference composition of the reusable room components (not a shipped route).
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {PLAYER_STATES.map((s) => (
            <button
              key={s}
              onClick={() => setState(s)}
              className={`fr-btn ${state === s ? 'fr-btn--primary' : 'fr-btn--secondary'} fr-btn--sm`}
            >
              {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Column title={`Player · ${state}`}>
            <PlayerScreen state={state} />
          </Column>
          <Column title="Host">
            <HostScreen />
          </Column>
          <Column title="Host + play">
            <HostScreen hostplay />
          </Column>
          <Column title="Subject variants">
            <VariantsRow />
          </Column>
        </div>
      </div>
    </div>
  )
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          font: '700 11px var(--font-sans)',
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          margin: '0 0 8px',
        }}
      >
        {title}
      </p>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
