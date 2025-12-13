# utils/weather_service.py
import os
import requests
from datetime import datetime, timedelta
import pytz
from typing import Dict, List, Optional, Tuple
import time
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass
class WeatherData:
    temperature: float
    wind_speed: float
    wind_direction: float
    wave_height: float
    precipitation: float
    visibility: float
    condition: str  # calm, moderate, stormy, etc.
    timestamp: datetime

class WeatherService:
    def __init__(self):
        # Using OpenWeatherMap API (free tier)
        self.api_key = os.getenv('OPENWEATHER_API_KEY', 'your_api_key_here')
        self.base_url = "https://api.openweathermap.org/data/2.5"
        
        # Alternative: NOAA API (free, no key needed but limited)
        self.noaa_base_url = "https://api.weather.gov"
        
        # Cache weather data to avoid too many API calls
        self.weather_cache = {}
        self.cache_duration = 3600  # 1 hour in seconds
    
    def get_marine_weather(self, lat: float, lon: float) -> Optional[WeatherData]:
        """Get current marine weather for a location"""
        cache_key = f"{lat}_{lon}_{datetime.now().strftime('%Y%m%d%H')}"
        
        # Check cache first
        if cache_key in self.weather_cache:
            cached_time, data = self.weather_cache[cache_key]
            if time.time() - cached_time < self.cache_duration:
                return data
        
        try:
            # Try OpenWeatherMap first
            url = f"{self.base_url}/weather"
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'units': 'metric'
            }
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract marine-relevant data
                weather_data = WeatherData(
                    temperature=data['main']['temp'],
                    wind_speed=data['wind']['speed'] * 3.6,  # Convert m/s to km/h
                    wind_direction=data['wind'].get('deg', 0),
                    wave_height=self._estimate_wave_height(data['wind']['speed']),
                    precipitation=data.get('rain', {}).get('1h', 0) or 
                                 data.get('snow', {}).get('1h', 0),
                    visibility=data.get('visibility', 10000) / 1000,  # Convert to km
                    condition=self._determine_condition(data),
                    timestamp=datetime.fromtimestamp(data['dt'])
                )
                
                # Cache the result
                self.weather_cache[cache_key] = (time.time(), weather_data)
                return weather_data
                
        except Exception as e:
            print(f"Error fetching weather data: {e}")
        
        return None
    
    def get_weather_forecast(self, lat: float, lon: float, hours_ahead: int = 48) -> List[WeatherData]:
        """Get weather forecast for next N hours"""
        try:
            url = f"{self.base_url}/forecast"
            params = {
                'lat': lat,
                'lon': lon,
                'appid': self.api_key,
                'units': 'metric',
                'cnt': min(hours_ahead // 3, 40)  # 3-hour intervals
            }
            
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                forecasts = []
                
                for forecast in data['list']:
                    weather_data = WeatherData(
                        temperature=forecast['main']['temp'],
                        wind_speed=forecast['wind']['speed'] * 3.6,
                        wind_direction=forecast['wind'].get('deg', 0),
                        wave_height=self._estimate_wave_height(forecast['wind']['speed']),
                        precipitation=forecast.get('rain', {}).get('3h', 0) or 
                                     forecast.get('snow', {}).get('3h', 0),
                        visibility=forecast.get('visibility', 10000) / 1000,
                        condition=self._determine_condition(forecast),
                        timestamp=datetime.fromtimestamp(forecast['dt'])
                    )
                    forecasts.append(weather_data)
                
                return forecasts
                
        except Exception as e:
            print(f"Error fetching weather forecast: {e}")
        
        return []
    
    def get_route_weather_impact(self, route_coordinates: List[Tuple[float, float]]) -> Dict:
        """Calculate weather impact along a route"""
        weather_points = []
        total_impact = 0
        
        # Sample points along the route (every 100km)
        for i in range(0, len(route_coordinates), max(1, len(route_coordinates) // 10)):
            lat, lon = route_coordinates[i]
            weather = self.get_marine_weather(lat, lon)
            
            if weather:
                impact_score = self._calculate_impact_score(weather)
                weather_points.append({
                    'coordinates': (lat, lon),
                    'weather': weather,
                    'impact_score': impact_score
                })
                total_impact += impact_score
        
        avg_impact = total_impact / len(weather_points) if weather_points else 0
        
        return {
            'weather_points': weather_points,
            'average_impact': avg_impact,
            'overall_condition': self._impact_to_condition(avg_impact),
            'recommendation': self._get_recommendation(avg_impact)
        }
    
    def _estimate_wave_height(self, wind_speed_ms: float) -> float:
        """Estimate wave height based on wind speed (simplified)"""
        # Simple conversion: Beaufort scale approximation
        wind_speed_kmh = wind_speed_ms * 3.6
        
        if wind_speed_kmh < 20:
            return 0.5  # Calm
        elif wind_speed_kmh < 40:
            return 1.0  # Moderate
        elif wind_speed_kmh < 60:
            return 2.5  # Rough
        elif wind_speed_kmh < 80:
            return 4.0  # Very rough
        else:
            return 6.0  # High
    
    def _determine_condition(self, weather_data: Dict) -> str:
        """Determine sailing condition from weather data"""
        wind_speed = weather_data['wind']['speed'] * 3.6  # km/h
        precipitation = weather_data.get('rain', {}).get('1h', 0) or \
                       weather_data.get('snow', {}).get('1h', 0) or \
                       weather_data.get('rain', {}).get('3h', 0) / 3 or 0
        
        if wind_speed < 20 and precipitation < 2:
            return "calm"
        elif wind_speed < 40 and precipitation < 5:
            return "moderate"
        elif wind_speed < 60:
            return "rough"
        else:
            return "stormy"
    
    def _calculate_impact_score(self, weather: WeatherData) -> float:
        """Calculate weather impact score (0-10, higher = worse)"""
        score = 0
        
        # Wind impact
        if weather.wind_speed > 80:
            score += 4
        elif weather.wind_speed > 60:
            score += 3
        elif weather.wind_speed > 40:
            score += 2
        elif weather.wind_speed > 20:
            score += 1
        
        # Wave height impact
        if weather.wave_height > 4:
            score += 3
        elif weather.wave_height > 2.5:
            score += 2
        elif weather.wave_height > 1:
            score += 1
        
        # Precipitation impact
        if weather.precipitation > 10:
            score += 2
        elif weather.precipitation > 5:
            score += 1
        
        # Visibility impact
        if weather.visibility < 1:
            score += 2
        elif weather.visibility < 3:
            score += 1
        
        return min(score, 10)
    
    def _impact_to_condition(self, impact_score: float) -> str:
        """Convert impact score to human-readable condition"""
        if impact_score < 2:
            return "Excellent"
        elif impact_score < 4:
            return "Good"
        elif impact_score < 6:
            return "Moderate"
        elif impact_score < 8:
            return "Poor"
        else:
            return "Dangerous"
    
    def _get_recommendation(self, impact_score: float) -> str:
        """Get recommendation based on weather impact"""
        if impact_score < 2:
            return "Safe to proceed, optimal conditions"
        elif impact_score < 4:
            return "Proceed with caution, monitor conditions"
        elif impact_score < 6:
            return "Consider delaying, moderate risk"
        elif impact_score < 8:
            return "Recommend delaying, poor conditions"
        else:
            return "Do not proceed, dangerous conditions"
# Add Storm Glass API to your weather_service.py

class StormGlassWeatherService:
    def __init__(self):
        self.api_key = os.getenv('STORMGLASS_API_KEY')
        self.base_url = "https://api.stormglass.io/v2"
    
    def get_marine_weather(self, lat, lon):
        try:
            response = requests.get(
                f"{self.base_url}/weather/point",
                params={
                    'lat': lat,
                    'lng': lon,
                    'params': 'airTemperature,waterTemperature,windSpeed,windDirection,waveHeight,waveDirection,swellHeight,swellDirection,visibility'
                },
                headers={
                    'Authorization': self.api_key
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                # Process Storm Glass data
                return {
                    'air_temperature': data['hours'][0]['airTemperature']['sg'],
                    'water_temperature': data['hours'][0]['waterTemperature']['sg'],
                    'wind_speed': data['hours'][0]['windSpeed']['sg'] * 3.6,  # m/s to km/h
                    'wave_height': data['hours'][0]['waveHeight']['sg'],
                    'swell_height': data['hours'][0]['swellHeight']['sg'],
                    'visibility': data['hours'][0]['visibility']['sg'],
                    'source': 'stormglass'
                }
        except Exception as e:
            print(f"Storm Glass API error: {e}")
        
        return None
# Singleton instance
weather_service = WeatherService()

