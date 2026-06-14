import { Suspense } from 'react'
import AdminLoginForm from './AdminLoginForm'

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="page-wrap flex min-h-screen items-center justify-center text-muted">Loading…</div>}>
      <AdminLoginForm />
    </Suspense>
  )
}
