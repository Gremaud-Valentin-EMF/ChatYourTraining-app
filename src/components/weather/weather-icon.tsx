import {
  Sun,
  Moon,
  CloudSun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
} from "lucide-react";

interface WeatherIconProps {
  code: string;
  className?: string;
}

export function WeatherIcon({ code, className = "w-5 h-5" }: WeatherIconProps) {
  const iconMap: Record<string, React.ReactNode> = {
    "01d": <Sun className={`${className} text-yellow-400`} />,
    "01n": <Moon className={`${className} text-gray-400`} />,
    "02d": <CloudSun className={`${className} text-gray-300`} />,
    "02n": <CloudSun className={`${className} text-gray-500`} />,
    "03d": <Cloud className={`${className} text-gray-400`} />,
    "03n": <Cloud className={`${className} text-gray-600`} />,
    "04d": <Cloud className={`${className} text-gray-500`} />,
    "04n": <Cloud className={`${className} text-gray-600`} />,
    "09d": <CloudRain className={`${className} text-blue-400`} />,
    "09n": <CloudRain className={`${className} text-blue-500`} />,
    "10d": <CloudRain className={`${className} text-blue-400`} />,
    "10n": <CloudRain className={`${className} text-blue-500`} />,
    "11d": <CloudLightning className={`${className} text-purple-400`} />,
    "11n": <CloudLightning className={`${className} text-purple-600`} />,
    "13d": <CloudSnow className={`${className} text-blue-200`} />,
    "13n": <CloudSnow className={`${className} text-blue-300`} />,
    "50d": <CloudFog className={`${className} text-gray-400`} />,
    "50n": <CloudFog className={`${className} text-gray-600`} />,
  };

  return iconMap[code] || <Cloud className={`${className} text-gray-400`} />;
}
