"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ImageIcon, Save, UserPlus, Copy, Trash2, Check } from "lucide-react"

type InvitedPlayer = {
  id: string
  email: string
  name: string
  code: string
  createdAt: string
}

export function PlayerAccessPanel() {
  const [title, setTitle] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingSaved, setBrandingSaved] = useState(false)

  const [players, setPlayers] = useState<InvitedPlayer[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [emailsInput, setEmailsInput] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generateMessage, setGenerateMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/session-settings")
      .then((res) => res.json())
      .then((data) => {
        setTitle(data.title || "")
        setLogoUrl(data.logoUrl || "")
      })
      .catch(() => {})

    fetch("/api/admin/invited-players")
      .then((res) => res.json())
      .then((data) => setPlayers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingPlayers(false))
  }, [])

  const handleSaveBranding = async () => {
    setSavingBranding(true)
    setBrandingSaved(false)
    try {
      const res = await fetch("/api/admin/session-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, logoUrl }),
      })
      if (res.ok) {
        setBrandingSaved(true)
        setTimeout(() => setBrandingSaved(false), 2000)
      }
    } finally {
      setSavingBranding(false)
    }
  }

  const handleGenerateCodes = async () => {
    if (!emailsInput.trim()) return
    setGenerating(true)
    setGenerateMessage("")
    try {
      const res = await fetch("/api/admin/invited-players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailsInput }),
      })
      const data = await res.json()
      if (res.ok) {
        setPlayers(data.players)
        setEmailsInput("")
        setGenerateMessage(
          `Added ${data.created} new code${data.created === 1 ? "" : "s"}` +
            (data.skipped > 0 ? ` (${data.skipped} already had one)` : "")
        )
      } else {
        setGenerateMessage(data.error || "Could not generate codes")
      }
    } catch {
      setGenerateMessage("Could not reach the server")
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (player: InvitedPlayer) => {
    if (!confirm(`Revoke access for ${player.email}? They won't be able to sign in with their code anymore.`)) return
    const res = await fetch(`/api/admin/invited-players?id=${player.id}`, { method: "DELETE" })
    if (res.ok) {
      setPlayers((prev) => prev.filter((p) => p.id !== player.id))
    }
  }

  const handleCopy = async (player: InvitedPlayer) => {
    try {
      await navigator.clipboard.writeText(player.code)
      setCopiedId(player.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Clipboard API unavailable — the code is still visible in the table to copy by hand.
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Session Branding
          </CardTitle>
          <CardDescription>
            Shown on the welcome screen before anyone signs in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Session title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Secure Code Review Training"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Logo image URL</label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              maxLength={2000}
            />
          </div>
          <Button onClick={handleSaveBranding} disabled={savingBranding}>
            <Save className="h-4 w-4 mr-2" />
            {savingBranding ? "Saving..." : brandingSaved ? "Saved" : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Codes
          </CardTitle>
          <CardDescription>
            Paste one email per line. Each gets a unique code — share it with that person so
            they can sign in. Their display name is derived automatically from their email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={emailsInput}
            onChange={(e) => setEmailsInput(e.target.value)}
            placeholder={"musab.khan@beyond.one\naaniq.tejani@beyond.one"}
            rows={4}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleGenerateCodes} disabled={generating || !emailsInput.trim()}>
              {generating ? "Generating..." : "Generate Codes"}
            </Button>
            {generateMessage && <span className="text-sm text-gray-600">{generateMessage}</span>}
          </div>

          <div className="mt-4 border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {loadingPlayers ? (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-400 py-6">Loading...</td>
                  </tr>
                ) : players.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-400 py-6">No invited players yet.</td>
                  </tr>
                ) : (
                  players.map((player) => (
                    <tr key={player.id} className="border-t">
                      <td className="px-3 py-2">{player.email}</td>
                      <td className="px-3 py-2">{player.name}</td>
                      <td className="px-3 py-2 font-mono tracking-wider">{player.code}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleCopy(player)} title="Copy code">
                            {copiedId === player.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(player)} title="Revoke">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
