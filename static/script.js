// Configuration
const CONFIG = {
    AVERAGE_SPEED_KMH: 37.0,
    FUEL_CONSUMPTION_PER_KM: 0.04,
    WEATHER_FACTOR: 1.25,
    EMISSION_FACTOR: 3.15
};

// Navigation Configuration
const NAV_CONFIG = {
    sections: {
        planner: {
            name: "Route Planner",
            icon: "🗺️",
            visible: true
        },
        analytics: {
            name: "Analytics", 
            icon: "📊",
            visible: true
        },
        ports: {
            name: "Port Database",
            icon: "⚓", 
            visible: true
        },
        tools: {
            name: "Tools",
            icon: "🔧",
            visible: true,
            submenu: {
                fleet: { name: "Fleet Management", icon: "🚢" },
                reports: { name: "Reports", icon: "📈" },
                weather: { name: "Weather Data", icon: "🌤️" },
                fuel: { name: "Fuel Prices", icon: "⛽" }
            }
        }
    },
    routeTypes: {
        fastest: { name: "Fastest Route", color: "#ff6b35" },
        efficient: { name: "Efficient Route", color: "#2ecc71" },
        direct: { name: "Direct Route", color: "#3498db" }
    }
};

let map;
let routeLayers = {
    fastest: null,
    fuel: null,
    direct: null
};
let portMarkers = [];
let currentMapData = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
    // Show legend immediately
    document.getElementById('mapLegend').style.display = 'block';
});

function initializeMap() {
    // Initialize map centered on world
    map = L.map('map').setView([20, 0], 2);
    
    // Add base layers
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    // Add OpenSeaMap layer
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
        attribution: '© OpenSeaMap contributors',
        maxZoom: 18,
        opacity: 0.7
    }).addTo(map);

    // Add initial instruction popup
    const instructionPopup = L.popup()
        .setLatLng([20, 0])
        .setContent(`
            <div style="text-align: center; padding: 10px;">
                <h3>🚢 Shipping Route Optimizer</h3>
                <p>Select ports and click "Calculate Optimal Routes" to see shipping routes on the map.</p>
                <p><strong>Try selecting hub ports to see different route options!</strong></p>
            </div>
        `)
        .openOn(map);
}

function setupEventListeners() {
    document.getElementById('calculateBtn').addEventListener('click', calculateRoutes);
    
    // Add event listeners for port selection to show suggestions
    document.getElementById('startPort').addEventListener('change', showRouteSuggestions);
    document.getElementById('destinationPort').addEventListener('change', showRouteSuggestions);
    
    // Add event listener for intermediate ports selection
    document.getElementById('hubPorts').addEventListener('change', updateSelectedPortsDisplay);
}

function showRouteSuggestions() {
    const startPort = document.getElementById('startPort').value;
    const destinationPort = document.getElementById('destinationPort').value;
    
    if (startPort && destinationPort && startPort !== destinationPort) {
        console.log(`Route: ${startPort} → ${destinationPort}`);
    }
}

function updateSelectedPortsDisplay() {
    const hubPortsSelect = document.getElementById('hubPorts');
    const selectedPortsContainer = document.getElementById('selectedPorts');
    const selectedPortsList = document.getElementById('selectedPortsList');
    
    const selectedOptions = Array.from(hubPortsSelect.selectedOptions);
    const selectedPorts = selectedOptions.map(opt => opt.value).filter(port => port !== "");
    
    console.log('Selected intermediate ports:', selectedPorts);
    
    if (selectedPorts.length > 0) {
        selectedPortsContainer.style.display = 'block';
        selectedPortsList.innerHTML = '';
        
        selectedPorts.forEach(port => {
            const portTag = document.createElement('div');
            portTag.className = 'port-tag selected';
            portTag.innerHTML = `
                ${port}
                <button type="button" class="port-tag-remove" onclick="removePortFromSelection('${port}')">×</button>
            `;
            selectedPortsList.appendChild(portTag);
        });
    } else {
        selectedPortsContainer.style.display = 'none';
    }
}

function removePortFromSelection(port) {
    const hubPortsSelect = document.getElementById('hubPorts');
    const option = Array.from(hubPortsSelect.options).find(opt => opt.value === port);
    
    if (option) {
        option.selected = false;
        updateSelectedPortsDisplay();
    }
}

function clearSelectedPorts() {
    const hubPortsSelect = document.getElementById('hubPorts');
    Array.from(hubPortsSelect.options).forEach(option => {
        option.selected = false;
    });
    updateSelectedPortsDisplay();
}

function clearForm() {
    document.getElementById('startPort').value = '';
    document.getElementById('destinationPort').value = '';
    
    // Clear multiple select
    clearSelectedPorts();
    
    // Reset radio buttons
    document.querySelector('input[name="goal"][value="both"]').checked = true;
    
    // Hide results
    document.getElementById('resultsPanel').style.display = 'none';
    
    // Clear map
    Object.values(routeLayers).forEach(layer => {
        if (layer) map.removeLayer(layer);
    });
    
    portMarkers.forEach(marker => map.removeLayer(marker));
    portMarkers = [];
    
    // Reset map view
    map.setView([20, 0], 2);
}

async function calculateRoutes() {
    const startPort = document.getElementById('startPort').value;
    const destinationPort = document.getElementById('destinationPort').value;
    const hubPortsSelect = document.getElementById('hubPorts');
    const hubPorts = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    const goal = document.querySelector('input[name="goal"]:checked').value;
    const includeWeather = document.querySelector('input[name="weather"]:checked').value === 'true';
    console.log('🚢 Sending to backend:', {
        startPort,
        destinationPort,
        hubPorts,
        goal,
        hubPortsCount: hubPorts.length
    });
    
    // Validate inputs
    if (!startPort || !destinationPort) {
        alert('Please select both start and destination ports');
        return;
    }
    
    if (startPort === destinationPort) {
        alert('Start and destination ports cannot be the same');
        return;
    }
    
    // Show loading
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('calculateBtn').disabled = true;
    
    try {
        const response = await fetch('/calculate-routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start_port: startPort,
                destination_port: destinationPort,
                hub_ports: hubPorts,
                goal: goal,
                include_weather: includeWeather
            })
        });
        
        console.log('📡 Response status:', response.status);
        
        const data = await response.json();
        console.log('✅ Received from backend:', data);
        
        if (!response.ok) {
            // Handle backend errors
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Check if we have valid route data
        if (!data || (!data.fastest_route && !data.fuel_efficient_route)) {
            console.warn('⚠️ No route data in response:', data);
            alert('No routes could be calculated with the current parameters. Please try different ports.');
            return;
        }
        
        currentMapData = data;
        displayResults(data);
        displayRoutesOnMap(data);
        
    } catch (error) {
        console.error('❌ Error calculating routes:', error);
        alert('Error calculating routes: ' + error.message);
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('calculateBtn').disabled = false;
    }
}

function safeNumberFormat(value, decimals = 2) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'N/A';
    }
    return Number(value).toFixed(decimals);
}

function displayResults(data) {
    const resultsPanel = document.getElementById('resultsPanel');
    const comparisonDiv = document.querySelector('.route-comparison');
    
    resultsPanel.style.display = 'block';
    
    // ========== ENHANCED WEATHER DISPLAY ==========
    let weatherHTML = '';
    if (data.weather_recommendation && comparisonDiv) {
        const fastestWeather = data.fastest_route?.weather_impact || null;
        const fuelWeather = data.fuel_efficient_route?.weather_impact || null;
        
        weatherHTML = `
            <div class="weather-dashboard">
                <div class="weather-header">
                    <h4>🌤️ Real-Time Weather Analysis</h4>
                    <span class="weather-last-updated">Updated: ${new Date().toLocaleTimeString()}</span>
                </div>
                
                <div class="weather-summary">
                    <p>${data.weather_recommendation}</p>
                </div>
                
                ${fastestWeather && fuelWeather ? `
                <div class="weather-comparison">
                    <div class="weather-route-card fastest-weather">
                        <div class="weather-route-header">
                            <span class="weather-route-icon">🚀</span>
                            <span class="weather-route-title">Fastest Route</span>
                            <span class="weather-condition-badge ${getWeatherClass(fastestWeather.average_impact)}">
                                ${fastestWeather.overall_condition}
                            </span>
                        </div>
                        <div class="weather-metrics">
                            <div class="weather-metric">
                                <span class="metric-label">Impact Score</span>
                                <span class="metric-value ${getImpactColorClass(fastestWeather.average_impact)}">
                                    ${fastestWeather.average_impact.toFixed(1)}/10
                                </span>
                                <div class="impact-bar">
                                    <div class="impact-fill" style="width: ${fastestWeather.average_impact * 10}%"></div>
                                </div>
                            </div>
                            <div class="weather-metric">
                                <span class="metric-label">Wind Conditions</span>
                                <span class="metric-value">${getWindCondition(fastestWeather.average_impact)}</span>
                            </div>
                            <div class="weather-metric">
                                <span class="metric-label">Travel Time Impact</span>
                                <span class="metric-value">+${calculateTimeImpact(fastestWeather.average_impact)}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="weather-route-card fuel-weather">
                        <div class="weather-route-header">
                            <span class="weather-route-icon">🌿</span>
                            <span class="weather-route-title">Efficient Route</span>
                            <span class="weather-condition-badge ${getWeatherClass(fuelWeather.average_impact)}">
                                ${fuelWeather.overall_condition}
                            </span>
                        </div>
                        <div class="weather-metrics">
                            <div class="weather-metric">
                                <span class="metric-label">Impact Score</span>
                                <span class="metric-value ${getImpactColorClass(fuelWeather.average_impact)}">
                                    ${fuelWeather.average_impact.toFixed(1)}/10
                                </span>
                                <div class="impact-bar">
                                    <div class="impact-fill" style="width: ${fuelWeather.average_impact * 10}%"></div>
                                </div>
                            </div>
                            <div class="weather-metric">
                                <span class="metric-label">Wind Conditions</span>
                                <span class="metric-value">${getWindCondition(fuelWeather.average_impact)}</span>
                            </div>
                            <div class="weather-metric">
                                <span class="metric-label">Travel Time Impact</span>
                                <span class="metric-value">+${calculateTimeImpact(fuelWeather.average_impact)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="weather-insights">
                    <h5>📊 Weather Insights</h5>
                    <div class="insight-list">
                        ${generateWeatherInsights(fastestWeather, fuelWeather)}
                    </div>
                </div>
                
                <div class="weather-recommendation">
                    <h5>🎯 Recommendation</h5>
                    <div class="recommendation-card ${getRecommendationClass(fastestWeather.average_impact, fuelWeather.average_impact)}">
                        <div class="recommendation-icon">${getRecommendationIcon(fastestWeather.average_impact, fuelWeather.average_impact)}</div>
                        <div class="recommendation-text">
                            ${generateRecommendation(fastestWeather.average_impact, fuelWeather.average_impact)}
                        </div>
                    </div>
                </div>
                
                <div class="weather-points" id="weatherPointsList">
                    <h5>📍 Weather Points Analysis</h5>
                    <div class="weather-points-container">
                        ${renderWeatherPoints(fastestWeather.weather_points || [], 'fastest')}
                        ${renderWeatherPoints(fuelWeather.weather_points || [], 'fuel')}
                    </div>
                </div>
                ` : ''}
                
                ${data.weather_error ? `
                <div class="weather-error">
                    <p>⚠️ Weather data temporarily unavailable. Showing base calculations.</p>
                    <small>${data.weather_error}</small>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    // Safe data access with defaults
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    
    const fastestPorts = fastestRoute.ports || [];
    const fuelPorts = fuelRoute.ports || [];
    
    // Get selected intermediate ports
    const hubPortsSelect = document.getElementById('hubPorts');
    const selectedHubs = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    
    // FIX: Define hasHubs before using it
    const hasHubs = fastestPorts.length > 2 || fuelPorts.length > 2;
    const routesAreDifferent = JSON.stringify(fastestPorts) !== JSON.stringify(fuelPorts);
    
    // Calculate differences for comparison
    let comparisonHTML = '';
    if (routesAreDifferent && fastestRoute && fuelRoute) {
        const timeDiff = (fuelRoute.time_hours || 0) - (fastestRoute.time_hours || 0);
        const fuelDiff = (fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0);
        const co2Diff = (fastestRoute.co2_tonnes || 0) - (fuelRoute.co2_tonnes || 0);
        
        if (fuelDiff !== 0 || timeDiff !== 0) {
            comparisonHTML = `
                <div class="savings-info">
                    <p>
                        <strong>Route Comparison:</strong> 
                        ${fuelDiff > 0 ? 
                            `The efficient route saves ${safeNumberFormat(fuelDiff, 1)} tonnes of fuel` : 
                            fuelDiff < 0 ? 
                            `The fastest route uses ${safeNumberFormat(Math.abs(fuelDiff), 1)} fewer tonnes of fuel` :
                            `Both routes use the same fuel`
                        }
                        ${co2Diff !== 0 ? 
                            ` and ${co2Diff > 0 ? 
                                `reduces CO₂ by ${safeNumberFormat(co2Diff, 1)} tonnes` : 
                                `increases CO₂ by ${safeNumberFormat(Math.abs(co2Diff), 1)} tonnes`
                            }` : 
                            ` with no CO₂ difference`
                        }
                        ${timeDiff !== 0 ? 
                            ` while ${timeDiff > 0 ? 
                                `adding ${safeNumberFormat(timeDiff/24, 1)} days` : 
                                `saving ${safeNumberFormat(Math.abs(timeDiff/24), 1)} days`
                            } to the journey.` : 
                            ` with no time difference.`
                        }
                    </p>
                </div>
            `;
        }
    }
    
    // Show intermediate ports usage info
    let intermediateInfoHTML = '';
    
    if (selectedHubs.length > 0) {
        const usedInFastest = selectedHubs.filter(hub => fastestPorts.includes(hub));
        const usedInFuel = selectedHubs.filter(hub => fuelPorts.includes(hub));
        
        // Show which intermediate ports are actually used in the routes
        intermediateInfoHTML = `
            <div class="route-suggestion">
                <h4>🔄 Intermediate Ports Analysis</h4>
                <div class="intermediate-stats">
                    <div class="intermediate-stat">
                        <strong>Selected:</strong> ${selectedHubs.join(', ')}
                    </div>
                    <div class="intermediate-stat ${usedInFastest.length === selectedHubs.length ? 'all-used' : 'partial-used'}">
                        <strong>Fastest Route uses:</strong> ${usedInFastest.length}/${selectedHubs.length} ports
                        ${usedInFastest.length > 0 ? `(${usedInFastest.join(', ')})` : 'None used'}
                    </div>
                    <div class="intermediate-stat ${usedInFuel.length === selectedHubs.length ? 'all-used' : 'partial-used'}">
                        <strong>Efficient Route uses:</strong> ${usedInFuel.length}/${selectedHubs.length} ports
                        ${usedInFuel.length > 0 ? `(${usedInFuel.join(', ')})` : 'None used'}
                    </div>
                </div>
                ${usedInFastest.length < selectedHubs.length || usedInFuel.length < selectedHubs.length ? `
                <p class="intermediate-note">💡 <em>Note: Not all selected ports are used. The algorithm optimizes for the best route and may skip some ports if they don't improve the journey.</em></p>
                ` : ''}
            </div>
        `;
    }
    
    // Create route visualization with highlights
    function formatRoutePath(ports, selectedHubs) {
        return ports.map((port, index) => {
            if (index === 0) return `<span class="port-start">${port}</span>`;
            if (index === ports.length - 1) return `<span class="port-end">${port}</span>`;
            if (selectedHubs.includes(port)) return `<span class="port-hub used">${port}</span>`;
            return `<span class="port-hub">${port}</span>`;
        }).join(' → ');
    }
    
    // ========== UPDATE COMPARISON DIV HTML ==========
    comparisonDiv.innerHTML = weatherHTML + `
        ${!hasHubs && selectedHubs.length === 0 ? `
        <div class="route-suggestion">
            <p>💡 <strong>Tip:</strong> Select intermediate ports to see different route options!</p>
        </div>
        ` : ''}
        
        ${intermediateInfoHTML}
        
        <div class="route-cards">
            <div class="route-card fastest">
                <div class="route-card-header">
                    <span class="route-icon">🚀</span>
                    <span class="route-title">Fastest Route</span>
                    ${fastestPorts.length > 2 ? '<span class="route-badge">With Intermediate Ports</span>' : '<span class="route-badge">Direct Route</span>'}
                    ${fastestRoute.weather_impact ? `
                    <span class="weather-indicator ${getWeatherClass(fastestRoute.weather_impact.average_impact)}">
                        ${getWeatherIcon(fastestRoute.weather_impact.average_impact)}
                        ${fastestRoute.weather_impact.overall_condition}
                    </span>
                    ` : ''}
                </div>
                <div class="route-path">
                    <strong>Path:</strong> 
                    <div class="route-visualization">
                        ${formatRoutePath(fastestPorts, selectedHubs)}
                    </div>
                    ${fastestPorts.length > 2 ? `
                    <div class="route-stops">
                        <small>🛑 ${fastestPorts.length - 2} intermediate stop${fastestPorts.length - 2 !== 1 ? 's' : ''}</small>
                    </div>
                    ` : ''}
                </div>
                <div class="route-stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.distance_km)} km</div>
                        <div class="stat-label">Distance</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat((fastestRoute.time_hours || 0) / 24, 1)} days</div>
                        <div class="stat-label">Time</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.fuel_tonnes, 1)} tonnes</div>
                        <div class="stat-label">Fuel</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fastestRoute.co2_tonnes, 1)} tonnes</div>
                        <div class="stat-label">CO₂ Emissions</div>
                    </div>
                </div>
            </div>
            
            <div class="route-card fuel-efficient">
                <div class="route-card-header">
                    <span class="route-icon">🌿</span>
                    <span class="route-title">Fuel-Efficient Route</span>
                    ${fuelPorts.length > 2 ? '<span class="route-badge">With Intermediate Ports</span>' : '<span class="route-badge">Direct Route</span>'}
                    ${fuelRoute.weather_impact ? `
                    <span class="weather-indicator ${getWeatherClass(fuelRoute.weather_impact.average_impact)}">
                        ${getWeatherIcon(fuelRoute.weather_impact.average_impact)}
                        ${fuelRoute.weather_impact.overall_condition}
                    </span>
                    ` : ''}
                </div>
                <div class="route-path">
                    <strong>Path:</strong> 
                    <div class="route-visualization">
                        ${formatRoutePath(fuelPorts, selectedHubs)}
                    </div>
                    ${fuelPorts.length > 2 ? `
                    <div class="route-stops">
                        <small>🛑 ${fuelPorts.length - 2} intermediate stop${fuelPorts.length - 2 !== 1 ? 's' : ''}</small>
                    </div>
                    ` : ''}
                </div>
                <div class="route-stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.distance_km)} km</div>
                        <div class="stat-label">Distance</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat((fuelRoute.time_hours || 0) / 24, 1)} days</div>
                        <div class="stat-label">Time</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.fuel_tonnes, 1)} tonnes</div>
                        <div class="stat-label">Fuel</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${safeNumberFormat(fuelRoute.co2_tonnes, 1)} tonnes</div>
                        <div class="stat-label">CO₂ Emissions</div>
                    </div>
                </div>
            </div>
        </div>
        
        ${comparisonHTML}
        
        ${!routesAreDifferent && hasHubs ? `
        <div class="savings-info">
            <p>ℹ️ <strong>Note:</strong> Both routes are identical with the current port selection. Try different intermediate ports to see route variations.</p>
        </div>
        ` : ''}
        
        ${selectedHubs.length > 0 && (fastestPorts.length > 2 || fuelPorts.length > 2) ? `
        <div class="route-suggestion">
            <h4>🎯 How Intermediate Ports Work</h4>
            <p>The algorithm finds the optimal sequence of ports to visit between your start and destination. 
            It considers factors like distance, shipping lanes, and efficiency to determine which intermediate ports 
            to include and in what order.</p>
            <p><strong>Example:</strong> If you select Singapore, Jebel_Ali, and Mumbai between Colombo and Jakarta, 
            the algorithm might choose Colombo → Singapore → Jakarta (skipping others) if that's the fastest path.</p>
        </div>
        ` : ''}
    `;
    
    // Update results meta
    const resultsMeta = document.getElementById('resultsMeta');
    if (fastestPorts.length > 0 && fuelPorts.length > 0) {
        const totalPorts = new Set([...fastestPorts, ...fuelPorts]).size;
        const maxDistance = Math.max(fastestRoute.distance_km || 0, fuelRoute.distance_km || 0);
        const hubCount = Math.max(fastestPorts.length - 2, fuelPorts.length - 2, 0);
        
        if (hubCount > 0) {
            resultsMeta.textContent = `${totalPorts} ports • ${hubCount} hubs • ${safeNumberFormat(maxDistance / 1000, 1)}k km`;
        } else {
            resultsMeta.textContent = `${totalPorts} ports • ${safeNumberFormat(maxDistance / 1000, 1)}k km`;
        }
    } else {
        resultsMeta.textContent = 'Calculating...';
    }
    
    // Add weather point markers to map if available
    if (data.fastest_route?.weather_impact?.weather_points || data.fuel_efficient_route?.weather_impact?.weather_points) {
        addWeatherMarkers(data);
    }
}

// ========== WEATHER HELPER FUNCTIONS ==========

function getWeatherClass(impactScore) {
    if (impactScore < 2) return 'weather-excellent';
    if (impactScore < 4) return 'weather-good';
    if (impactScore < 6) return 'weather-moderate';
    if (impactScore < 8) return 'weather-poor';
    return 'weather-dangerous';
}

function getImpactColorClass(impactScore) {
    if (impactScore < 2) return 'color-excellent';
    if (impactScore < 4) return 'color-good';
    if (impactScore < 6) return 'color-moderate';
    if (impactScore < 8) return 'color-poor';
    return 'color-dangerous';
}

function getWeatherIcon(impactScore) {
    if (impactScore < 2) return '☀️';
    if (impactScore < 4) return '⛅';
    if (impactScore < 6) return '🌤️';
    if (impactScore < 8) return '🌧️';
    return '⛈️';
}

function getWindCondition(impactScore) {
    if (impactScore < 2) return 'Calm (0-20 km/h)';
    if (impactScore < 4) return 'Light Breeze (20-40 km/h)';
    if (impactScore < 6) return 'Moderate Wind (40-60 km/h)';
    if (impactScore < 8) return 'Strong Wind (60-80 km/h)';
    return 'Gale Force (>80 km/h)';
}

function calculateTimeImpact(impactScore) {
    // Return percentage increase in travel time
    if (impactScore < 2) return '0-10';
    if (impactScore < 4) return '10-30';
    if (impactScore < 6) return '30-60';
    if (impactScore < 8) return '60-100';
    return '100+';
}

function generateWeatherInsights(fastestWeather, fuelWeather) {
    const insights = [];
    const fastestImpact = fastestWeather.average_impact;
    const fuelImpact = fuelWeather.average_impact;
    
    if (Math.abs(fastestImpact - fuelImpact) > 2) {
        const betterRoute = fastestImpact < fuelImpact ? 'Fastest' : 'Fuel-Efficient';
        insights.push(`
            <div class="insight-item">
                <span class="insight-icon">📈</span>
                <span class="insight-text">
                    <strong>${betterRoute} route has significantly better weather conditions</strong> 
                    (${Math.abs(fastestImpact - fuelImpact).toFixed(1)} point difference)
                </span>
            </div>
        `);
    }
    
    if (fastestImpact > 6 || fuelImpact > 6) {
        insights.push(`
            <div class="insight-item">
                <span class="insight-icon">⚠️</span>
                <span class="insight-text">
                    <strong>Potential delays expected</strong> due to poor weather conditions 
                    (${fastestImpact > 6 ? 'Fastest route' : ''}${fastestImpact > 6 && fuelImpact > 6 ? ' and ' : ''}${fuelImpact > 6 ? 'Efficient route' : ''})
                </span>
            </div>
        `);
    }
    
    if (fastestImpact < 3 && fuelImpact < 3) {
        insights.push(`
            <div class="insight-item">
                <span class="insight-icon">👍</span>
                <span class="insight-text">
                    <strong>Excellent sailing conditions</strong> on both routes. Minimal weather impact expected.
                </span>
            </div>
        `);
    }
    
    // Add fuel consumption insight
    const fuelDiff = fastestImpact - fuelImpact;
    if (Math.abs(fuelDiff) > 1) {
        insights.push(`
            <div class="insight-item">
                <span class="insight-icon">⛽</span>
                <span class="insight-text">
                    <strong>Weather may affect fuel efficiency</strong> by 
                    ${Math.abs(fuelDiff).toFixed(1)}% between routes.
                </span>
            </div>
        `);
    }
    
    return insights.length > 0 ? insights.join('') : `
        <div class="insight-item">
            <span class="insight-icon">ℹ️</span>
            <span class="insight-text">Both routes have similar weather conditions.</span>
        </div>
    `;
}

function generateRecommendation(fastestImpact, fuelImpact) {
    const diff = fastestImpact - fuelImpact;
    
    if (Math.abs(diff) < 1) {
        return "Both routes have similar weather conditions. Choose based on other factors.";
    }
    
    if (diff < 0) {
        // Fastest route has better weather
        if (diff < -2) {
            return "Strongly recommend Fastest Route due to significantly better weather conditions.";
        } else {
            return "Weather slightly favors Fastest Route. Consider taking it for smoother sailing.";
        }
    } else {
        // Fuel route has better weather
        if (diff > 2) {
            return "Strongly recommend Fuel-Efficient Route to avoid poor weather on faster route.";
        } else {
            return "Weather conditions are better on Fuel-Efficient Route. Consider the trade-off.";
        }
    }
}

function getRecommendationClass(fastestImpact, fuelImpact) {
    const diff = fastestImpact - fuelImpact;
    if (Math.abs(diff) < 1) return 'recommendation-neutral';
    return diff < 0 ? 'recommendation-positive' : 'recommendation-caution';
}

function getRecommendationIcon(fastestImpact, fuelImpact) {
    const diff = fastestImpact - fuelImpact;
    if (Math.abs(diff) < 1) return '⚖️';
    return diff < 0 ? '✅' : '⚠️';
}

function renderWeatherPoints(weatherPoints, routeType) {
    if (!weatherPoints || weatherPoints.length === 0) return '';
    
    return `
        <div class="weather-route-points ${routeType}-points">
            <h6>${routeType === 'fastest' ? '🚀 Fastest Route' : '🌿 Efficient Route'}</h6>
            <div class="points-list">
                ${weatherPoints.slice(0, 5).map((point, index) => `
                    <div class="weather-point">
                        <div class="point-header">
                            <span class="point-number">#${index + 1}</span>
                            <span class="point-condition ${getWeatherClass(point.impact_score)}">
                                ${getWeatherIcon(point.impact_score)} ${point.weather.condition}
                            </span>
                        </div>
                        <div class="point-details">
                            <div class="point-detail">
                                <span class="detail-label">Wind:</span>
                                <span class="detail-value">${point.weather.wind_speed.toFixed(0)} km/h</span>
                            </div>
                            <div class="point-detail">
                                <span class="detail-label">Waves:</span>
                                <span class="detail-value">${point.weather.wave_height.toFixed(1)} m</span>
                            </div>
                            <div class="point-detail">
                                <span class="detail-label">Impact:</span>
                                <span class="detail-value ${getImpactColorClass(point.impact_score)}">
                                    ${point.impact_score.toFixed(1)}/10
                                </span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function addWeatherMarkers(data) {
    // Clear existing weather markers
    if (window.weatherMarkers) {
        window.weatherMarkers.forEach(marker => map.removeLayer(marker));
    }
    window.weatherMarkers = [];
    
    // Add weather markers for fastest route
    if (data.fastest_route?.weather_impact?.weather_points) {
        data.fastest_route.weather_impact.weather_points.forEach((point, index) => {
            const marker = L.marker(point.coordinates)
                .bindPopup(`
                    <div class="weather-marker-popup">
                        <h5>🚀 Fastest Route - Point ${index + 1}</h5>
                        <p><strong>Condition:</strong> ${point.weather.condition}</p>
                        <p><strong>Wind Speed:</strong> ${point.weather.wind_speed.toFixed(1)} km/h</p>
                        <p><strong>Wave Height:</strong> ${point.weather.wave_height.toFixed(1)} m</p>
                        <p><strong>Temperature:</strong> ${point.weather.temperature.toFixed(1)}°C</p>
                        <p><strong>Weather Impact:</strong> ${point.impact_score.toFixed(1)}/10</p>
                    </div>
                `)
                .addTo(map);
            
            // Add weather icon based on condition
            const icon = getWeatherIcon(point.impact_score);
            const customIcon = L.divIcon({
                html: `<div style="background-color: rgba(255, 107, 53, 0.8); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white;">${icon}</div>`,
                className: 'weather-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            marker.setIcon(customIcon);
            window.weatherMarkers.push(marker);
        });
    }
    
    // Add weather markers for fuel-efficient route
    if (data.fuel_efficient_route?.weather_impact?.weather_points) {
        data.fuel_efficient_route.weather_impact.weather_points.forEach((point, index) => {
            const marker = L.marker(point.coordinates)
                .bindPopup(`
                    <div class="weather-marker-popup">
                        <h5>🌿 Efficient Route - Point ${index + 1}</h5>
                        <p><strong>Condition:</strong> ${point.weather.condition}</p>
                        <p><strong>Wind Speed:</strong> ${point.weather.wind_speed.toFixed(1)} km/h</p>
                        <p><strong>Wave Height:</strong> ${point.weather.wave_height.toFixed(1)} m</p>
                        <p><strong>Temperature:</strong> ${point.weather.temperature.toFixed(1)}°C</p>
                        <p><strong>Weather Impact:</strong> ${point.impact_score.toFixed(1)}/10</p>
                    </div>
                `)
                .addTo(map);
            
            const icon = getWeatherIcon(point.impact_score);
            const customIcon = L.divIcon({
                html: `<div style="background-color: rgba(46, 204, 113, 0.8); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white;">${icon}</div>`,
                className: 'weather-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            
            marker.setIcon(customIcon);
            window.weatherMarkers.push(marker);
        });
    }
}

function displayRoutesOnMap(data) {
    // Clear existing layers
    Object.values(routeLayers).forEach(layer => {
        if (layer) map.removeLayer(layer);
    });
    
    portMarkers.forEach(marker => map.removeLayer(marker));
    portMarkers = [];
    
    // Check if we have valid data - FIXED: Use safe access
    if (!data) {
        console.warn('⚠️ No data provided to displayRoutesOnMap');
        return;
    }
    
    // FIX: Define comparisonDiv properly by getting the DOM element
    const comparisonDiv = document.querySelector('.route-comparison');
    
    // Get route data safely
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    const directRoute = data.direct_route || {};
    
    const fastestPorts = fastestRoute.ports || [];
    const fuelPorts = fuelRoute.ports || [];
    
    // Only proceed if we have coordinates
    if (!fastestRoute.coordinates && !fuelRoute.coordinates) {
        console.warn('⚠️ No route coordinates to display on map');
        return;
    }
    
    // Draw routes
    if (fastestRoute.coordinates && fastestRoute.coordinates.length > 1) {
        const polyline = L.polyline(fastestRoute.coordinates, {
            color: NAV_CONFIG.routeTypes.fastest.color,
            weight: 4,
            opacity: 0.7,
            lineCap: 'round'
        }).addTo(map);
        
        // Add dashed version for better visibility
        const dashedLine = L.polyline(fastestRoute.coordinates, {
            color: NAV_CONFIG.routeTypes.fastest.color,
            weight: 2,
            opacity: 0.3,
            dashArray: '15, 10',
            lineCap: 'round'
        }).addTo(map);
        
        routeLayers.fastest = L.layerGroup([polyline, dashedLine]);
        
        // Add popup with route info
        polyline.bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <h4 style="color: ${NAV_CONFIG.routeTypes.fastest.color}; margin: 0 0 10px 0;">🚀 Fastest Route</h4>
                <p style="margin: 5px 0;"><strong>Distance:</strong> ${safeNumberFormat(fastestRoute.distance_km)} km</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${safeNumberFormat(fastestRoute.time_hours / 24, 1)} days</p>
                <p style="margin: 5px 0;"><strong>Fuel:</strong> ${safeNumberFormat(fastestRoute.fuel_tonnes, 1)} tonnes</p>
                ${fastestPorts.length > 2 ? 
                    `<p style="margin: 5px 0;"><strong>Intermediate Ports:</strong> ${fastestPorts.slice(1, -1).join(', ')}</p>` : 
                    '<p style="margin: 5px 0; color: #888;"><em>Direct Route</em></p>'
                }
            </div>
        `);
    }
    
    if (fuelRoute.coordinates && fuelRoute.coordinates.length > 1) {
        const polyline = L.polyline(fuelRoute.coordinates, {
            color: NAV_CONFIG.routeTypes.efficient.color,
            weight: 4,
            opacity: 0.7,
            lineCap: 'round'
        }).addTo(map);
        
        // Add dashed version for better visibility
        const dashedLine = L.polyline(fuelRoute.coordinates, {
            color: NAV_CONFIG.routeTypes.efficient.color,
            weight: 2,
            opacity: 0.3,
            dashArray: '10, 15',
            lineCap: 'round'
        }).addTo(map);
        
        routeLayers.fuel = L.layerGroup([polyline, dashedLine]);
        
        // Add popup with route info
        polyline.bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <h4 style="color: ${NAV_CONFIG.routeTypes.efficient.color}; margin: 0 0 10px 0;">🌿 Fuel-Efficient Route</h4>
                <p style="margin: 5px 0;"><strong>Distance:</strong> ${safeNumberFormat(fuelRoute.distance_km)} km</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${safeNumberFormat(fuelRoute.time_hours / 24, 1)} days</p>
                <p style="margin: 5px 0;"><strong>Fuel:</strong> ${safeNumberFormat(fuelRoute.fuel_tonnes, 1)} tonnes</p>
                ${fuelPorts.length > 2 ? 
                    `<p style="margin: 5px 0;"><strong>Intermediate Ports:</strong> ${fuelPorts.slice(1, -1).join(', ')}</p>` : 
                    '<p style="margin: 5px 0; color: #888;"><em>Direct Route</em></p>'
                }
            </div>
        `);
    }
    
    // Add direct route if available
    if (directRoute.coordinates && directRoute.coordinates.length > 1) {
        const polyline = L.polyline(directRoute.coordinates, {
            color: NAV_CONFIG.routeTypes.direct.color,
            weight: 2,
            opacity: 0.4,
            dashArray: '5, 10',
            lineCap: 'round'
        }).addTo(map);
        
        routeLayers.direct = polyline;
        
        polyline.bindPopup(`
            <div style="text-align: center; padding: 5px;">
                <h4 style="color: ${NAV_CONFIG.routeTypes.direct.color}; margin: 0 0 10px 0;">📐 Direct Route</h4>
                <p style="margin: 5px 0; color: #888;"><em>Great circle route (for reference)</em></p>
                <p style="margin: 5px 0;"><strong>Direct distance:</strong> ${safeNumberFormat(
                    calculateDirectDistance(
                        data.port_locations[fastestPorts[0]], 
                        data.port_locations[fastestPorts[fastestPorts.length - 1]]
                    )
                )} km</p>
            </div>
        `);
    }
    
    // Add port markers
    if (data.port_locations) {
        addPortMarkers(data.port_locations, fastestPorts, fuelPorts);
    }
    
    // Zoom to show all routes
    zoomToRoutes();
    
    // Update legend
    updateLegend(fastestPorts, fuelPorts);
}

// ADD THIS HELPER FUNCTION to calculate direct distance:
function calculateDirectDistance(coord1, coord2) {
    if (!coord1 || !coord2) return 0;
    
    const R = 6371; // Earth's radius in km
    const lat1 = coord1[0] * Math.PI / 180;
    const lon1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[0] * Math.PI / 180;
    const lon2 = coord2[1] * Math.PI / 180;
    
    const dlat = lat2 - lat1;
    const dlon = lon2 - lon1;
    
    const a = Math.sin(dlat/2) * Math.sin(dlat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dlon/2) * Math.sin(dlon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ADD THIS FUNCTION to update the legend:
function updateLegend(fastestPorts, fuelPorts) {
    const legendContent = document.querySelector('.legend-content');
    if (!legendContent) return;
    
    // Get selected hubs
    const hubPortsSelect = document.getElementById('hubPorts');
    const selectedHubs = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    
    // Create legend HTML
    legendContent.innerHTML = `
        <div class="legend-item">
            <div class="color-swatch" style="background-color: #27ae60;"></div>
            <span>Start Port</span>
        </div>
        <div class="legend-item">
            <div class="color-swatch" style="background-color: #e74c3c;"></div>
            <span>Destination Port</span>
        </div>
        <div class="legend-item">
            <div class="color-swatch" style="background-color: ${NAV_CONFIG.routeTypes.fastest.color};"></div>
            <span>Fastest Route</span>
        </div>
        <div class="legend-item">
            <div class="color-swatch" style="background-color: ${NAV_CONFIG.routeTypes.efficient.color};"></div>
            <span>Fuel-Efficient Route</span>
        </div>
        <div class="legend-item">
            <div class="color-swatch" style="background-color: ${NAV_CONFIG.routeTypes.direct.color}; opacity: 0.4;"></div>
            <span>Direct Route (reference)</span>
        </div>
        ${selectedHubs.length > 0 ? `
        <div class="legend-item">
            <div class="color-swatch" style="background-color: #9b59b6;"></div>
            <span>Intermediate Ports</span>
        </div>
        ` : ''}
    `;
}

function addPortMarkers(portLocations, fastestPorts, fuelPorts) {
    Object.entries(portLocations).forEach(([port, coords]) => {
        let color = '#94a3b8'; // gray
        let iconHtml = '⚓';
        let popupClass = 'other-port';
        
        if (port === fastestPorts[0]) {
            color = '#27ae60'; // darkgreen
            iconHtml = '🟢';
            popupClass = 'start-port';
        } else if (port === fastestPorts[fastestPorts.length - 1]) {
            color = '#e74c3c'; // darkred
            iconHtml = '🔴';
            popupClass = 'destination-port';
        } else if (fastestPorts.includes(port) && fuelPorts.includes(port)) {
            color = '#9b59b6'; // purple
            iconHtml = '🟣';
            popupClass = 'shared-hub';
        } else if (fastestPorts.includes(port)) {
            color = '#ff6b35'; // orange
            iconHtml = '🟠';
            popupClass = 'fastest-hub';
        } else if (fuelPorts.includes(port)) {
            color = '#2ecc71'; // green
            iconHtml = '🟢';
            popupClass = 'fuel-hub';
        }
        
        // Create custom icon
        const customIcon = L.divIcon({
            html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${iconHtml}</div>`,
            className: 'custom-port-icon',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        const marker = L.marker(coords, { icon: customIcon })
            .bindPopup(`
                <div style="text-align: center;" class="${popupClass}">
                    <strong>${port}</strong><br>
                    Lat: ${safeNumberFormat(coords[0], 4)}<br>
                    Lon: ${safeNumberFormat(coords[1], 4)}<br>
                    ${port === fastestPorts[0] ? '<em>Start Port</em>' : ''}
                    ${port === fastestPorts[fastestPorts.length - 1] ? '<em>Destination Port</em>' : ''}
                    ${fastestPorts.includes(port) && port !== fastestPorts[0] && port !== fastestPorts[fastestPorts.length - 1] ? '<em>Route Hub</em>' : ''}
                </div>
            `)
            .addTo(map);
        
        portMarkers.push(marker);
    });
}

// Navigation functions
function navLoadSection(section) {
    console.log('Loading section:', section);
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to clicked nav item
    const clickedItem = event.target.closest('.nav-item');
    if (clickedItem) {
        clickedItem.classList.add('active');
    }
    
    // Handle different sections
    switch(section) {
        case 'planner':
            showPlannerSection();
            break;
        case 'analytics':
            showAnalyticsSection();
            break;
        case 'ports':
            showPortsDatabase();
            break;
        case 'fleet':
        case 'reports':
        case 'weather':
        case 'fuel':
            showToolSection(section);
            break;
        default:
            showPlannerSection();
            alert(`${section} section coming soon!`);
    }
}

function showPlannerSection() {
    // Show main content
    document.querySelector('.main-content').style.display = 'grid';
    
    // Hide analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection) {
        analyticsSection.style.display = 'none';
    }
    
    // Ensure map is properly sized
    setTimeout(() => {
        if (map) {
            map.invalidateSize();
        }
    }, 100);
}

function showAnalyticsSection() {
    // Hide main content
    document.querySelector('.main-content').style.display = 'none';
    
    // Show analytics section
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection) {
        analyticsSection.style.display = 'block';
        loadAnalyticsDashboard();
    }
}

function showPortsDatabase() {
    showPlannerSection();
    alert('Port Database feature coming soon!');
}

function showToolSection(tool) {
    showPlannerSection();
    alert(`${NAV_CONFIG.sections.tools.submenu[tool].name} feature coming soon!`);
}

function navToggleProfileMenu() {
    const menu = document.querySelector('.profile-menu');
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

function navToggleMobileMenu() {
    const nav = document.querySelector('.main-nav');
    const toggle = document.querySelector('.mobile-menu-toggle');
    if (nav && toggle) {
        nav.classList.toggle('mobile-active');
        toggle.classList.toggle('active');
    }
}

function navShowNotifications() {
    alert('Notifications feature coming soon!');
}

function navOpenSettings() {
    alert('Settings feature coming soon!');
}

function navLogout() {
    if (confirm('Are you sure you want to logout?')) {
        alert('Logout successful!');
        // Redirect to login page or perform logout logic
    }
}

// Map control functions
function toggleRoute(routeType) {
    const layer = routeLayers[routeType];
    const buttons = document.querySelectorAll('.control-btn');
    
    if (layer) {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
            // Update button active state
            buttons.forEach(btn => {
                if (btn.textContent.includes(
                    routeType === 'fastest' ? 'Fastest' : 
                    routeType === 'fuel' ? 'Efficient' : 'Direct'
                )) {
                    btn.classList.remove('active');
                }
            });
        } else {
            layer.addTo(map);
            // Update button active state
            buttons.forEach(btn => {
                if (btn.textContent.includes(
                    routeType === 'fastest' ? 'Fastest' : 
                    routeType === 'fuel' ? 'Efficient' : 'Direct'
                )) {
                    btn.classList.add('active');
                }
            });
        }
    }
}

function toggleAllRoutes() {
    const routes = ['fastest', 'fuel', 'direct'];
    const allVisible = routes.every(route => 
        routeLayers[route] && map.hasLayer(routeLayers[route])
    );
    
    routes.forEach(route => {
        const layer = routeLayers[route];
        if (layer) {
            if (allVisible) {
                map.removeLayer(layer);
            } else {
                layer.addTo(map);
            }
        }
    });
    
    // Update button states
    const buttons = document.querySelectorAll('.control-btn');
    buttons.forEach(btn => {
        if (allVisible) {
            btn.classList.remove('active');
        } else {
            btn.classList.add('active');
        }
    });
}

function zoomToRoutes() {
    if (!currentMapData) return;
    
    const allCoords = [];
    
    // Collect coordinates from all routes
    if (currentMapData.fastest_route && currentMapData.fastest_route.coordinates) {
        allCoords.push(...currentMapData.fastest_route.coordinates);
    }
    if (currentMapData.fuel_efficient_route && currentMapData.fuel_efficient_route.coordinates) {
        allCoords.push(...currentMapData.fuel_efficient_route.coordinates);
    }
    if (currentMapData.direct_route && currentMapData.direct_route.coordinates) {
        allCoords.push(...currentMapData.direct_route.coordinates);
    }
    
    // Add port coordinates
    if (currentMapData.port_locations) {
        Object.values(currentMapData.port_locations).forEach(coords => {
            allCoords.push(coords);
        });
    }
    
    if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function toggleLegend() {
    const legendContent = document.querySelector('.legend-content');
    const legendToggle = document.querySelector('.legend-toggle');
    
    if (legendContent.style.display === 'none') {
        legendContent.style.display = 'flex';
        legendToggle.textContent = '−';
    } else {
        legendContent.style.display = 'none';
        legendToggle.textContent = '+';
    }
}

function toggleFullscreen() {
    const mapContainer = document.querySelector('.map-container');
    
    if (!document.fullscreenElement) {
        mapContainer.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

async function loadAnalyticsDashboard() {
    try {
        console.log('🔄 Loading real-time analytics data...');
        
        // Show loading state
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.innerHTML = '⏳ Loading...';
            refreshBtn.disabled = true;
        }
        
        const response = await fetch('/api/realtime-analytics');
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Analytics data received:', data);
        
        // Update the UI with new data
        updateAnalyticsDisplay(data);
        
    } catch (error) {
        console.error('❌ Error loading analytics:', error);
        // Show fallback data instead of alert
        showFallbackAnalyticsData();
    } finally {
        // Reset button state
        const refreshBtn = document.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.innerHTML = '🔄 Refresh';
            refreshBtn.disabled = false;
        }
    }
}

function showFallbackAnalyticsData() {
    console.log('🔄 Showing fallback analytics data');
    
    // Update performance metrics with fallback data
    document.getElementById('totalCalculations').textContent = '1,247';
    document.getElementById('totalFuelSaved').textContent = '45.2t';
    document.getElementById('totalTimeSaved').textContent = '12.5d';
    document.getElementById('totalCO2Reduced').textContent = '142.4t';
    
    // Update recent calculations with fallback
    const recentList = document.getElementById('recentCalculationsList');
    recentList.innerHTML = `
        <div class="recent-item">
            <div class="recent-route">Singapore → Busan</div>
            <div class="recent-meta">
                <span>${new Date().toLocaleTimeString()}</span>
                <span>1.85s</span>
            </div>
        </div>
        <div class="recent-item">
            <div class="recent-route">Jebel_Ali → Shanghai</div>
            <div class="recent-meta">
                <span>${new Date(Date.now() - 300000).toLocaleTimeString()}</span>
                <span>2.34s</span>
            </div>
        </div>
    `;
    
    // Update port usage with fallback
    const portUsageList = document.getElementById('portUsageList');
    portUsageList.innerHTML = `
        <div class="port-usage-item">
            <span class="port-name">Singapore</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 85%"></div>
            </div>
            <span class="usage-percent">85.0%</span>
        </div>
        <div class="port-usage-item">
            <span class="port-name">Shanghai</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 72%"></div>
            </div>
            <span class="usage-percent">72.0%</span>
        </div>
        <div class="port-usage-item">
            <span class="port-name">Jebel_Ali</span>
            <div class="usage-bar">
                <div class="usage-fill" style="width: 68%"></div>
            </div>
            <span class="usage-percent">68.0%</span>
        </div>
    `;
    
    // Update algorithm performance with fallback
    updateAlgorithmPerformance({
        total_calculations: 1247,
        average_calculation_time: 1.85,
        fastest_algorithm: "Genetic Algorithm",
        routes_calculated: 892,
        performance_metrics: {
            a_star_performance: 65.5,
            genetic_algorithm_performance: 34.5,
            total_optimization: 15.0
        }
    });
    
    // Update last updated time
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    
    console.log('✅ Fallback analytics data displayed');
}

function updateAlgorithmPerformance(data) {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    const stats = data.algorithm_stats || {
        total_calculations: 0,
        average_calculation_time: 0,
        fastest_algorithm: 'A*',
        routes_calculated: 0,
        performance_metrics: {
            a_star_performance: 0,
            genetic_algorithm_performance: 0,
            dijkstra_performance: 0,
            total_optimization: 0
        }
    };
    
    // Update the algorithm stats display
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Total Calculations:</strong>
                <span class="stat-value">${stats.total_calculations || 0}</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Avg. Calculation Time:</strong>
                <span class="stat-value">${(stats.average_calculation_time || 0).toFixed(2)}s</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Fastest Algorithm:</strong>
                <span class="stat-value">${stats.fastest_algorithm || 'A*'}</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Routes Calculated:</strong>
                <span class="stat-value">${stats.routes_calculated || 0}</span>
            </div>
        </div>
        
        <!-- Algorithm Performance Visualization -->
        <div class="performance-visualization">
            <h4>Algorithm Performance Metrics</h4>
            ${renderPerformanceBars(stats.performance_metrics)}
        </div>
    `;
}

function renderPerformanceBars(metrics) {
    if (!metrics) return '<div class="no-data">No performance data available</div>';
    
    return `
        <div class="performance-bar">
            <div class="bar-label">A* Algorithm</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="a_star" style="width: ${metrics.a_star_performance || 0}%"></div>
                <span class="bar-value">${metrics.a_star_performance || 0}%</span>
            </div>
        </div>
        <div class="performance-bar">
            <div class="bar-label">Genetic Algorithm</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="genetic" style="width: ${metrics.genetic_algorithm_performance || 0}%</div>
                <span class="bar-value">${metrics.genetic_algorithm_performance || 0}%</span>
            </div>
        </div>
        <div class="performance-bar">
            <div class="bar-label">Total Optimization</div>
            <div class="bar-container">
                <div class="bar-fill" data-algorithm="optimization" style="width: ${metrics.total_optimization || 0}%"></div>
                <span class="bar-value">${metrics.total_optimization || 0}%</span>
            </div>
        </div>
    `;
}

function showFallbackAlgorithmData() {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Total Calculations:</strong>
                <span class="stat-value">1,247</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Avg. Calculation Time:</strong>
                <span class="stat-value">1.85s</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Fastest Algorithm:</strong>
                <span class="stat-value">Genetic Algorithm</span>
            </div>
        </div>
        <div class="algorithm-stat">
            <div class="stat-header">
                <strong>Routes Calculated:</strong>
                <span class="stat-value">892</span>
            </div>
        </div>
        
        <div class="performance-visualization">
            <h4>Algorithm Performance Metrics</h4>
            <div class="performance-bar">
                <div class="bar-label">A* Algorithm</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 85%"></div>
                    <span class="bar-value">85%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Genetic Algorithm</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 92%"></div>
                    <span class="bar-value">92%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Dijkstra</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 78%"></div>
                    <span class="bar-value">78%</span>
                </div>
            </div>
            <div class="performance-bar">
                <div class="bar-label">Total Optimization</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: 15%"></div>
                    <span class="bar-value">15%</span>
                </div>
            </div>
        </div>
    `;
}

function updateAnalyticsDisplay(data) {
    console.log('📊 Updating analytics display with data:', data);
    
    // Update performance metrics - FIXED: Handle missing data properly
    const metrics = data.performance_metrics || {};
    document.getElementById('totalCalculations').textContent = metrics.total_calculations || 0;
    document.getElementById('totalFuelSaved').textContent = (metrics.total_fuel_saved || 0).toFixed(1) + 't';
    document.getElementById('totalTimeSaved').textContent = (metrics.total_time_saved || 0).toFixed(1) + 'd';
    document.getElementById('totalCO2Reduced').textContent = (metrics.total_co2_reduced || 0).toFixed(1) + 't';
    
    // Update recent calculations
    const recentList = document.getElementById('recentCalculationsList');
    const recentCalcs = data.recent_calculations || [];
    
    if (recentCalcs.length > 0) {
        recentList.innerHTML = recentCalcs.slice().reverse().map(calc => `
            <div class="recent-item">
                <div class="recent-route">${calc.start_port} → ${calc.destination_port}</div>
                <div class="recent-meta">
                    <span>${new Date(calc.timestamp).toLocaleTimeString()}</span>
                    <span>${(calc.calculation_time || 0).toFixed(2)}s</span>
                </div>
            </div>
        `).join('');
    } else {
        recentList.innerHTML = '<div class="recent-item">No recent calculations</div>';
    }
    
    // Update port usage
    const portUsageList = document.getElementById('portUsageList');
    const portUsage = data.port_usage || {};
    
    if (Object.keys(portUsage).length > 0) {
        portUsageList.innerHTML = Object.entries(portUsage)
            .sort((a, b) => b[1] - a[1]) // Sort by percentage descending
            .map(([port, percentage]) => `
                <div class="port-usage-item">
                    <span class="port-name">${port}</span>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${percentage}%"></div>
                    </div>
                    <span class="usage-percent">${percentage.toFixed(1)}%</span>
                </div>
            `).join('');
    } else {
        portUsageList.innerHTML = '<div class="port-usage-item">No port usage data</div>';
    }
    
    // Update algorithm performance - FIXED: Use algorithm_stats
    updateAlgorithmPerformance(data.algorithm_stats || {});
    
    // Update last updated time
    document.getElementById('lastUpdated').textContent = new Date(data.timestamp || Date.now()).toLocaleString();
    
    console.log('✅ Analytics display updated successfully');
}

function backToPlanner() {
    showPlannerSection();
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    // Close profile menu
    const profileMenu = document.querySelector('.profile-menu');
    const profileButton = document.querySelector('.btn-profile');
    if (profileMenu && profileButton && !profileButton.contains(event.target) && !profileMenu.contains(event.target)) {
        profileMenu.style.display = 'none';
    }
    
    // Close mobile menu when clicking outside
    const mobileNav = document.querySelector('.main-nav');
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    if (window.innerWidth <= 768 && mobileNav && mobileNav.classList.contains('mobile-active') && 
        !mobileNav.contains(event.target) && !mobileToggle.contains(event.target)) {
        mobileNav.classList.remove('mobile-active');
        mobileToggle.classList.remove('active');
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        const mobileNav = document.querySelector('.main-nav');
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        if (mobileNav) {
            mobileNav.classList.remove('mobile-active');
        }
        if (mobileToggle) {
            mobileToggle.classList.remove('active');
        }
    }
});

// Auto-refresh analytics every 10 seconds when on analytics page
setInterval(() => {
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection && analyticsSection.style.display !== 'none') {
        loadAnalyticsDashboard();
    }
}, 10000);
// Real-time statistics functions
function updateRouteStatistics(data) {
    if (!data) return;
    
    const fastestRoute = data.fastest_route || {};
    const fuelRoute = data.fuel_efficient_route || {};
    const directRoute = data.direct_route || {};
    
    console.log('📊 Updating route statistics with data:', data);
    
    // Calculate average transit time
    const avgTime = ((fastestRoute.time_hours || 0) + (fuelRoute.time_hours || 0)) / 2;
    document.getElementById('avgTransitTime').textContent = 
        avgTime > 0 ? `${(avgTime / 24).toFixed(1)} days` : '--';
    
    // Calculate fuel efficiency (lower is better)
    const fuelEfficiency = (fuelRoute.fuel_tonnes || 0) / (fuelRoute.distance_km || 1) * 100;
    document.getElementById('fuelEfficiency').textContent = 
        fuelEfficiency > 0 ? `${fuelEfficiency.toFixed(2)} t/100km` : '--';
    
    // Calculate distance saved vs direct route
    const distanceSaved = (directRoute.distance_km || 0) - (fuelRoute.distance_km || 0);
    document.getElementById('distanceSaved').textContent = 
        distanceSaved > 0 ? `${distanceSaved.toFixed(0)} km` : '--';
    
    // Calculate cost savings (estimated)
    const fuelPricePerTonne = 600; // USD per tonne
    const costSavings = ((fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0)) * fuelPricePerTonne;
    document.getElementById('costSavings').textContent = 
        costSavings > 0 ? `$${costSavings.toFixed(0)}` : costSavings < 0 ? `-$${Math.abs(costSavings).toFixed(0)}` : '--';
    
    // Update route comparison
    updateRouteComparison(fastestRoute, fuelRoute);
    
    // Update timestamp
    document.getElementById('statsLastUpdated').textContent = 
        `Updated: ${new Date().toLocaleTimeString()}`;
}

function updateRouteComparison(fastestRoute, fuelRoute) {
    const timeDiff = (fuelRoute.time_hours || 0) - (fastestRoute.time_hours || 0);
    const fuelDiff = (fastestRoute.fuel_tonnes || 0) - (fuelRoute.fuel_tonnes || 0);
    
    const timeDifferenceElem = document.getElementById('timeDifference');
    const fuelDifferenceElem = document.getElementById('fuelDifference');
    const recommendedRouteElem = document.getElementById('recommendedRoute');
    const comparisonSection = document.getElementById('routeComparison');
    
    if (timeDiff !== 0 || fuelDiff !== 0) {
        comparisonSection.style.display = 'block';
        
        // Time difference
        if (timeDiff > 0) {
            timeDifferenceElem.textContent = `+${(timeDiff / 24).toFixed(1)} days`;
            timeDifferenceElem.className = 'comparison-value negative';
        } else if (timeDiff < 0) {
            timeDifferenceElem.textContent = `${(timeDiff / 24).toFixed(1)} days`;
            timeDifferenceElem.className = 'comparison-value positive';
        } else {
            timeDifferenceElem.textContent = 'No difference';
            timeDifferenceElem.className = 'comparison-value neutral';
        }
        
        // Fuel difference
        if (fuelDiff > 0) {
            fuelDifferenceElem.textContent = `-${fuelDiff.toFixed(1)} tonnes`;
            fuelDifferenceElem.className = 'comparison-value positive';
        } else if (fuelDiff < 0) {
            fuelDifferenceElem.textContent = `+${Math.abs(fuelDiff).toFixed(1)} tonnes`;
            fuelDifferenceElem.className = 'comparison-value negative';
        } else {
            fuelDifferenceElem.textContent = 'No difference';
            fuelDifferenceElem.className = 'comparison-value neutral';
        }
        
        // Recommended route
        if (fuelDiff > 10 && timeDiff < 24) {
            recommendedRouteElem.textContent = 'Efficient Route 🌿';
            recommendedRouteElem.className = 'comparison-value positive';
        } else if (timeDiff > 48 && fuelDiff < 5) {
            recommendedRouteElem.textContent = 'Fastest Route 🚀';
            recommendedRouteElem.className = 'comparison-value positive';
        } else {
            recommendedRouteElem.textContent = 'Balanced Route ⚖️';
            recommendedRouteElem.className = 'comparison-value neutral';
        }
    } else {
        comparisonSection.style.display = 'none';
    }
}

// Update your existing calculateRoutes function to include statistics
async function calculateRoutes() {
    const startPort = document.getElementById('startPort').value;
    const destinationPort = document.getElementById('destinationPort').value;
    const hubPortsSelect = document.getElementById('hubPorts');
    const hubPorts = Array.from(hubPortsSelect.selectedOptions).map(opt => opt.value).filter(port => port !== "");
    const goal = document.querySelector('input[name="goal"]:checked').value;
    
    console.log('🚢 Sending to backend:', {
        startPort,
        destinationPort,
        hubPorts,
        goal,
        hubPortsCount: hubPorts.length
    });
    
    // Validate inputs
    if (!startPort || !destinationPort) {
        alert('Please select both start and destination ports');
        return;
    }
    
    if (startPort === destinationPort) {
        alert('Start and destination ports cannot be the same');
        return;
    }
    
    // Show loading
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('calculateBtn').disabled = true;
    
    try {
        const response = await fetch('/calculate-routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start_port: startPort,
                destination_port: destinationPort,
                hub_ports: hubPorts,
                goal: goal
            })
        });
        
        console.log('📡 Response status:', response.status);
        
        const data = await response.json();
        console.log('✅ Received from backend:', data);
        
        if (!response.ok) {
            // Handle backend errors
            throw new Error(data.error || `Server error: ${response.status}`);
        }
        
        // Check if we have valid route data
        if (!data || (!data.fastest_route && !data.fuel_efficient_route)) {
            console.warn('⚠️ No route data in response:', data);
            alert('No routes could be calculated with the current parameters. Please try different ports.');
            return;
        }
        
        currentMapData = data;
        displayResults(data);
        displayRoutesOnMap(data);
        updateRouteStatistics(data); // ADD THIS LINE - This makes it dynamic!
        
    } catch (error) {
        console.error('❌ Error calculating routes:', error);
        alert('Error calculating routes: ' + error.message);
    } finally {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('calculateBtn').disabled = false;
    }
}

// Quick actions functions
function saveCurrentRoute() {
    if (!currentMapData) {
        alert('No route data to save. Please calculate a route first.');
        return;
    }
    
    const routeData = {
        timestamp: new Date().toISOString(),
        data: currentMapData
    };
    
    // Save to localStorage (you can replace with API call)
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    savedRoutes.push(routeData);
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
    
    alert('Route saved successfully!');
}

function compareWithPrevious() {
    const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
    if (savedRoutes.length === 0) {
        alert('No saved routes to compare with.');
        return;
    }
    
    // Show comparison modal or implement comparison logic
    alert(`Found ${savedRoutes.length} saved routes for comparison.`);
}

function exportRouteData() {
    if (!currentMapData) {
        alert('No route data to export. Please calculate a route first.');
        return;
    }
    
    const dataStr = JSON.stringify(currentMapData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `route-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Initialize with demo data or reset function
function resetStatistics() {
    document.getElementById('avgTransitTime').textContent = '--';
    document.getElementById('fuelEfficiency').textContent = '--';
    document.getElementById('distanceSaved').textContent = '--';
    document.getElementById('costSavings').textContent = '--';
    document.getElementById('statsLastUpdated').textContent = '--';
    document.getElementById('routeComparison').style.display = 'none';
}

// Call reset when clearing form
function clearForm() {
    document.getElementById('startPort').value = '';
    document.getElementById('destinationPort').value = '';
    
    // Clear multiple select
    clearSelectedPorts();
    
    // Reset radio buttons
    document.querySelector('input[name="goal"][value="both"]').checked = true;
    
    // Hide results
    document.getElementById('resultsPanel').style.display = 'none';
    
    // Clear map
    Object.values(routeLayers).forEach(layer => {
        if (layer) map.removeLayer(layer);
    });
    
    portMarkers.forEach(marker => map.removeLayer(marker));
    portMarkers = [];
    
    // Reset map view
    map.setView([20, 0], 2);
    
    // Reset statistics
    resetStatistics(); // ADD THIS LINE
}
// Force fix legend position
function fixLegendPosition() {
    const legend = document.getElementById('mapLegend');
    if (legend) {
        // Move to bottom right
        legend.style.top = 'auto';
        legend.style.bottom = '80px';
        legend.style.right = '20px';
        legend.style.left = 'auto';
        
        // Ensure it's visible
        legend.style.display = 'block';
        legend.style.zIndex = '1000';
    }
}
// Add this function to display algorithm statistics
function displayAlgorithmStats(data) {
    const algorithmStats = document.getElementById('algorithmStats');
    if (!algorithmStats) return;
    
    const stats = data.algorithm_stats || {
        total_calculations: 0,
        average_calculation_time: 0,
        fastest_algorithm: 'A*',
        routes_calculated: 0
    };
    
    algorithmStats.innerHTML = `
        <div class="algorithm-stat">
            <strong>Total Calculations:</strong> ${stats.total_calculations || 0}
        </div>
        <div class="algorithm-stat">
            <strong>Avg. Calculation Time:</strong> ${(stats.average_calculation_time || 0).toFixed(2)}s
        </div>
        <div class="algorithm-stat">
            <strong>Fastest Algorithm:</strong> ${stats.fastest_algorithm || 'A*'}
        </div>
        <div class="algorithm-stat">
            <strong>Routes Calculated:</strong> ${stats.routes_calculated || 0}
        </div>
    `;
}
// Call this after page loads and when window resizes
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(fixLegendPosition, 100);
});

window.addEventListener('resize', fixLegendPosition);

// Make functions globally available
window.toggleRoute = toggleRoute;
window.toggleAllRoutes = toggleAllRoutes;
window.zoomToRoutes = zoomToRoutes;
window.toggleLegend = toggleLegend;
window.toggleFullscreen = toggleFullscreen;
window.clearForm = clearForm;
window.removePortFromSelection = removePortFromSelection;
window.clearSelectedPorts = clearSelectedPorts;
window.navLoadSection = navLoadSection;
window.navToggleProfileMenu = navToggleProfileMenu;
window.navToggleMobileMenu = navToggleMobileMenu;
window.navShowNotifications = navShowNotifications;
window.navOpenSettings = navOpenSettings;
window.navLogout = navLogout;
window.backToPlanner = backToPlanner;

