export interface SystemSample {
  ts: number
  cpuPct: number | null
  memUsed: number | null
  memTotal: number | null
  tempC: number | null
  powerW: number | null
}

export interface ContainerSample {
  id: string
  name: string
  icon: string | null
  cpuPct: number | null
  memUsed: number | null
}

export interface MetricsSource {
  sampleSystem: () => Promise<Omit<SystemSample, "ts">>
  sampleContainers: () => Promise<Array<ContainerSample>>
}
