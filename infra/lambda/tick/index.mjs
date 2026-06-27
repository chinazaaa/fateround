import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

// Invoked on a schedule by EventBridge. Fetches the shared CRON_SECRET from SSM
// at runtime (not a plaintext env var) and POSTs to the app's freeze-recovery
// endpoint so a match can't hang if every client disconnects. The endpoint is
// idempotent and only acts on sessions already past their deadline.
const ssm = new SSMClient({})

export const handler = async () => {
  const url = process.env.TICK_URL
  const param = process.env.CRON_SECRET_PARAM
  if (!url || !param) {
    throw new Error('TICK_URL and CRON_SECRET_PARAM must be set')
  }

  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: param, WithDecryption: true }))
  const secret = Parameter?.Value
  if (!secret) {
    throw new Error('CRON_SECRET parameter is empty')
  }

  const res = await fetch(url, {
    method: 'POST',
    // Fail loudly on a redirect (e.g. an HTTP->HTTPS misconfig) rather than
    // silently downgrading the POST to a GET.
    redirect: 'error',
    headers: { authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log(`tick -> ${res.status} ${body}`)

  if (!res.ok) {
    throw new Error(`tick failed: ${res.status}`)
  }
  return { ok: true, status: res.status }
}
