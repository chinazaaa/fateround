import { notFound } from 'next/navigation'

/** /game without a room code — show the global 404 page. */
export default function GameIndexPage() {
  notFound()
}
