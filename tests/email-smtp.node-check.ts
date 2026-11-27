// Tests the Gmail SMTP client against a local fake SMTP server. No network
// access and no real credentials are used. Run with: npm run test:node
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, connect, type Server } from 'node:net'

import { buildMessage, gmailConfig, sendEmail } from '../src/lib/email.server'

type Received = { user: string; pass: string; from: string; to: string; data: string }

function fakeSmtp(password: string, received: Received[]) {
  const server: Server = createServer((socket) => {
    socket.setEncoding('utf8')
    socket.write('220 fake.test ESMTP\r\n')
    let buffer = ''
    let state: 'cmd' | 'user' | 'pass' | 'data' = 'cmd'
    let current: Received = { user: '', pass: '', from: '', to: '', data: '' }
    let dataLines: string[] = []
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let end = buffer.indexOf('\r\n')
      while (end !== -1) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        end = buffer.indexOf('\r\n')
        if (state === 'data') {
          if (line === '.') {
            current.data = dataLines.join('\r\n')
            received.push(current)
            state = 'cmd'
            socket.write('250 2.0.0 queued\r\n')
          } else {
            dataLines.push(line.startsWith('..') ? line.slice(1) : line)
          }
          continue
        }
        if (state === 'user') {
          current.user = Buffer.from(line, 'base64').toString()
          state = 'pass'
          socket.write('334 UGFzc3dvcmQ6\r\n')
          continue
        }
        if (state === 'pass') {
          current.pass = Buffer.from(line, 'base64').toString()
          state = 'cmd'
          socket.write(current.pass === password ? '235 2.7.0 accepted\r\n' : '535 5.7.8 bad credentials\r\n')
          continue
        }
        if (line.startsWith('EHLO')) socket.write('250-fake.test\r\n250 AUTH LOGIN\r\n')
        else if (line === 'AUTH LOGIN') { state = 'user'; socket.write('334 VXNlcm5hbWU6\r\n') }
        else if (line.startsWith('MAIL FROM:')) { current.from = line.slice(10); socket.write('250 ok\r\n') }
        else if (line.startsWith('RCPT TO:')) { current.to = line.slice(8); socket.write('250 ok\r\n') }
        else if (line === 'DATA') { state = 'data'; dataLines = []; socket.write('354 go ahead\r\n') }
        else if (line === 'QUIT') { socket.write('221 bye\r\n'); socket.end() }
        else socket.write('500 unknown\r\n')
      }
    })
    socket.on('error', () => undefined)
  })
  return server
}

const ENV_KEYS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'] as const
const saved: Record<string, string | undefined> = {}
let server: Server
let port = 0
const received: Received[] = []
let openCalls = 0

before(async () => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  server = fakeSmtp('test-app-password-1234', received)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  port = (server.address() as { port: number }).port
})

after(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const plainOpen = () => {
  openCalls += 1
  return connect(port, '127.0.0.1')
}

describe('gmailConfig', () => {
  it('is null unless both values are set', () => {
    assert.equal(gmailConfig({}), null)
    assert.equal(gmailConfig({ GMAIL_USER: 'a@gmail.com' }), null)
    assert.equal(gmailConfig({ GMAIL_APP_PASSWORD: 'x' }), null)
    assert.equal(gmailConfig({ GMAIL_USER: '  ', GMAIL_APP_PASSWORD: 'x' }), null)
  })

  it('removes spaces Google adds to app passwords', () => {
    assert.deepEqual(
      gmailConfig({ GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }),
      { user: 'me@gmail.com', pass: 'abcdefghijklmnop' },
    )
  })
})

describe('buildMessage', () => {
  it('encodes non-ASCII subjects and dot-stuffs body lines', () => {
    const text = buildMessage('me@gmail.com', 'b@example.com', {
      subject: 'Refund — done',
      text: 'first\n.hidden line',
    }, new Date('2026-11-27T00:00:00Z'))
    assert.match(text, /Subject: =\?UTF-8\?B\?/)
    assert.match(text, /\r\n\r\nfirst\r\n\.\.hidden line\r\n$/)
  })
})

describe('sendEmail', () => {
  it('is skipped and makes no connection when not configured', async () => {
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
    const before = openCalls
    const result = await sendEmail('b@example.com', { subject: 's', text: 't' }, { open: plainOpen })
    assert.equal(result, 'skipped')
    assert.equal(openCalls, before)
  })

  it('rejects an invalid recipient before connecting', async () => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password-1234'
    const before = openCalls
    await assert.rejects(
      sendEmail('bad address\r\nBcc: x@y.com', { subject: 's', text: 't' }, { open: plainOpen }),
      /not valid/,
    )
    assert.equal(openCalls, before)
  })

  it('reports sent only after the server accepts the message', async () => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'test-app-password-1234'
    const result = await sendEmail(
      'buyer@example.com',
      { subject: 'Bid confirmed', text: 'Thanks.\n.Dotted line' },
      { open: plainOpen },
    )
    assert.equal(result, 'sent')
    const last = received[received.length - 1]
    assert.equal(last.user, 'sender@gmail.com')
    assert.equal(last.pass, 'test-app-password-1234')
    assert.equal(last.from, '<sender@gmail.com>')
    assert.equal(last.to, '<buyer@example.com>')
    assert.match(last.data, /Subject: Bid confirmed/)
    assert.match(last.data, /Thanks\.\r\n\.Dotted line/)
  })

  it('fails without claiming success when the login is rejected', async () => {
    process.env.GMAIL_USER = 'sender@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'wrong-password'
    const before = received.length
    await assert.rejects(
      sendEmail('buyer@example.com', { subject: 's', text: 't' }, { open: plainOpen }),
      (error: Error) => {
        assert.match(error.message, /Gmail rejected the login/)
        assert.doesNotMatch(error.message, /wrong-password/)
        return true
      },
    )
    assert.equal(received.length, before)
  })
})
