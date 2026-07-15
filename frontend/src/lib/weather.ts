/** Pure helpers for WeatherStrip + elevation display. */

export interface DayWeather {
  icon: string
  label: string
}

/** WMO weather interpretation codes (Open-Meteo `weather_code`), grouped. */
export function wmoToWeather(code: number): DayWeather {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code === 1) return { icon: '🌤️', label: 'Mostly clear' }
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Overcast' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if ((code >= 61 && code <= 67) || code === 80 || code === 81 || code === 82)
    return { icon: '🌧️', label: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: '🌨️', label: 'Snow' }
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '☁️', label: 'Clouds' }
}

export function metersToFeet(m: number): number {
  return m * 3.28084
}

export function formatElevationFt(m: number | null | undefined): string | null {
  if (m == null) return null
  return `${Math.round(metersToFeet(m)).toLocaleString('en-US')} ft`
}
