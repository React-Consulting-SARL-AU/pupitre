import { useQuery } from "@tanstack/react-query"
import { useDashboardContext } from "@/hooks/use-dashboard-context"
import { devicesQueryOptions, serversQueryOptions } from "@/lib/api/queries"
import {
  type OnboardingProgress,
  type OnboardingStep,
  onboardingComplete,
  onboardingProgress,
  onboardingSteps,
} from "@/lib/domain/onboarding"

export interface Onboarding {
  steps: OnboardingStep[]
  progress: OnboardingProgress
  complete: boolean
  ready: boolean
}

export function useOnboarding(): Onboarding {
  const { entitlement } = useDashboardContext()
  const devices = useQuery(devicesQueryOptions())
  const servers = useQuery(serversQueryOptions())
  const known = servers.data ?? null
  const steps = onboardingSteps({
    entitlement,
    devices: devices.data?.length ?? null,
    servers: known,
  })

  return {
    steps,
    progress: onboardingProgress(steps),
    complete: onboardingComplete(known),
    ready: !(devices.isPending || servers.isPending),
  }
}
