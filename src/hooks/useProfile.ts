import { useState, useCallback } from 'react'
import type { CreatorProfile } from '../types'

const STORAGE_KEY = 'rakkan_profiles'
const ACTIVE_KEY = 'rakkan_active_profile_id'

function loadProfiles(): CreatorProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CreatorProfile[]) : []
  } catch {
    return []
  }
}

function saveProfiles(profiles: CreatorProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useProfile() {
  const [profiles, setProfiles] = useState<CreatorProfile[]>(loadProfiles)
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_KEY),
  )

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null

  const saveProfile = useCallback((draft: Omit<CreatorProfile, 'id' | 'createdAt'>) => {
    const newProfile: CreatorProfile = {
      ...draft,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setProfiles((prev) => {
      const next = [...prev, newProfile]
      saveProfiles(next)
      return next
    })
    setActiveId(newProfile.id)
    localStorage.setItem(ACTIVE_KEY, newProfile.id)
    return newProfile
  }, [])

  const updateProfile = useCallback(
    (id: string, patch: Partial<Omit<CreatorProfile, 'id' | 'createdAt'>>) => {
      setProfiles((prev) => {
        const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
        saveProfiles(next)
        return next
      })
    },
    [],
  )

  const deleteProfile = useCallback(
    (id: string) => {
      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id)
        saveProfiles(next)
        return next
      })
      if (activeId === id) {
        setActiveId(null)
        localStorage.removeItem(ACTIVE_KEY)
      }
    },
    [activeId],
  )

  const selectProfile = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(ACTIVE_KEY, id)
  }, [])

  return {
    profiles,
    activeProfile,
    activeId,
    saveProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
  }
}
